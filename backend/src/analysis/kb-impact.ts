import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_KB_PATH } from '../kb/kb-loader';
import { formatKbIssues, knowledgeBaseSchema, type KnowledgeBase } from '../kb/kb.schema';
import { compareKnowledgeBases, hasNoDifferences } from './impact';
import { renderImpactReport } from './impact-report';
import { generateBook } from './synthetic-book';

// CLI for `npm run kb:impact`: preview how a KB change moves prices on a reproducible synthetic book.
// Default: last committed KB (git HEAD) vs the working copy, 1,000 customers, seed 42.

const USAGE = `Usage: npm run kb:impact -- [--base <file>] [--candidate <file>] [--size <n>] [--seed <n>] [--markdown]
  --base       KB to compare from (default: kb/risk-kb.json at git HEAD)
  --candidate  KB to compare to   (default: the working copy of kb/risk-kb.json)
  --size       customers in the synthetic book (default: 1000)
  --seed       random seed for the book (default: 42)
  --markdown   print Markdown (e.g. for a CI job summary)`;

const REPO_ROOT = path.resolve(DEFAULT_KB_PATH, '..', '..');

function readCommittedKb(): { label: string; raw: string } {
  const relative = path.relative(REPO_ROOT, DEFAULT_KB_PATH).split(path.sep).join('/');
  const raw = execFileSync('git', ['show', `HEAD:${relative}`], { cwd: REPO_ROOT, encoding: 'utf8' });
  return { label: `${relative} @ HEAD`, raw };
}

function parseKb(label: string, raw: string): KnowledgeBase {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const result = knowledgeBaseSchema.safeParse(json, { reportInput: true });
  if (!result.success) {
    throw new Error(`${label} is not a valid KB:\n${formatKbIssues(result.error).map((i) => `  - ${i}`).join('\n')}`);
  }
  return result.data;
}

function wholeNumber(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a whole number ≥ 0, got "${raw}"`);
  return value;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      candidate: { type: 'string' },
      size: { type: 'string' },
      seed: { type: 'string' },
      markdown: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    console.log(USAGE);
    return;
  }

  const baseSource = values.base ? { label: values.base, raw: readFileSync(values.base, 'utf8') } : readCommittedKb();
  const candidatePath = values.candidate ?? DEFAULT_KB_PATH;
  const base = parseKb(baseSource.label, baseSource.raw);
  const candidate = parseKb(candidatePath, readFileSync(candidatePath, 'utf8'));
  const size = wholeNumber('size', values.size, 1000);
  const seed = wholeNumber('seed', values.seed, 42);

  const report = compareKnowledgeBases(base, candidate, generateBook(size, seed));
  console.log(hasNoDifferences(report) ? 'No differences' : renderImpactReport(report, base, candidate, seed, values.markdown));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(`\n${USAGE}`);
  process.exitCode = 1;
}
