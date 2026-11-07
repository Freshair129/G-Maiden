import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { GENERATED_ARTIFACTS, checkFreshness, compareArtifact, normalize } from './artifact-freshness.mjs';

test('normalize masks ISO timestamps, BOM and CRLF only', () => {
  const a = '﻿{"generatedAt": "2026-11-06T23:01:05.254Z"}\r\n> Generated `2026-11-07T03:38:13.841Z` · candidates=18\r\n';
  const b = '{"generatedAt": "2026-11-07T03:37:44.174Z"}\n> Generated `2026-11-01T00:00:00Z` · candidates=18\n';
  assert.equal(normalize(a), normalize(b));
  assert.notEqual(normalize('candidates=18\n'), normalize('candidates=19\n'));
});

test('compareArtifact is fresh when only timestamps differ', () => {
  const committed = 'สร้างเมื่อ / Generated at: 2026-11-06T23:01:05.254Z\n| row | 0.1.0 |\n';
  const regenerated = 'สร้างเมื่อ / Generated at: 2026-11-07T03:37:44.174Z\n| row | 0.1.0 |\n';
  assert.deepEqual(compareArtifact(committed, regenerated), { fresh: true, firstDiffLine: null });
});

test('compareArtifact reports the first real content drift', () => {
  const committed = '{"slug":"GIT-WORKTREE-POLICY","version":"0.1.0"}\n{"slug":"other","version":"1.0.0"}\n';
  const regenerated = '{"slug":"GIT-WORKTREE-POLICY","version":"0.2.1"}\n{"slug":"other","version":"1.0.0"}\n';
  assert.deepEqual(compareArtifact(committed, regenerated), { fresh: false, firstDiffLine: 1 });
});

function gitRepoWithArtifacts(contentByPath) {
  const root = mkdtempSync(join(tmpdir(), 'gmaiden-freshness-'));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout;
  };
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(root, 'docs'), { recursive: true });
  for (const [rel, text] of Object.entries(contentByPath)) writeFileSync(join(root, rel), text, 'utf8');
  git('add', '-A');
  git('commit', '-q', '-m', 'seed');
  return { root, git };
}

const SEED = Object.fromEntries(
  GENERATED_ARTIFACTS.map((p) => [p, `# ${p}\ngeneratedAt: 2026-11-06T23:01:05.254Z\nrow: 0.1.0\n`])
);

test('checkFreshness passes when regenerated files differ only by timestamp', () => {
  const { root } = gitRepoWithArtifacts(SEED);
  try {
    for (const p of GENERATED_ARTIFACTS) {
      writeFileSync(join(root, p), `# ${p}\ngeneratedAt: 2026-11-07T03:37:44.174Z\nrow: 0.1.0\n`, 'utf8');
    }
    assert.deepEqual(checkFreshness(root), { code: 0, stale: [], missing: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checkFreshness fails when a committed artifact is stale', () => {
  const { root } = gitRepoWithArtifacts(SEED);
  try {
    writeFileSync(join(root, 'docs/atomic_index.jsonl'), '# docs/atomic_index.jsonl\ngeneratedAt: 2026-11-07T03:37:44.174Z\nrow: 0.2.1\n', 'utf8');
    const result = checkFreshness(root);
    assert.equal(result.code, 1);
    assert.deepEqual(result.stale, ['docs/atomic_index.jsonl:3']);
    assert.deepEqual(result.missing, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checkFreshness reports an artifact missing from HEAD', () => {
  const partial = { ...SEED };
  delete partial['docs/FEATURE-LEDGER.md'];
  const { root } = gitRepoWithArtifacts(partial);
  try {
    writeFileSync(join(root, 'docs/FEATURE-LEDGER.md'), 'new\n', 'utf8');
    const result = checkFreshness(root);
    assert.equal(result.code, 2);
    assert.deepEqual(result.missing, ['docs/FEATURE-LEDGER.md']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
