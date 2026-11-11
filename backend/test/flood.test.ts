import { readFileSync } from 'node:fs';
import path from 'node:path';
import { aggregateFloodLines, splitCsvLine, toFloodDistrictsCsv } from '../src/analysis/flood/aggregate';
import { loadFloodSource } from '../src/analysis/flood/flood-paths';
import {
  assignFloodTiers,
  buildFloodProposal,
  floodSuggestionConfigSchema,
  parseFloodDistrictsCsv,
  type FloodSuggestionConfig,
} from '../src/analysis/flood/suggest';
import { scoreQuote } from '../src/engine/score-quote';
import { knowledgeBaseSchema } from '../src/kb/kb.schema';
import { lintKnowledgeBase } from '../src/kb/lint-kb';
import { quoteRequestSchema } from '../src/validation/quote-request.schema';
import { loadRealKb, restoreRealKb } from './helpers';

afterEach(restoreRealKb);

const fixtureLines = () =>
  readFileSync(path.join(__dirname, 'fixtures', 'flood', 'raw-sample.csv'), 'utf8').split(/\r?\n/);

const config: FloodSuggestionConfig = floodSuggestionConfigSchema.parse({
  group: 'flood_risk',
  metric: 'highShare',
  minResidentialProperties: 50,
  tiers: [
    { id: 'flood_high', description: 'High flood-risk district', minShare: 0.2, points: 25 },
    { id: 'flood_moderate', description: 'Moderate flood-risk district', minShare: 0.05, maxShare: 0.2, points: 10 },
  ],
});

describe('flood:aggregate', () => {
  it('groups residential counts by postcode district, keeping partial postcodes and skipping non-postcodes', async () => {
    const result = await aggregateFloodLines(fixtureLines());
    expect(result).toMatchObject({ rowsRead: 9, partialPostcodes: 1, rowsSkipped: 1 });
    expect(result.districts.map((d) => d.district)).toEqual(['B1', 'B10', 'E1', 'EX4', 'PE24', 'SW1A']); // NR1 has no homes
    expect(result.districts.find((d) => d.district === 'EX4')).toEqual({
      district: 'EX4',
      postcodes: 2, // "EX4 1AA" and the partial "EX4 2B*"
      residentialProperties: 100,
      residentialHigh: 20,
      residentialMedium: 15,
      highShare: 0.2,
      mediumShare: 0.15,
    });
    // B1 and B10 are separate districts; "E1" is not swallowed by "EX4".
    expect(result.districts.find((d) => d.district === 'B1')?.highShare).toBe(0.25);
    expect(result.districts.find((d) => d.district === 'B10')?.highShare).toBe(0);
    expect(result.districts.find((d) => d.district === 'E1')?.residentialProperties).toBe(100);
  });

  it('round-trips through data/flood-districts.csv format', async () => {
    const { districts } = await aggregateFloodLines(fixtureLines());
    expect(parseFloodDistrictsCsv(toFloodDistrictsCsv(districts))).toEqual(districts);
  });

  it('rejects a file without the expected columns', async () => {
    await expect(aggregateFloodLines(['PC,total', 'EX4 1AA,3'])).rejects.toThrow('missing columns: RES_cntpc');
  });

  it('splits quoted CSV fields', () => {
    expect(splitCsvLine('"EX4 1AA","a ""quoted"", value",3')).toEqual(['EX4 1AA', 'a "quoted", value', '3']);
  });
});

describe('tier assignment', () => {
  it('puts each eligible district in the first tier whose [min, max) range contains its share', async () => {
    const { districts } = await aggregateFloodLines(fixtureLines());
    const tiers = assignFloodTiers(districts, config);
    // EX4 is exactly 20%: minShare is inclusive, so it is "high", not "moderate". B1 (25%) has only 40 homes.
    expect(tiers.map((t) => [t.tier.id, t.districts])).toEqual([
      ['flood_high', ['EX4', 'PE24']],
      ['flood_moderate', []],
    ]);
  });

  it('respects the minimum number of homes', async () => {
    const { districts } = await aggregateFloodLines(fixtureLines());
    const tiers = assignFloodTiers(districts, { ...config, minResidentialProperties: 30 });
    expect(tiers[0]?.districts).toEqual(['B1', 'EX4', 'PE24']);
  });

  it('rejects overlapping tiers in the config', () => {
    const overlapping = {
      ...config,
      tiers: [
        { id: 'a', description: 'a', minShare: 0.1, points: 25 },
        { id: 'b', description: 'b', minShare: 0.05, maxShare: 0.2, points: 10 },
      ],
    };
    expect(floodSuggestionConfigSchema.safeParse(overlapping).success).toBe(false);
  });
});

describe('flood proposal', () => {
  it('passes KB validation and the linter, without touching the base KB', async () => {
    const base = loadRealKb();
    const before = JSON.stringify(base);
    const { districts } = await aggregateFloodLines(fixtureLines());
    const proposal = buildFloodProposal(base, assignFloodTiers(districts, config), config);

    expect(knowledgeBaseSchema.safeParse(proposal).success).toBe(true);
    expect(lintKnowledgeBase(proposal).filter((f) => f.level === 'warning')).toEqual([]);
    expect(JSON.stringify(base)).toBe(before);
    expect(proposal.version).toBe('1.2.0');
    // Empty tiers add no factor (an empty "in" list would be invalid).
    expect(proposal.factors.filter((f) => f.group === 'flood_risk').map((f) => f.id)).toEqual(['flood_high']);
  });

  it('applies by postcode district, not by prefix', async () => {
    const { districts } = await aggregateFloodLines(fixtureLines());
    const proposal = buildFloodProposal(loadRealKb(), assignFloodTiers(districts, config), config);
    const quote = (postcode: string) =>
      scoreQuote(
        quoteRequestSchema.parse({ customerName: 'Jo', age: 40, propertyType: 'House', propertyValue: 300000, postcode, previousClaims: 0 }),
        proposal,
      ).appliedFactors.map((f) => f.id);
    expect(quote('EX4 1AA')).toEqual(['flood_high']);
    expect(quote('EX44 1AA')).toEqual([]);
    expect(quote('E1 6AN')).toEqual([]);
  });

  it('replaces earlier flood factors when re-run on newer data', async () => {
    const { districts } = await aggregateFloodLines(fixtureLines());
    const first = buildFloodProposal(loadRealKb(), assignFloodTiers(districts, config), config);
    const second = buildFloodProposal(first, assignFloodTiers(districts, config), config);
    expect(second.factors.filter((f) => f.group === 'flood_risk')).toHaveLength(1);
    expect(second.version).toBe('1.3.0');
  });

  it('has a source file with a licence and attribution', () => {
    const source = loadFloodSource();
    expect(source.licence).toContain('Open Government Licence');
    expect(source.attribution.join(' ')).toContain('© Environment Agency');
  });
});
