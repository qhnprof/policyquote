import { loadKnowledgeBase } from './kb-loader';
import { lintKnowledgeBase } from './lint-kb';

// CLI for `npm run kb:validate [-- --strict]`.
// Exit code 1: the KB fails the schema, or (with --strict) the linter reports a warning.
// Info notes never fail the command.
const strict = process.argv.slice(2).includes('--strict');

try {
  const kb = loadKnowledgeBase();
  console.log(`KB v${kb.version} valid (${kb.factors.length} factors)`);

  const findings = lintKnowledgeBase(kb);
  const warnings = findings.filter((finding) => finding.level === 'warning');
  const notes = findings.length - warnings.length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  console.log(`Lint: ${plural(warnings.length, 'warning')}, ${plural(notes, 'note')}${strict ? ' (strict)' : ''}`);
  for (const finding of findings) console.log(`  ${finding.level} [${finding.kind}] ${finding.message}`);

  if (strict && warnings.length > 0) {
    console.error(`Strict mode: ${plural(warnings.length, 'lint warning')} must be fixed.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
