#!/usr/bin/env node
/**
 * tools/doc-graph/diff-gate.mjs
 *
 * CLI gate: fails when a change touches src/ or src-tauri/src/ without also
 * touching docs/. Spawns `git` directly — no dependencies.
 *
 * Rule:
 *   - Any file changed under src/ or src-tauri/src/ (added / modified /
 *     deleted / renamed all count — a rename's new path is a "changed file"
 *     for this purpose) with ZERO files changed under docs/ -> exit 1,
 *     printing the offending files.
 *   - If any commit message in the range contains the literal marker
 *     `[no-doc-impact]`, that overrides an otherwise-failing verdict: print a
 *     warning and exit 0.
 *   - Otherwise (no code change, or docs did change) -> exit 0.
 *
 * Usage:
 *   node tools/doc-graph/diff-gate.mjs [<git-range>]
 *   (default range: origin/main...HEAD)
 *
 * `runDiffGate({ repoRoot, range })` is the library entry point: it shells
 * out to git under repoRoot and returns a result object instead of calling
 * process.exit, so tests (and other tools) can assert on it directly.
 * `evaluateGate(changedFiles, commitMessages)` is the pure decision core,
 * exported separately so the rule can be tested without any git plumbing.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_RANGE = 'origin/main...HEAD';
const NO_DOC_IMPACT_MARKER = '[no-doc-impact]';

function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

function runGit(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`failed to spawn git ${args.join(' ')}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} exited ${result.status}: ${detail}`);
  }
  return result.stdout;
}

function isUnderCode(path) {
  return path.startsWith('src/') || path.startsWith('src-tauri/src/');
}

function isUnderDocs(path) {
  return path === 'docs' || path.startsWith('docs/');
}

/**
 * Pure decision core: given the list of changed file paths and the list of
 * commit messages in range, decide the gate outcome. No filesystem/git I/O.
 *
 * @param {string[]} changedFiles - repo-relative paths (any separator; will
 *   be normalized to posix internally).
 * @param {string[]} commitMessages - raw commit message bodies in the range.
 * @returns {{ ok: boolean, exitCode: 0|1, offending: string[], warning: boolean }}
 */
export function evaluateGate(changedFiles, commitMessages) {
  const files = (changedFiles || []).filter(Boolean).map(toPosix);
  const codeFiles = files.filter(isUnderCode);
  const docFiles = files.filter(isUnderDocs);

  const hasMarker = (commitMessages || []).some((msg) => msg.includes(NO_DOC_IMPACT_MARKER));

  // No code change in range at all -> nothing for this gate to enforce.
  if (codeFiles.length === 0) {
    return { ok: true, exitCode: 0, offending: [], warning: false };
  }

  // Code changed AND docs changed -> satisfied.
  if (docFiles.length > 0) {
    return { ok: true, exitCode: 0, offending: [], warning: false };
  }

  // Code changed, no docs changed: the marker downgrades fail -> warn-pass.
  if (hasMarker) {
    return { ok: true, exitCode: 0, offending: codeFiles, warning: true };
  }

  return { ok: false, exitCode: 1, offending: codeFiles, warning: false };
}

/**
 * Runs the gate against a real repo via git. Never calls process.exit —
 * callers (CLI `main()` below, or other tooling) decide what to do with the
 * returned result.
 *
 * @param {{ repoRoot: string, range?: string }} opts
 */
export function runDiffGate({ repoRoot, range = DEFAULT_RANGE } = {}) {
  if (!repoRoot) {
    throw new Error('runDiffGate requires repoRoot');
  }

  const nameOnlyRaw = runGit(repoRoot, ['diff', '--name-only', range]);
  const changedFiles = nameOnlyRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // %B is the raw commit message (subject + body); separate records with a
  // NUL byte so a message with blank lines can't be mistaken for a boundary.
  const logRaw = runGit(repoRoot, ['log', '--format=%B%x00', range]);
  const commitMessages = logRaw
    .split('\x00')
    .map((s) => s.trim())
    .filter(Boolean);

  const decision = evaluateGate(changedFiles, commitMessages);
  return { ...decision, range, changedFiles, commitMessages };
}

function main() {
  const range = process.argv[2] || DEFAULT_RANGE;
  const repoRoot = process.cwd();

  let result;
  try {
    result = runDiffGate({ repoRoot, range });
  } catch (err) {
    console.error(`diff-gate: ${err.message}`);
    process.exit(1);
    return;
  }

  if (result.warning) {
    console.warn(
      `diff-gate: WARNING — code changed under src/ or src-tauri/src/ with no docs/ change, ` +
        `but a commit in range "${result.range}" contains ${NO_DOC_IMPACT_MARKER}; passing.`
    );
    console.warn('  offending files:');
    for (const f of result.offending) {
      console.warn(`    ${f}`);
    }
    process.exit(0);
    return;
  }

  if (!result.ok) {
    console.error(
      `diff-gate: FAIL — code changed under src/ or src-tauri/src/ in range "${result.range}" ` +
        'with zero changes under docs/. Offending files:'
    );
    for (const f of result.offending) {
      console.error(`  ${f}`);
    }
    console.error(`Add a docs/ change, or include ${NO_DOC_IMPACT_MARKER} in a commit message.`);
    process.exit(1);
    return;
  }

  console.log(`diff-gate: PASS (range "${result.range}")`);
  process.exit(0);
}

function isMainModule() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main();
}
