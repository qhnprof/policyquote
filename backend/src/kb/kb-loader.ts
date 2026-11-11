import { readFileSync } from 'node:fs';
import path from 'node:path';
import { formatKbIssues, knowledgeBaseSchema, type KnowledgeBase } from './kb.schema';

/** `backend/`. src/kb and dist/kb are at the same depth, so this works under tsx, Jest and node dist/. */
const BACKEND_DIR = path.resolve(__dirname, '..', '..');
export const DEFAULT_KB_PATH = path.resolve(BACKEND_DIR, '..', 'kb', 'risk-kb.json');

export class KnowledgeBaseError extends Error {
  constructor(
    message: string,
    readonly issues: readonly string[],
  ) {
    super(message);
    this.name = 'KnowledgeBaseError';
  }
}

let cached: KnowledgeBase | undefined;

/** The KB file in use: `KB_PATH` (resolved against the working directory) or the repo's kb/risk-kb.json. */
export function resolveKnowledgeBasePath(): string {
  const fromEnv = process.env.KB_PATH;
  return fromEnv ? path.resolve(fromEnv) : DEFAULT_KB_PATH;
}

/**
 * Reads, validates and caches the KB. Like a Lambda cold start, the first call per process does
 * the I/O and later calls reuse the result. Throws a KnowledgeBaseError listing every issue.
 */
export function loadKnowledgeBase(): KnowledgeBase {
  if (cached !== undefined) return cached;

  const kbPath = resolveKnowledgeBasePath();
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(kbPath, 'utf8'));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new KnowledgeBaseError(`Cannot read KB at ${kbPath}: ${reason}`, [reason]);
  }

  const result = knowledgeBaseSchema.safeParse(raw, { reportInput: true });
  if (!result.success) {
    const issues = formatKbIssues(result.error);
    const list = issues.map((issue) => `  - ${issue}`).join('\n');
    throw new KnowledgeBaseError(`Invalid KB at ${kbPath} (${issues.length} issue(s)):\n${list}`, issues);
  }

  cached = result.data;
  return cached;
}

/** Forget the cached KB so the next loadKnowledgeBase() re-reads the file. For tests. */
export function resetKnowledgeBaseCache(): void {
  cached = undefined;
}
