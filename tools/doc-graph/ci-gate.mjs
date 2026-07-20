#!/usr/bin/env node
/**
 * tools/doc-graph/ci-gate.mjs — the CI entry point for the doc-graph gates.
 *
 * One command, five gates, CI-safe (no git-history or dirty-tree
 * assumptions — those live in the per-epic e2e-check-g*.mjs scripts, which
 * run in the RWANG run context, not here):
 *
 *   0. The doc-graph unit suite (every *.test.mjs in this dir) is green.
 *      Spawned with an explicit file list — `node --test <dir>` and glob
 *      args are version/platform-dependent, a readdir'd list is not.
 *   1. encoding-check rejects common UTF-8 mojibake markers.
 *   2. scan --strict runs and does not crash (exit 0 or 1; >1 = FAIL).
 *   3. The G2.5 checklist-exception rule: every severity="error" violation
 *      the strict scan reports must be covered by a row in
 *      docs/approval-backfill-checklist.md (matched by the doc's slug in
 *      backticks, the checklist's table format). Errors NOT in the
 *      checklist = FAIL. This is how "strict is green" is defined since
 *      G2.5: sign-offs only Boss can give are deferred, never fabricated,
 *      and anything else must be fixed, not deferred.
 *   4. ledger.mjs exits 0 (the manifest was pruned to authoritative on
 *      2026-07-20 — any status-inflation or dangling ref from here on is a
 *      real regression, so it blocks).
 *
 * Exit: 0 all gates green, 1 otherwise. Prints verbatim counts.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const DOC_GRAPH_JSON = join(REPO_ROOT, 'docs', 'DOC-GRAPH.json');
const CHECKLIST = join(REPO_ROOT, 'docs', 'approval-backfill-checklist.md');

function runNode(script, args = []) {
  const res = spawnSync(process.execPath, [join(HERE, script), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { code: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

let ok = true;
const fail = (msg) => {
  console.error(`[ci-gate] FAIL: ${msg}`);
  ok = false;
};

// --- Gate 0: doc-graph unit suite ------------------------------------------
const testFiles = readdirSync(HERE)
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => join(HERE, f));
const suite = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  timeout: 300_000,
});
if ((suite.status ?? -1) !== 0) {
  const tail = (suite.stdout ?? '').split('\n').slice(-30).join('\n');
  fail(`doc-graph unit suite red (exit ${suite.status}).\n${tail}`);
} else {
  const m = /(?:#|ℹ) pass (\d+)/.exec(suite.stdout ?? '');
  console.log(`[ci-gate] unit suite green (${testFiles.length} files, ${m ? m[1] : '?'} tests).`);
}

// --- Gate 1: documentation encoding is clean ------------------------------
const encoding = runNode('encoding-check.mjs');
if (encoding.code !== 0) {
  fail(`encoding-check.mjs exit ${encoding.code}.\n${encoding.stderr.slice(0, 4000)}`);
} else {
  console.log('[ci-gate] encoding check exit 0 (UTF-8 mojibake markers absent).');
}

// --- Gate 2: strict scan runs ---------------------------------------------
const scan = runNode('scan.mjs', ['--strict']);
if (scan.code !== 0 && scan.code !== 1) {
  fail(`scan.mjs --strict crashed (exit ${scan.code}).\n${scan.stderr.slice(0, 2000)}`);
} else {
  console.log(`[ci-gate] scan --strict exit ${scan.code} (0|1 accepted; coverage checked next).`);
}

// --- Gate 3: every error-severity violation is checklist-covered ----------
if (existsSync(DOC_GRAPH_JSON)) {
  const graph = JSON.parse(readFileSync(DOC_GRAPH_JSON, 'utf8'));
  const errors = (graph.violations ?? []).filter((v) => v.severity === 'error');
  const checklist = existsSync(CHECKLIST) ? readFileSync(CHECKLIST, 'utf8') : '';
  // Coverage = the doc's slug appears anywhere in the checklist. The
  // checklist's two tables use different cell styles (`slug` in backticks
  // for approval rows, bare slug for invalid-status rows), so match the
  // bare slug — slugs are long and distinctive enough that a false hit
  // would require the slug verbatim in prose, which still names the doc.
  const uncovered = errors.filter((v) => {
    const docPath = String(v.doc ?? v.file ?? '');
    const slug = basename(docPath).replace(/\.md$/i, '');
    return !checklist.includes(slug);
  });
  console.log(
    `[ci-gate] strict errors: ${errors.length}, checklist-covered: ${errors.length - uncovered.length}, uncovered: ${uncovered.length}`
  );
  if (uncovered.length > 0) {
    for (const v of uncovered) {
      console.error(`[ci-gate]   uncovered: ${v.reason} ${v.doc ?? v.file}`);
    }
    fail(
      'strict violations not covered by docs/approval-backfill-checklist.md — fix them or (approval-class only) add a checklist row for Boss.'
    );
  }
} else {
  fail('docs/DOC-GRAPH.json missing after scan.');
}

// --- Gate 4: the feature ledger is clean -----------------------------------
const ledger = runNode('ledger.mjs', ['--quiet']);
if (ledger.code !== 0) {
  fail(`ledger.mjs exit ${ledger.code} — status-inflation or dangling refs regressed.\n${ledger.stderr.slice(0, 2000)}`);
} else {
  console.log('[ci-gate] ledger exit 0 (no blocking violations).');
}

console.log(ok ? '[ci-gate] PASS' : '[ci-gate] FAIL');
process.exit(ok ? 0 : 1);
