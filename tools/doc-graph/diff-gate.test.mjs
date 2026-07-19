#!/usr/bin/env node
/**
 * diff-gate.test.mjs — tests for diff-gate.mjs.
 *
 * Builds throwaway fixture git repos under the OS temp dir (never touches
 * the real G-Maiden repo). Each fixture: `git init`, a "base" commit whose
 * SHA is pinned to `refs/remotes/origin/main` (simulating a fetched remote
 * tracking ref with no network), then one or more follow-up commits that
 * play the role of the local branch under test — exercised against the
 * default range `origin/main...HEAD`.
 *
 * Covers:
 *   - code change + doc change together -> pass
 *   - code-only change -> fail
 *   - code-only change with a `[no-doc-impact]` commit message -> warn-pass
 *   - docs-only change -> pass
 *
 * Run with: node --test tools/doc-graph/diff-gate.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { runDiffGate, evaluateGate } from './diff-gate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIFF_GATE_CLI = join(__dirname, 'diff-gate.mjs');

function write(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
  return full;
}

function runGit(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`
    );
  }
  return result.stdout;
}

/**
 * Creates a fresh git repo with a "base" commit (src/index.js + docs/README.md)
 * and points refs/remotes/origin/main at it, simulating a fetched remote
 * tracking branch without needing an actual network remote. Returns the repo
 * root; the caller adds follow-up commits on top to play the "local branch".
 */
function makeBaseRepo() {
  const root = mkdtempSync(join(tmpdir(), 'doc-graph-diffgate-'));
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.email', 'diff-gate-test@example.com']);
  runGit(root, ['config', 'user.name', 'Diff Gate Test']);
  runGit(root, ['config', 'commit.gpgsign', 'false']);

  write(root, 'src/index.js', "console.log('base');\n");
  write(root, 'docs/README.md', '# Docs\n\nBase docs.\n');
  runGit(root, ['add', 'src/index.js', 'docs/README.md']);
  runGit(root, ['commit', '-q', '-m', 'base: seed src + docs']);

  const baseSha = runGit(root, ['rev-parse', 'HEAD']).trim();
  runGit(root, ['update-ref', 'refs/remotes/origin/main', baseSha]);

  return root;
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

test('evaluateGate: code-only change with no docs -> fail', () => {
  const result = evaluateGate(['src/foo.ts'], ['add feature']);
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.offending, ['src/foo.ts']);
  assert.equal(result.warning, false);
});

test('evaluateGate: code + docs change -> pass', () => {
  const result = evaluateGate(['src/foo.ts', 'docs/foo.md'], ['add feature + docs']);
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.warning, false);
});

test('evaluateGate: [no-doc-impact] marker downgrades a code-only change to warn-pass', () => {
  const result = evaluateGate(['src-tauri/src/lib.rs'], ['tweak logging [no-doc-impact]']);
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.warning, true);
  assert.deepEqual(result.offending, ['src-tauri/src/lib.rs']);
});

test('evaluateGate: docs-only change -> pass (no code touched at all)', () => {
  const result = evaluateGate(['docs/README.md'], ['docs tidy']);
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.warning, false);
  assert.deepEqual(result.offending, []);
});

test('evaluateGate: renamed-away-from-docs and deleted files still count as changes', () => {
  // A rename shows up as its new path; a delete still shows up in
  // `git diff --name-only`. Both must be able to satisfy (or fail) the gate
  // exactly like an add/modify would.
  const renameOnly = evaluateGate(['src/new-name.ts'], []);
  assert.equal(renameOnly.ok, false, 'code-only rename with no docs change should fail');

  const deleteWithDocs = evaluateGate(['src/old.ts', 'docs/CHANGELOG.md'], []);
  assert.equal(deleteWithDocs.ok, true, 'deleted code file paired with a docs change should pass');
});

test('fixture repo: code change + doc change together -> pass', () => {
  const root = makeBaseRepo();
  try {
    write(root, 'src/feature.js', "console.log('feature');\n");
    write(root, 'docs/README.md', '# Docs\n\nBase docs.\n\nNew feature documented.\n');
    runGit(root, ['add', 'src/feature.js', 'docs/README.md']);
    runGit(root, ['commit', '-q', '-m', 'feat: add feature with docs']);

    const result = runDiffGate({ repoRoot: root });
    assert.equal(result.range, 'origin/main...HEAD');
    assert.equal(result.ok, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.warning, false);
    assert.ok(result.changedFiles.includes('src/feature.js'));
    assert.ok(result.changedFiles.includes('docs/README.md'));
  } finally {
    cleanup(root);
  }
});

test('fixture repo: code-only change -> fail (exit 1, offending files printed)', () => {
  const root = makeBaseRepo();
  try {
    write(root, 'src/feature.js', "console.log('feature');\n");
    write(root, 'src-tauri/src/extra.rs', 'fn extra() {}\n');
    runGit(root, ['add', 'src/feature.js', 'src-tauri/src/extra.rs']);
    runGit(root, ['commit', '-q', '-m', 'feat: add feature without docs']);

    const result = runDiffGate({ repoRoot: root });
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 1);
    assert.equal(result.warning, false);
    assert.deepEqual(
      [...result.offending].sort(),
      ['src-tauri/src/extra.rs', 'src/feature.js'].sort()
    );

    const cli = spawnSync('node', [DIFF_GATE_CLI], { cwd: root, encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /FAIL/);
    assert.match(cli.stderr, /src\/feature\.js/);
    assert.match(cli.stderr, /src-tauri\/src\/extra\.rs/);
  } finally {
    cleanup(root);
  }
});

test('fixture repo: code-only change with [no-doc-impact] commit -> warning, exit 0', () => {
  const root = makeBaseRepo();
  try {
    write(root, 'src/feature.js', "console.log('feature');\n");
    runGit(root, ['add', 'src/feature.js']);
    runGit(root, ['commit', '-q', '-m', 'chore: internal tweak [no-doc-impact]']);

    const result = runDiffGate({ repoRoot: root });
    assert.equal(result.ok, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.warning, true);
    assert.deepEqual(result.offending, ['src/feature.js']);

    const cli = spawnSync('node', [DIFF_GATE_CLI], { cwd: root, encoding: 'utf8' });
    assert.equal(cli.status, 0);
    assert.match(cli.stderr, /WARNING/);
    assert.match(cli.stderr, /no-doc-impact/);
  } finally {
    cleanup(root);
  }
});

test('fixture repo: docs-only change -> pass', () => {
  const root = makeBaseRepo();
  try {
    write(root, 'docs/README.md', '# Docs\n\nBase docs.\n\nClarified a point.\n');
    runGit(root, ['add', 'docs/README.md']);
    runGit(root, ['commit', '-q', '-m', 'docs: clarify']);

    const result = runDiffGate({ repoRoot: root });
    assert.equal(result.ok, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.warning, false);
    assert.deepEqual(result.offending, []);

    const cli = spawnSync('node', [DIFF_GATE_CLI], { cwd: root, encoding: 'utf8' });
    assert.equal(cli.status, 0);
    assert.match(cli.stdout, /PASS/);
  } finally {
    cleanup(root);
  }
});

test('fixture repo: renamed-out-of-src file with no docs change still fails', () => {
  const root = makeBaseRepo();
  try {
    write(root, 'src/moved-out-of-src-but-still-code.js', "console.log('base');\n");
    runGit(root, ['rm', '-q', 'src/index.js']);
    runGit(root, ['add', 'src/moved-out-of-src-but-still-code.js']);
    runGit(root, ['commit', '-q', '-m', 'refactor: rename file']);

    const result = runDiffGate({ repoRoot: root });
    assert.equal(result.ok, false);
    assert.equal(result.exitCode, 1);
  } finally {
    cleanup(root);
  }
});

test('CLI: accepts an explicit range argument', () => {
  const root = makeBaseRepo();
  try {
    write(root, 'src/feature.js', "console.log('feature');\n");
    runGit(root, ['add', 'src/feature.js']);
    runGit(root, ['commit', '-q', '-m', 'feat: no docs']);
    const sha = runGit(root, ['rev-parse', 'HEAD']).trim();

    const cli = spawnSync('node', [DIFF_GATE_CLI, `origin/main...${sha}`], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /FAIL/);
  } finally {
    cleanup(root);
  }
});
