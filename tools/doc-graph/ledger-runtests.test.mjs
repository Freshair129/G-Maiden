#!/usr/bin/env node
/**
 * ledger-runtests.test.mjs — tests for ledger-runtests.mjs.
 *
 * node-test fixtures only: every command-construction assertion is checked
 * against the returned descriptor, and every `runTestRefs` exercise injects
 * a stub `spawnFn` — this file never shells out to `node --test` or `cargo`
 * for real (no real spawn(), no real cargo test).
 *
 * Run with: node --test tools/doc-graph/ledger-runtests.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mapTestRefToCommand, runTestRefs, reachesVerified, __internal } from './ledger-runtests.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SRC_TAURI_DIR = join(REPO_ROOT, 'src-tauri');

describe('mapTestRefToCommand', () => {
  test('maps a .test.mjs ref to `node --test <ref>` at repo root', () => {
    const ref = 'tools/doc-graph/frontmatter-rules.test.mjs';
    const mapped = mapTestRefToCommand(ref);
    assert.equal(mapped.kind, 'node-test');
    assert.equal(mapped.command, 'node');
    assert.deepEqual(mapped.args, ['--test', ref]);
    assert.equal(mapped.cwd, REPO_ROOT);
  });

  test('maps a cargo:<test-name> ref to `cargo test <name> --no-fail-fast` in src-tauri/', () => {
    const mapped = mapTestRefToCommand('cargo:gsi_latency_budget');
    assert.equal(mapped.kind, 'cargo-test');
    assert.equal(mapped.command, 'cargo');
    assert.deepEqual(mapped.args, ['test', 'gsi_latency_budget', '--no-fail-fast']);
    assert.equal(mapped.cwd, SRC_TAURI_DIR);
  });

  test('handles a cargo test name containing colons (module path) as one name', () => {
    const mapped = mapTestRefToCommand('cargo:announcer::most_important_picks_top_priority');
    assert.deepEqual(mapped.args, ['test', 'announcer::most_important_picks_top_priority', '--no-fail-fast']);
  });

  test('respects injected repoRoot / srcTauriDir overrides', () => {
    const mapped = mapTestRefToCommand('foo.test.mjs', { repoRoot: '/fake/root' });
    assert.equal(mapped.cwd, '/fake/root');

    const cargoMapped = mapTestRefToCommand('cargo:x', { srcTauriDir: '/fake/root/src-tauri' });
    assert.equal(cargoMapped.cwd, '/fake/root/src-tauri');
  });

  test('returns null for a ref with no known mapping', () => {
    assert.equal(mapTestRefToCommand('docs/features/FEAT-G-SIGNAL.md'), null);
    assert.equal(mapTestRefToCommand('src-tauri/src/gsi.rs'), null);
    assert.equal(mapTestRefToCommand(''), null);
    assert.equal(mapTestRefToCommand(undefined), null);
    assert.equal(mapTestRefToCommand(null), null);
  });

  test('__internal exposes the default repo root / src-tauri dir used by defaults', () => {
    assert.equal(__internal.REPO_ROOT, REPO_ROOT);
    assert.equal(__internal.SRC_TAURI_DIR, SRC_TAURI_DIR);
  });
});

describe('runTestRefs', () => {
  test('invokes the stub spawner once per mapped ref with the constructed command', async () => {
    const calls = [];
    const spawnFn = async (command, args, opts) => {
      calls.push({ command, args, cwd: opts.cwd });
      return { code: 0 };
    };

    const refs = ['tools/doc-graph/frontmatter-rules.test.mjs', 'cargo:gsi_latency_budget'];
    const results = await runTestRefs(refs, { spawnFn });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].command, 'node');
    assert.deepEqual(calls[0].args, ['--test', refs[0]]);
    assert.equal(calls[1].command, 'cargo');
    assert.deepEqual(calls[1].args, ['test', 'gsi_latency_budget', '--no-fail-fast']);

    assert.equal(results.length, 2);
    assert.equal(results[0].ok, true);
    assert.equal(results[0].exitCode, 0);
    assert.equal(results[1].ok, true);
  });

  test('marks a non-zero exit as not ok without throwing', async () => {
    const spawnFn = async () => ({ code: 1 });
    const results = await runTestRefs(['tools/doc-graph/frontmatter-rules.test.mjs'], { spawnFn });
    assert.equal(results[0].ok, false);
    assert.equal(results[0].exitCode, 1);
  });

  test('skips unmapped refs without calling the spawner', async () => {
    let callCount = 0;
    const spawnFn = async () => {
      callCount += 1;
      return { code: 0 };
    };

    const results = await runTestRefs(['docs/features/FEAT-G-SIGNAL.md'], { spawnFn });
    assert.equal(callCount, 0);
    assert.equal(results[0].mapped, false);
    assert.equal(results[0].skipped, true);
    assert.equal(results[0].ok, false);
  });

  test('caches results per ref within one invocation — the spawner runs at most once per ref', async () => {
    let callCount = 0;
    const spawnFn = async () => {
      callCount += 1;
      return { code: 0 };
    };
    const cache = new Map();
    const ref = 'tools/doc-graph/frontmatter-rules.test.mjs';

    await runTestRefs([ref, ref], { spawnFn, cache });
    assert.equal(callCount, 1, 'duplicate ref in one call should only spawn once');

    await runTestRefs([ref], { spawnFn, cache });
    assert.equal(callCount, 1, 'reusing the same cache across a second call should not re-spawn');
  });

  test('returns an empty array for empty/undefined refs', async () => {
    const spawnFn = async () => ({ code: 0 });
    assert.deepEqual(await runTestRefs([], { spawnFn }), []);
    assert.deepEqual(await runTestRefs(undefined, { spawnFn }), []);
  });
});

describe('reachesVerified', () => {
  const rowWithReview = { refs: { tests: ['a.test.mjs'], review: ['docs/review/foo.md'] } };
  const rowNoReview = { refs: { tests: ['a.test.mjs'], review: [] } };

  test('true when every mapped command is ok and review refs exist', () => {
    const testResults = [{ mapped: true, ok: true }, { mapped: true, ok: true }];
    assert.equal(reachesVerified(rowWithReview, testResults), true);
  });

  test('false when any mapped command failed', () => {
    const testResults = [{ mapped: true, ok: true }, { mapped: true, ok: false }];
    assert.equal(reachesVerified(rowWithReview, testResults), false);
  });

  test('false when review refs are missing, even if all tests passed', () => {
    const testResults = [{ mapped: true, ok: true }];
    assert.equal(reachesVerified(rowNoReview, testResults), false);
  });

  test('false when no test results were supplied at all (i.e. --run-tests was not passed)', () => {
    assert.equal(reachesVerified(rowWithReview, undefined), false);
    assert.equal(reachesVerified(rowWithReview, []), false);
  });

  test('false when every ref was unmapped (nothing was actually runnable)', () => {
    const testResults = [{ mapped: false, ok: false, skipped: true }];
    assert.equal(reachesVerified(rowWithReview, testResults), false);
  });

  test('ignores unmapped entries but still requires the mapped ones to pass', () => {
    const testResults = [
      { mapped: false, ok: false, skipped: true },
      { mapped: true, ok: true },
    ];
    assert.equal(reachesVerified(rowWithReview, testResults), true);
  });

  test('handles a row with no refs object at all', () => {
    assert.equal(reachesVerified({}, [{ mapped: true, ok: true }]), false);
    assert.equal(reachesVerified(undefined, [{ mapped: true, ok: true }]), false);
  });
});
