import { createReadStream, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { derivePostcodeFields, UK_OUTWARD_CODE } from '../../validation/postcode';
import { REPO_ROOT, loadFloodSource } from './flood-paths';

/**
 * The inward part of a source postcode: a full unit ("5AB") or a partial one ending in "*"
 * ("5A*"), which the Environment Agency uses for grouped postcode units.
 */
const SOURCE_INWARD_CODE = /^[0-9][A-Z*]{2}$/;

// `npm run flood:aggregate`: reduce the Environment Agency's "Postcodes in Areas at Risk" file
// (~270k postcodes, ~17 MB, not committed) to one row per postcode district (small, committed).
// Offline, authoring-time only: the Lambda never reads this data.

export interface FloodDistrict {
  district: string;
  /** Postcodes in the source file for this district (only postcodes in or near flood areas are listed). */
  postcodes: number;
  /** Residential properties in those postcodes. */
  residentialProperties: number;
  residentialHigh: number;
  residentialMedium: number;
  /** residentialHigh / residentialProperties, 4 dp. */
  highShare: number;
  mediumShare: number;
}

export interface AggregateResult {
  districts: FloodDistrict[];
  rowsRead: number;
  /** Rows with a partial postcode such as "PR2 5P*": counted, because the district is still known. */
  partialPostcodes: number;
  /** Rows whose PC has no valid outward code (e.g. "VBN0094*"), skipped. */
  rowsSkipped: number;
}

const REQUIRED_COLUMNS = ['PC', 'RES_cntpc', 'RES_CNT_High', 'RES_CNT_Medium'] as const;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** Splits one CSV line, honouring double-quoted fields ("" is an escaped quote). */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      fields.push(current);
      current = '';
    } else current += char;
  }
  fields.push(current);
  return fields;
}

/** Aggregates the raw rows (header first) by postcode district. Pure apart from consuming the iterable. */
export async function aggregateFloodLines(lines: AsyncIterable<string> | Iterable<string>): Promise<AggregateResult> {
  let columns: Map<string, number> | undefined;
  const byDistrict = new Map<string, Omit<FloodDistrict, 'highShare' | 'mediumShare'>>();
  let rowsRead = 0;
  let rowsSkipped = 0;
  let partialPostcodes = 0;

  for await (const rawLine of lines) {
    const line = rawLine.replace(/^﻿/, '').trim();
    if (line === '') continue;
    const cells = splitCsvLine(line);
    if (columns === undefined) {
      columns = new Map(cells.map((name, index) => [name.trim(), index]));
      const missing = REQUIRED_COLUMNS.filter((name) => !columns?.has(name));
      if (missing.length > 0) throw new Error(`Flood file is missing columns: ${missing.join(', ')}`);
      continue;
    }
    rowsRead += 1;
    const cell = (name: (typeof REQUIRED_COLUMNS)[number]) => cells[columns?.get(name) ?? -1] ?? '';
    const postcode = cell('PC').trim().toUpperCase();
    const [outward = '', inward = '', ...extra] = postcode.split(/\s+/);
    if (extra.length > 0 || !UK_OUTWARD_CODE.test(outward) || !SOURCE_INWARD_CODE.test(inward)) {
      rowsSkipped += 1;
      continue;
    }
    if (inward.includes('*')) partialPostcodes += 1;
    const count = (name: (typeof REQUIRED_COLUMNS)[number]) => {
      const value = Number(cell(name));
      if (!Number.isFinite(value) || value < 0) throw new Error(`Bad ${name} "${cell(name)}" for ${cell('PC')}`);
      return value;
    };
    const { postcodeDistrict } = derivePostcodeFields(postcode);
    const totals = byDistrict.get(postcodeDistrict) ?? {
      district: postcodeDistrict,
      postcodes: 0,
      residentialProperties: 0,
      residentialHigh: 0,
      residentialMedium: 0,
    };
    totals.postcodes += 1;
    totals.residentialProperties += count('RES_cntpc');
    totals.residentialHigh += count('RES_CNT_High');
    totals.residentialMedium += count('RES_CNT_Medium');
    byDistrict.set(postcodeDistrict, totals);
  }
  if (columns === undefined) throw new Error('Flood file is empty');

  const districts = [...byDistrict.values()]
    .filter((d) => d.residentialProperties > 0)
    .map((d) => ({
      ...d,
      highShare: round4(d.residentialHigh / d.residentialProperties),
      mediumShare: round4(d.residentialMedium / d.residentialProperties),
    }))
    .sort((a, b) => a.district.localeCompare(b.district, 'en', { numeric: true }));
  return { districts, rowsRead, partialPostcodes, rowsSkipped };
}

export const FLOOD_DISTRICTS_HEADER =
  'district,postcodes,residential_properties,residential_high,residential_medium,high_share,medium_share';

export function toFloodDistrictsCsv(districts: readonly FloodDistrict[]): string {
  const rows = districts.map((d) =>
    [d.district, d.postcodes, d.residentialProperties, d.residentialHigh, d.residentialMedium, d.highShare, d.mediumShare].join(','),
  );
  return `${[FLOOD_DISTRICTS_HEADER, ...rows].join('\n')}\n`;
}

function findRawFile(dir: string): string | undefined {
  if (!existsSync(dir)) return undefined;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      const found = findRawFile(full);
      if (found) return found;
    } else if (/PostcodesAtRisk.*\.csv$/i.test(entry)) return full;
  }
  return undefined;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { input: { type: 'string' }, output: { type: 'string' } } });
  const rawDir = path.join(REPO_ROOT, 'data', 'raw', 'flood');
  const input = values.input ?? findRawFile(rawDir);
  if (input === undefined) {
    throw new Error(`No *PostcodesAtRisk*.csv found under ${rawDir}. Download and unzip the dataset (see data/flood-source.json).`);
  }
  const output = values.output ?? path.join(REPO_ROOT, 'data', 'flood-districts.csv');
  const source = loadFloodSource();

  const lines = createInterface({ input: createReadStream(input, 'utf8'), crlfDelay: Infinity });
  const result = await aggregateFloodLines(lines);
  writeFileSync(output, toFloodDistrictsCsv(result.districts));

  const meta = {
    source,
    rawFile: path.relative(REPO_ROOT, input).split(path.sep).join('/'),
    rawFileModified: statSync(input).mtime.toISOString().slice(0, 10),
    aggregatedOn: new Date().toISOString().slice(0, 10),
    rowsRead: result.rowsRead,
    partialPostcodes: result.partialPostcodes,
    rowsSkipped: result.rowsSkipped,
    districts: result.districts.length,
  };
  writeFileSync(output.replace(/\.csv$/, '.meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(
    `Read ${result.rowsRead.toLocaleString('en-GB')} rows (${result.partialPostcodes.toLocaleString('en-GB')} partial postcodes like "PR2 5P*" kept; ` +
      `${result.rowsSkipped} skipped with no valid outward code) → ` +
      `${result.districts.length.toLocaleString('en-GB')} districts in ${path.relative(REPO_ROOT, output)}`,
  );
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
