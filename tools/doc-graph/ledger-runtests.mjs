#!/usr/bin/env node
/**
 * tools/doc-graph/ledger-runtests.mjs
 *
 * The optional `--run-tests` test-evidence runner for the G3 feature ledger
 * (docs/feature-ledger.manifest.yaml -> docs/FEATURE-LEDGER.md, per
 * G:/Rwang/runs/g3-feature-ledger-20260720). This module only owns the
 * "map a refs.tests entry to a real command, run it, decide if a row earns
 * verified" slice; it has no dependency on ledger.mjs / ledger-manifest.mjs
 * so it can be authored and tested standalone and wired in once those land.
 *
 * Mapping rules (pinned by the epic spec):
 *   - a ref ending in `.test.mjs`   -> `node --test <ref>`      (cwd: repo root)
 *   - a ref of the form `cargo:<test-name>` -> `cargo test <test-name> --no-fail-fast`
 *                                      (cwd: src-tauri/)
 *   - anything else is NOT run (unmapped) — it neither blocks nor satisfies
 *     the verified gate; ledger.mjs is expected to report it separately.
 *
 * Verified gate: a row reaches 'verified' only when every MAPPED command for
 * its refs.tests exits 0 AND refs.review is non-empty. Without --run-tests
 * (no test results supplied at all), reachesVerified() always returns false —
 * the ledger's downgrade rule ("code+tests-present (unrun)") is applied by
 * the caller, not here.
 *
 * Results are cached per ref within a caller-supplied Map so a test file
 * shared by multiple ledger rows only runs once per `node ledger.mjs
 * --run-tests` invocation.
 *
 * ---------------------------------------------------------------------------
 * RCA — the load-sensitive `verified`-rung flake (G3.5 review finding 2)
 * ---------------------------------------------------------------------------
 * SYMPTOM
 *   The two ledger.test.mjs cases that exercise the REAL spawner and assert a
 *   row reaches 'verified' — "verified requires --run-tests AND green tests
 *   AND a review ref" and "a SCALAR review ref counts like a 1-element array
 *   for verified" — failed 2 of 3 consecutive runs, then passed 10+ in a row.
 *   Nothing else in the file flaked. Both failures were the SAFE direction: a
 *   genuinely green row computed one rung BELOW verified.
 *
 * ROOT CAUSE — a split-multibyte decode bug in defaultSpawn, not a race.
 *   defaultSpawn accumulated child output with `stdout += d`, where `d` is a
 *   raw Buffer. `string += Buffer` coerces via Buffer#toString(), which
 *   decodes THAT CHUNK IN ISOLATION. A UTF-8 sequence straddling a chunk
 *   boundary therefore decodes to U+FFFD on both sides and is unrecoverable.
 *   countPasses() identifies passing tests by node's spec-reporter marker
 *   `✔` (U+2714 — THREE bytes, e2 9c 94). When the pipe happened to break
 *   between those bytes, every `✔` on the affected line was corrupted,
 *   countPasses() returned 0, `ok` went false, and the row lost 'verified'.
 *   Chunk boundaries are decided by pipe/OS scheduling, so the failure rate
 *   tracks machine load — hence "flaky", and hence only the two tests whose
 *   assertions depend on PARSED stdout. Demonstrated deterministically:
 *     const b = Buffer.from('✔ ok (0.65ms)\n');
 *     ('' + b.subarray(0,1) + b.subarray(1)).includes('✔')  // => false
 *
 * RULED OUT (each checked, none is the cause)
 *   - Unawaited spawn: the promise resolves on 'close' (not 'exit'), which
 *     fires only after both stdio streams are closed, and ledger.mjs awaits
 *     runTestRefs in a sequential for-loop.
 *   - Fixed timeout: there is no timeout anywhere on this path.
 *   - Shared temp path: each test builds its own mkdtempSync() fixture root
 *     and removes only that root.
 *   - cwd contention: every spawn gets its own fixture root as cwd.
 *
 * FIX
 *   child.stdout/stderr.setEncoding('utf8') installs a StringDecoder that
 *   buffers an incomplete trailing sequence until its continuation bytes
 *   arrive, so the accumulated text is byte-exact regardless of how the
 *   stream is chunked. This removes the load sensitivity at its source; it
 *   is NOT a retry, a sleep, or a weakened assertion — the no-false-verified
 *   rule and both assertions are untouched.
 *
 * NOTE — the parse remains fail-safe by construction: any output countPasses()
 *   cannot read counts as 0 passes, so a decode problem can only ever cost a
 *   row its 'verified', never manufacture one.
 */

import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SRC_TAURI_DIR = join(REPO_ROOT, 'src-tauri');

const CARGO_REF_PATTERN = /^cargo:(.+)$/;

/**
 * Map one refs.tests entry to a runnable command descriptor, or `null` if
 * this runner does not know how to execute it.
 *
 * @param {string} ref
 * @param {{ repoRoot?: string, srcTauriDir?: string }} [opts]
 * @returns {{ kind: 'node-test'|'cargo-test', ref: string, command: string, args: string[], cwd: string } | null}
 */
export function mapTestRefToCommand(ref, opts = {}) {
  const repoRoot = opts.repoRoot ?? REPO_ROOT;
  const srcTauriDir = opts.srcTauriDir ?? SRC_TAURI_DIR;

  if (typeof ref !== 'string' || ref.trim().length === 0) return null;

  if (ref.endsWith('.test.mjs')) {
    return {
      kind: 'node-test',
      ref,
      command: 'node',
      args: ['--test', ref],
      cwd: repoRoot,
    };
  }

  const cargoMatch = CARGO_REF_PATTERN.exec(ref);
  if (cargoMatch) {
    const testName = cargoMatch[1];
    return {
      kind: 'cargo-test',
      ref,
      command: 'cargo',
      args: ['test', testName, '--no-fail-fast'],
      cwd: srcTauriDir,
    };
  }

  return null;
}

/**
 * Parse the number of PASSING tests out of a runner's stdout.
 *   - node-test: TAP summary `# pass N` (non-TTY default on older nodes) or
 *     the spec reporter's `ℹ pass N` line.
 *   - cargo: `test result: ok. N passed; ...`
 * Returns 0 when no summary is found — for the hollow-run guard an
 * unparseable output must never count as green evidence.
 * @param {string} kind 'node-test' | 'cargo'
 * @param {string} stdout
 * @returns {number}
 */
export function countPasses(kind, stdout) {
  const text = String(stdout ?? '');
  if (kind === 'cargo-test') {
    // cargo has no implicit file-level test; the summary is trustworthy.
    let total = 0;
    for (const m of text.matchAll(/(\d+) passed/g)) total += Number(m[1]);
    return total;
  }
  // node-test: the summary (`# pass N` / `ℹ pass N`) is NOT trustworthy — a
  // file with zero test() calls still reports "pass 1" because the runner
  // counts the FILE itself as an implicit passing test. Count NAMED passing
  // test points instead (spec reporter `✔ name (Nms)` / TAP `ok N - name`)
  // and exclude points whose name is a test-file path (the implicit
  // file-level test is always named after the file).
  const isFilePoint = (name) =>
    /\.test\.(mjs|cjs|js|mts|ts)$/i.test(name.trim().replace(/['"]/g, ''));
  let count = 0;
  for (const m of text.matchAll(/^\s*✔ (.+?) \([\d.]+ms\)\s*$/gm)) {
    if (!isFilePoint(m[1])) count++;
  }
  if (count > 0) return count;
  for (const m of text.matchAll(/^ok \d+ - (.+?)(?:\s*#.*)?$/gm)) {
    if (!isFilePoint(m[1])) count++;
  }
  return count;
}

/**
 * Default spawner: actually runs a mapped command and resolves its exit
 * code. Tests must never exercise this — they inject a stub `spawnFn`
 * instead so `node --test` never shells out to `cargo`.
 *
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd: string }} spawnOpts
 * @returns {Promise<{ code: number, stdout: string, stderr: string, error?: string }>}
 */
function defaultSpawn(command, args, spawnOpts) {
  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      // Strip the test-runner context vars: when THIS process is itself a
      // `node --test` child (e.g. ledger.test.mjs exercising the real
      // spawner), an inherited NODE_TEST_CONTEXT makes the grandchild emit
      // the runner's internal serialization instead of the spec/TAP text
      // countPasses() parses.
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      child = spawn(command, args, {
        cwd: spawnOpts?.cwd,
        shell: process.platform === 'win32',
        env,
      });
    } catch (err) {
      resolvePromise({ code: -1, stdout, stderr, error: String(err) });
      return;
    }
    // ROOT-CAUSE FIX (see the RCA in this file's header block): decode the
    // pipes as UTF-8 with a streaming decoder instead of concatenating raw
    // Buffers. `stdout += chunk` coerces EACH chunk independently via
    // Buffer#toString(), so a multi-byte character straddling a chunk
    // boundary is decoded as U+FFFD on both sides and is destroyed. The
    // spec reporter's pass marker `✔` (U+2714) is 3 bytes in UTF-8, so a
    // boundary landing inside it silently zeroes countPasses(). setEncoding
    // installs a StringDecoder that holds the partial sequence until the
    // continuation bytes arrive.
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (d) => {
      stdout += d;
    });
    child.stderr?.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) => {
      resolvePromise({ code: -1, stdout, stderr, error: String(err) });
    });
    child.on('close', (code) => {
      resolvePromise({ code: code ?? -1, stdout, stderr });
    });
  });
}

/**
 * Run every mapped command for `refs` (an array of refs.tests strings from
 * one manifest row), caching per-ref results in `cache` so repeated refs
 * (shared across rows, or re-checked within one invocation) only run once.
 *
 * @param {string[]} refs
 * @param {{
 *   spawnFn?: (command: string, args: string[], opts: { cwd: string }) => Promise<{ code: number }>,
 *   cache?: Map<string, object>,
 *   repoRoot?: string,
 *   srcTauriDir?: string,
 * }} [opts]
 * @returns {Promise<Array<{ ref: string, mapped: boolean, kind?: string, command?: string, args?: string[], cwd?: string, exitCode?: number, ok: boolean, skipped?: boolean }>>}
 */
export async function runTestRefs(refs, opts = {}) {
  const spawnFn = opts.spawnFn ?? defaultSpawn;
  const cache = opts.cache ?? new Map();
  const results = [];

  for (const ref of refs ?? []) {
    if (cache.has(ref)) {
      results.push(cache.get(ref));
      continue;
    }

    const mapped = mapTestRefToCommand(ref, { repoRoot: opts.repoRoot, srcTauriDir: opts.srcTauriDir });
    if (!mapped) {
      const entry = { ref, mapped: false, ok: false, skipped: true };
      cache.set(ref, entry);
      results.push(entry);
      continue;
    }

    const outcome = await spawnFn(mapped.command, mapped.args, { cwd: mapped.cwd });
    // Hollow-run guard (G3-R-adv finding 1): `node --test` on a file with zero
    // test() calls — and `cargo test <name>` matching zero tests — both exit 0,
    // which must NOT count as green evidence for 'verified'. When the spawner
    // captured stdout (the real defaultSpawn always does), require >=1 actually
    // passing test; an unparseable summary counts as 0 (safe direction — a
    // false "not verified" is honest, a false "verified" is the epic's fail
    // condition). Stub spawners that return only { code } keep exit-code-only
    // semantics so command-construction tests stay meaningful.
    const passCount =
      typeof outcome.stdout === 'string' ? countPasses(mapped.kind, outcome.stdout) : null;
    const entry = {
      ref,
      mapped: true,
      kind: mapped.kind,
      command: mapped.command,
      args: mapped.args,
      cwd: mapped.cwd,
      exitCode: outcome.code,
      passCount,
      ok: outcome.code === 0 && (passCount === null || passCount > 0),
    };
    cache.set(ref, entry);
    results.push(entry);
  }

  return results;
}

/**
 * Decide whether a manifest row reaches 'verified' given its `refs` and the
 * (already-run) test results for `refs.tests`.
 *
 * A row is 'verified' only when:
 *   1. `row.refs.review` is non-empty, AND
 *   2. `testResults` was supplied (i.e. --run-tests ran) with at least one
 *      MAPPED entry, AND
 *   3. every mapped entry has `ok === true`.
 *
 * Unmapped refs (skipped) are ignored for pass/fail purposes — they neither
 * block nor satisfy the gate — but they also cannot single-handedly satisfy
 * rule 2: at least one ref must actually have been runnable.
 *
 * @param {{ refs?: { review?: string[] } }} row
 * @param {Array<{ mapped: boolean, ok: boolean }>} testResults
 * @returns {boolean}
 */
export function reachesVerified(row, testResults) {
  // Normalize: the manifest schema permits review as string|array (G3-R-adv
  // finding 2) — a scalar review ref must count exactly like a 1-element array,
  // matching checkRefExists's semantics.
  const raw = row?.refs?.review;
  const reviewRefs = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (reviewRefs.length === 0) return false;

  if (!Array.isArray(testResults) || testResults.length === 0) return false;

  const mapped = testResults.filter((r) => r && r.mapped);
  if (mapped.length === 0) return false;

  return mapped.every((r) => r.ok === true);
}

export const __internal = { REPO_ROOT, SRC_TAURI_DIR };
