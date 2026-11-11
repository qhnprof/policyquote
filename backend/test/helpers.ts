import path from 'node:path';
import { loadKnowledgeBase, resetKnowledgeBaseCache } from '../src/kb/kb-loader';
import type { KnowledgeBase } from '../src/kb/kb.schema';

export const fixturePath = (name: string): string => path.join(__dirname, 'fixtures', `${name}.json`);

/** Loads the real kb/risk-kb.json through the loader, bypassing any cached or fixture KB. */
export function loadRealKb(): KnowledgeBase {
  delete process.env.KB_PATH;
  resetKnowledgeBaseCache();
  return loadKnowledgeBase();
}

/** Loads test/fixtures/<name>.json through the loader. Throws like the loader does. */
export function loadFixtureKb(name: string): KnowledgeBase {
  process.env.KB_PATH = fixturePath(name);
  resetKnowledgeBaseCache();
  return loadKnowledgeBase();
}

/** Call in afterEach so a fixture KB never leaks into another test. */
export function restoreRealKb(): void {
  delete process.env.KB_PATH;
  resetKnowledgeBaseCache();
}
