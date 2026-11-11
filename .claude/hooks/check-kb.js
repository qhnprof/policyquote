#!/usr/bin/env node
// PostToolUse hook (Edit|Write): when the agent edits kb/risk-kb.json, validate the KB and run the
// backend tests. On failure, print the output to stderr and exit 2 so Claude Code feeds it back to
// the agent, which then fixes the KB. Any other file exits 0 at once: code edits are covered by the
// test run at the end of each task, and testing halfway through a refactor would just be noise.
// Node built-ins only.
'use strict';

const { execSync } = require('node:child_process');
const path = require('node:path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');
const kbPath = path.resolve(projectDir, 'kb', 'risk-kb.json');

/** Windows paths are case-insensitive and may arrive with either slash. */
const samePath = (a, b) => {
  const normalise = (p) => path.resolve(p).replace(/\\/g, '/');
  return process.platform === 'win32'
    ? normalise(a).toLowerCase() === normalise(b).toLowerCase()
    : normalise(a) === normalise(b);
};

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

/** Runs a command string (so `npm` resolves to npm.cmd on Windows). Returns null on success, else its output. */
function run(command) {
  try {
    execSync(command, { cwd: projectDir, stdio: 'pipe', encoding: 'utf8' });
    return null;
  } catch (error) {
    return [error.stdout, error.stderr].filter(Boolean).join('\n').trim() || String(error.message);
  }
}

async function main() {
  let filePath;
  try {
    filePath = JSON.parse(await readStdin())?.tool_input?.file_path;
  } catch {
    process.exit(0); // Not our payload: never block the agent on a hook parsing problem.
  }
  if (typeof filePath !== 'string' || !samePath(path.resolve(projectDir, filePath), kbPath)) process.exit(0);

  const checks = [
    // --strict: lint warnings (overlaps, gaps, dead rules, unreachable bands) also fail, so the agent hears about them at once.
    ['KB validation and lint', 'npm --prefix backend run kb:validate -- --strict'],
    ['Backend tests', 'npm --prefix backend test -- --silent'],
  ];
  for (const [name, command] of checks) {
    const failure = run(command);
    if (failure !== null) {
      process.stderr.write(
        `[check-kb hook] ${name} failed after editing kb/risk-kb.json (\`${command}\`).\n` +
          `Fix the KB (or revert the edit) before continuing.\n\n${failure}\n`,
      );
      process.exit(2);
    }
  }
  process.exit(0);
}

main();
