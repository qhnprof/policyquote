import { loadKnowledgeBase } from './kb-loader';

// CLI for `npm run kb:validate`. Exit code 1 means the KB is invalid.
try {
  const kb = loadKnowledgeBase();
  console.log(`KB v${kb.version} valid (${kb.factors.length} factors)`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
