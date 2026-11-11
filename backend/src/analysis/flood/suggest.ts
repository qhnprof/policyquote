import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadKnowledgeBase } from '../../kb/kb-loader';
import { knowledgeBaseSchema, formatKbIssues, type Factor, type KnowledgeBase } from '../../kb/kb.schema';
import { lintKnowledgeBase } from '../../kb/lint-kb';
import { compareKnowledgeBases } from '../impact';
import { renderImpactReport } from '../impact-report';
import { generateBook } from '../synthetic-book';
import { FLOOD_DISTRICTS_HEADER, type FloodDistrict } from './aggregate';
import { DATA_DIR, REPO_ROOT, loadFloodSource, type FloodSource } from './flood-paths';

// `npm run kb:suggest-flood`: turn data/flood-districts.csv into a PROPOSED KB for a human to
// review. It never edits kb/risk-kb.json; it writes kb/proposals/flood-<date>.json plus a note.

const snakeCase = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

export const floodSuggestionConfigSchema = z
  .strictObject({
    description: z.string().optional(),
    group: z.string().regex(snakeCase),
    metric: z.enum(['highShare', 'mediumShare']),
    minResidentialProperties: z.number().int().nonnegative(),
    tiers: z
      .array(
        z.strictObject({
          id: z.string().regex(snakeCase),
          description: z.string().min(1),
          minShare: z.number().min(0).max(1),
          maxShare: z.number().min(0).max(1).optional(),
          points: z.number().int().positive(),
        }),
      )
      .min(1),
  })
  .superRefine((config, ctx) => {
    const ranges = config.tiers
      .map((tier, index) => ({ index, min: tier.minShare, max: tier.maxShare ?? Infinity }))
      .sort((a, b) => a.min - b.min);
    ranges.forEach((range, i) => {
      if (range.max <= range.min) {
        ctx.addIssue({ code: 'custom', path: ['tiers', range.index], message: 'maxShare must be greater than minShare' });
      }
      const next = ranges[i + 1];
      if (next !== undefined && next.min < range.max) {
        ctx.addIssue({ code: 'custom', path: ['tiers', next.index], message: 'Tier ranges overlap' });
      }
    });
  });
export type FloodSuggestionConfig = z.infer<typeof floodSuggestionConfigSchema>;
export type FloodTier = FloodSuggestionConfig['tiers'][number];

export function parseFloodDistrictsCsv(csv: string): FloodDistrict[] {
  const [header, ...lines] = csv.trim().split(/\r?\n/);
  if (header?.trim() !== FLOOD_DISTRICTS_HEADER) throw new Error(`Unexpected flood-districts.csv header: ${header}`);
  return lines.map((line) => {
    const [district = '', ...numbers] = line.split(',');
    const [postcodes, residentialProperties, residentialHigh, residentialMedium, highShare, mediumShare] = numbers.map(Number);
    if ([postcodes, residentialProperties, residentialHigh, residentialMedium, highShare, mediumShare].some((n) => n === undefined || !Number.isFinite(n))) {
      throw new Error(`Bad row in flood-districts.csv: ${line}`);
    }
    return {
      district,
      postcodes: postcodes ?? 0,
      residentialProperties: residentialProperties ?? 0,
      residentialHigh: residentialHigh ?? 0,
      residentialMedium: residentialMedium ?? 0,
      highShare: highShare ?? 0,
      mediumShare: mediumShare ?? 0,
    };
  });
}

export interface TierAssignment {
  tier: FloodTier;
  districts: string[];
}

/** Each district goes in the first tier whose [minShare, maxShare) contains its metric. Pure. */
export function assignFloodTiers(districts: readonly FloodDistrict[], config: FloodSuggestionConfig): TierAssignment[] {
  const eligible = districts.filter((d) => d.residentialProperties >= config.minResidentialProperties);
  return config.tiers.map((tier) => ({
    tier,
    districts: eligible
      .filter((d) => d[config.metric] >= tier.minShare && d[config.metric] < (tier.maxShare ?? Infinity))
      .map((d) => d.district)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
  }));
}

function bumpMinor(version: string): string {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return `${major}.${minor + 1}.0`;
}

/**
 * The current KB plus one factor per non-empty tier (postcodeDistrict in [...]). Any factors already in
 * the flood group are replaced, so re-running on newer data gives a clean proposal. Pure.
 */
export function buildFloodProposal(baseKb: KnowledgeBase, assignments: readonly TierAssignment[], config: FloodSuggestionConfig): KnowledgeBase {
  const floodFactors: Factor[] = assignments
    .filter((a) => a.districts.length > 0)
    .map(({ tier, districts }) => ({
      id: tier.id,
      description: tier.description,
      condition: { field: 'postcodeDistrict', operator: 'in', values: districts },
      points: tier.points,
      group: config.group,
    }));
  return {
    ...structuredClone(baseKb),
    version: bumpMinor(baseKb.version),
    factors: [...baseKb.factors.filter((f) => f.group !== config.group).map((f) => structuredClone(f)), ...floodFactors],
  };
}

const percent = (share: number) => `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;

function tierRange(tier: FloodTier): string {
  return tier.maxShare === undefined ? `≥ ${percent(tier.minShare)}` : `${percent(tier.minShare)} to < ${percent(tier.maxShare)}`;
}

export function renderProposalNote(input: {
  proposalFile: string;
  baseKb: KnowledgeBase;
  proposal: KnowledgeBase;
  source: FloodSource;
  meta: { rawFileModified?: string; aggregatedOn?: string; rowsRead?: number; partialPostcodes?: number; rowsSkipped?: number };
  config: FloodSuggestionConfig;
  assignments: readonly TierAssignment[];
  districtsConsidered: number;
  impactMarkdown: string;
  generatedOn: string;
}): string {
  const { source, config, meta } = input;
  const metricLabel = config.metric === 'highShare' ? 'high' : 'medium';
  const tierRows = input.assignments.map(({ tier, districts }) => {
    const sample = districts.slice(0, 12).join(', ') + (districts.length > 12 ? `, … (+${districts.length - 12})` : '');
    return `| \`${tier.id}\` | ${tierRange(tier)} | +${tier.points} | ${districts.length} | ${sample || '—'} |`;
  });
  return [
    `# Proposal: flood-risk factors from Environment Agency data (${input.generatedOn})`,
    '',
    `**Status: proposal for human review.** \`kb/risk-kb.json\` has not been changed. Proposed KB: \`${input.proposalFile}\` (v${input.baseKb.version} → v${input.proposal.version}).`,
    '',
    '## Source',
    '',
    `- **Dataset:** [${source.title}](${source.url}), ${source.publisher}, ${source.coverage}.`,
    `- **Dataset revision:** ${source.revisionDate}; raw file dated ${meta.rawFileModified ?? 'unknown'}; aggregated ${meta.aggregatedOn ?? 'unknown'} by \`npm run flood:aggregate\`.`,
    `- **Rows:** ${meta.rowsRead?.toLocaleString('en-GB') ?? '?'} rows read (${meta.partialPostcodes?.toLocaleString('en-GB') ?? '?'} partial postcodes such as "PR2 5P*" kept at district level; ${meta.rowsSkipped ?? '?'} skipped with no valid outward code).`,
    `- **Licence:** [${source.licence}](${source.licenceUrl}).`,
    '',
    '**Attribution (required by the licence):**',
    '',
    ...source.attribution.map((line) => `> ${line}`),
    '',
    '## Method',
    '',
    `- Per postcode district (outward code, e.g. \`EX4\`): the share of residential properties in the file at **${metricLabel}** risk (${source.riskBands[config.metric === 'highShare' ? 'High' : 'Medium'] ?? ''}).`,
    `- Districts with fewer than ${config.minResidentialProperties} residential properties are left out; ${input.districtsConsidered.toLocaleString('en-GB')} districts considered.`,
    `- Each tier becomes one factor \`{ field: "postcodeDistrict", operator: "in", values: [...] }\` in group \`${config.group}\` (either/or, so the linter checks the tiers don't overlap).`,
    '',
    '| Factor | Share at risk | Points | Districts | Districts (sample) |',
    '| --- | --- | ---: | ---: | --- |',
    ...tierRows,
    '',
    '## Caveats',
    '',
    ...source.caveats.map((caveat) => `- ${caveat}`),
    '- The synthetic book is made up; real impact depends on where actual customers live.',
    '',
    '## Impact preview (synthetic book)',
    '',
    input.impactMarkdown,
    '',
    '## To apply (after review)',
    '',
    '1. Copy the flood factors (and the version) from the proposal into `kb/risk-kb.json` as a normal reviewed change.',
    '2. Follow the `add-risk-factor` skill: add tests, then run `npm run kb:validate -- --strict`, `npm test` and `npm run kb:impact`.',
    '',
  ].join('\n');
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      districts: { type: 'string' },
      config: { type: 'string' },
      size: { type: 'string' },
      seed: { type: 'string' },
    },
  });
  const districtsFile = values.districts ?? path.join(DATA_DIR, 'flood-districts.csv');
  const config = floodSuggestionConfigSchema.parse(
    JSON.parse(readFileSync(values.config ?? path.join(DATA_DIR, 'flood-suggestion-config.json'), 'utf8')),
  );
  const districts = parseFloodDistrictsCsv(readFileSync(districtsFile, 'utf8'));
  const metaFile = districtsFile.replace(/\.csv$/, '.meta.json');
  const meta: Record<string, unknown> = JSON.parse(readFileSync(metaFile, 'utf8'));
  const source = loadFloodSource();

  const baseKb = loadKnowledgeBase();
  const assignments = assignFloodTiers(districts, config);
  const proposal = buildFloodProposal(baseKb, assignments, config);

  // The proposal must pass the same gates as a hand-made KB change.
  const parsed = knowledgeBaseSchema.safeParse(proposal, { reportInput: true });
  if (!parsed.success) throw new Error(`Proposal fails the KB schema:\n${formatKbIssues(parsed.error).join('\n')}`);
  const warnings = lintKnowledgeBase(parsed.data).filter((f) => f.level === 'warning');
  if (warnings.length > 0) throw new Error(`Proposal has lint warnings:\n${warnings.map((w) => `- ${w.message}`).join('\n')}`);

  const size = Number(values.size ?? 1000);
  const seed = Number(values.seed ?? 42);
  const report = compareKnowledgeBases(baseKb, parsed.data, generateBook(size, seed));
  const impactMarkdown = renderImpactReport(report, baseKb, parsed.data, seed, true).replace(/^### /, '#### ');

  const date = today();
  const proposalsDir = path.join(REPO_ROOT, 'kb', 'proposals');
  mkdirSync(proposalsDir, { recursive: true });
  const proposalPath = path.join(proposalsDir, `flood-${date}.json`);
  const notePath = path.join(proposalsDir, `flood-${date}.md`);
  const relative = (file: string) => path.relative(REPO_ROOT, file).split(path.sep).join('/');

  writeFileSync(proposalPath, `${JSON.stringify(parsed.data, null, 2)}\n`);
  const num = (key: string) => (typeof meta[key] === 'number' ? meta[key] : undefined);
  const str = (key: string) => (typeof meta[key] === 'string' ? meta[key] : undefined);
  writeFileSync(
    notePath,
    renderProposalNote({
      proposalFile: relative(proposalPath),
      baseKb,
      proposal: parsed.data,
      source,
      meta: {
        rawFileModified: str('rawFileModified'),
        aggregatedOn: str('aggregatedOn'),
        rowsRead: num('rowsRead'),
        partialPostcodes: num('partialPostcodes'),
        rowsSkipped: num('rowsSkipped'),
      },
      config,
      assignments,
      districtsConsidered: districts.filter((d) => d.residentialProperties >= config.minResidentialProperties).length,
      impactMarkdown,
      generatedOn: date,
    }),
  );

  console.log(`Proposal: ${relative(proposalPath)} (v${baseKb.version} → v${parsed.data.version})`);
  console.log(`Note:     ${relative(notePath)}`);
  for (const { tier, districts: list } of assignments) console.log(`  ${tier.id} (${tierRange(tier)}, +${tier.points}): ${list.length} districts`);
  console.log(
    `Impact on ${report.customers.toLocaleString('en-GB')} synthetic customers: ${report.movedUp.count} moved up a band, ` +
      `average premium ${report.premium.averageChange >= 0 ? '+' : '-'}£${Math.abs(report.premium.averageChange).toFixed(2)}`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
