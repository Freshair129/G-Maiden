#!/usr/bin/env node
/**
 * tools/doc-graph/e2e-check-g3.mjs — E2E acceptance check for the G3 feature
 * ledger epic against the REAL repo tree.
 *
 * This follows the G1/G2 e2e-check pattern (real child process, scope-aware
 * dirty-tree rule) and — like G2, and UNLIKE G25 — treats the tool's own
 * substantive output as FINDINGS, not failures. The ledger's whole reason to
 * exist is to surface where PROJECT_FEATURE_MAP's claims outrun on-disk
 * evidence; a non-zero ledger exit caused by real status-inflation is the
 * feature working, so this check CAPTURES the ledger's exit code and its
 * per-status / per-drift counts verbatim rather than failing on them.
 *
 * What this check DOES assert (structural acceptance of G3-T5):
 *   1. `node tools/doc-graph/ledger.mjs` (no --run-tests) runs as a real child
 *      process, does not crash/timeout, exits with an HONEST code (0 = no
 *      inflation, 1 = >=1 status-inflation). Any other exit code (e.g. 2 =
 *      fatal) is a check FAILURE. The ledger step must complete in < 10s.
 *   2. Both artifacts are freshly (re)written by this run:
 *        - docs/FEATURE-LEDGER.md
 *        - the `ledger` block inside docs/DOC-GRAPH.json
 *      and DOC-GRAPH.json still carries its pre-existing top-level keys
 *      (generatedAt, nodes, edges, violations) — the merge must be additive.
 *   3. docs/FEATURE-LEDGER.md contains >= 1 data row of kind `feature` AND
 *      >= 1 of kind `nfr` (task-specified).
 *   4. `git status --porcelain` shows no modified/untracked file under the
 *      watched prefixes (tools/, docs/) OTHER than: anything under
 *      tools/doc-graph/, the manifest (docs/feature-ledger.manifest.yaml), and
 *      the two generated artifacts (docs/FEATURE-LEDGER.md, docs/DOC-GRAPH.json).
 *      Dirt entirely outside tools/** and docs/** (e.g. a parallel session's
 *      unrelated edits) is tolerated and only recorded.
 *   5. Whole-run wall clock < 20s.
 *
 * Usage: node tools/doc-graph/e2e-check-g3.mjs
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const LEDGER = join(HERE, 'ledger.mjs');
const LEDGER_MD = join(REPO_ROOT, 'docs', 'FEATURE-LEDGER.md');
const DOC_GRAPH_JSON = join(REPO_ROOT, 'docs', 'DOC-GRAPH.json');
const MANIFEST = join(REPO_ROOT, 'docs', 'feature-ledger.manifest.yaml');

const LEDGER_BUDGET_MS = 10_000; // task: ledger must complete < 10s
const STEP_TIMEOUT_MS = 15_000; // hard kill a bit above the assertion budget
const WHOLE_RUN_BUDGET_MS = 20_000;

// Scope: tools/doc-graph/** is wholesale in-scope; in docs/** only the manifest
// and the two generated artifacts are in-scope.
const ALLOWED_TOOLS_PREFIX = 'tools/doc-graph/';
const ALLOWED_DOCS_EXACT = new Set([
  'docs/feature-ledger.manifest.yaml',
  'docs/FEATURE-LEDGER.md',
  'docs/DOC-GRAPH.json',
]);
const WATCHED_PREFIXES = ['tools/', 'docs/'];

function norm(p) {
  return p.replace(/\\/g, '/');
}
function isWatched(relPath) {
  const p = norm(relPath);
  return WATCHED_PREFIXES.some((pre) => p.startsWith(pre));
}
function isInScope(relPath) {
  const p = norm(relPath);
  return p.startsWith(ALLOWED_TOOLS_PREFIX) || ALLOWED_DOCS_EXACT.has(p);
}

function runNode(scriptPath, args, timeoutMs) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    if (!existsSync(scriptPath)) {
      resolvePromise({ missing: true, crashed: false, code: null, signal: null, stdout: '', stderr: '', durationMs: 0, timedOut: false });
      return;
    }
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({ missing: false, crashed: true, error: err, stdout, stderr, durationMs: Date.now() - startedAt, timedOut });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ missing: false, crashed: false, code, signal, stdout, stderr, durationMs: Date.now() - startedAt, timedOut });
    });
  });
}

function unquoteGitPath(p) {
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) {
    return p.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return p;
}
function gitStatusPorcelain() {
  const out = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.length > 0)
    .map((l) => ({ raw: l, path: unquoteGitPath(l.slice(3)) }));
}

/**
 * Count FEATURE-LEDGER.md ledger data rows by kind. Header-driven rather
 * than a hardcoded column index: locate the ledger table's header row (it
 * contains both `ID` and `Kind` columns — the "Rows by kind" summary table
 * has no `ID` column), then read each data row's Kind cell by that index.
 * This survives column additions/reorders (e.g. the Title column T3 added).
 */
function countLedgerRowsByKind(md) {
  const counts = {};
  let kindIdx = -1;
  for (const line of md.split('\n')) {
    if (!line.startsWith('|')) {
      kindIdx = -1; // a non-table line ends the current table
      continue;
    }
    // split on UNESCAPED pipes only — cell content may carry a literal
    // `\|` (mdEscape'd titles like `[สด \| บิลด์]`).
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
    if (cells.includes('ID') && cells.includes('Kind')) {
      kindIdx = cells.indexOf('Kind');
      continue;
    }
    if (kindIdx === -1) continue;
    const kind = cells[kindIdx];
    if (kind === 'feature' || kind === 'nfr' || kind === 'fr') {
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
  }
  return counts;
}

async function main() {
  const wallStart = Date.now();
  let ok = true;

  // --- Step 1: run the ledger generator --------------------------------
  console.log(`[e2e-check-g3] launching: node ${LEDGER}`);
  const launchedAt = Date.now();
  const res = await runNode(LEDGER, [], STEP_TIMEOUT_MS);

  if (res.missing) {
    console.error(`[e2e-check-g3] FAIL: ${LEDGER} does not exist.`);
    ok = false;
  } else if (res.crashed) {
    console.error(`[e2e-check-g3] FAIL: ledger.mjs failed to launch: ${res.error}`);
    ok = false;
  } else if (res.timedOut) {
    console.error(`[e2e-check-g3] FAIL: ledger.mjs exceeded ${STEP_TIMEOUT_MS}ms (killed).`);
    ok = false;
  } else if (res.signal) {
    console.error(`[e2e-check-g3] FAIL: ledger.mjs terminated by signal ${res.signal}. stderr:\n${res.stderr}`);
    ok = false;
  } else if (res.code !== 0 && res.code !== 1) {
    console.error(`[e2e-check-g3] FAIL: ledger.mjs exited with unexpected code ${res.code} (only 0/1 are honest). stderr:\n${res.stderr}`);
    ok = false;
  } else {
    // HONEST exit code captured as a FINDING, not a failure.
    console.log(`[e2e-check-g3] FINDING: ledger.mjs exited ${res.code} (0=no inflation, 1=status-inflation present) in ${res.durationMs}ms.`);
    if (res.stdout.trim()) console.log(`[e2e-check-g3] ledger stdout (verbatim):\n${res.stdout.trim()}`);
    if (res.stderr.trim()) console.log(`[e2e-check-g3] ledger stderr (verbatim):\n${res.stderr.trim()}`);
    if (res.durationMs >= LEDGER_BUDGET_MS) {
      console.error(`[e2e-check-g3] FAIL: ledger.mjs took ${res.durationMs}ms, budget is < ${LEDGER_BUDGET_MS}ms.`);
      ok = false;
    } else {
      console.log(`[e2e-check-g3] OK: ledger.mjs completed in ${res.durationMs}ms (< ${LEDGER_BUDGET_MS}ms).`);
    }
  }

  // --- Step 2: artifacts freshly written + additive JSON merge ---------
  for (const [label, p] of [
    ['docs/FEATURE-LEDGER.md', LEDGER_MD],
    ['docs/DOC-GRAPH.json', DOC_GRAPH_JSON],
  ]) {
    if (!existsSync(p)) {
      console.error(`[e2e-check-g3] FAIL: missing artifact ${label}`);
      ok = false;
      continue;
    }
    const mtimeMs = statSync(p).mtimeMs;
    if (mtimeMs < launchedAt - 1000) {
      console.error(`[e2e-check-g3] FAIL: ${label} exists but was not freshly written by this run (mtime=${new Date(mtimeMs).toISOString()}).`);
      ok = false;
    } else {
      console.log(`[e2e-check-g3] OK: ${label} freshly written.`);
    }
  }

  let graph = null;
  if (existsSync(DOC_GRAPH_JSON)) {
    try {
      graph = JSON.parse(readFileSync(DOC_GRAPH_JSON, 'utf8'));
    } catch (err) {
      console.error(`[e2e-check-g3] FAIL: could not parse ${DOC_GRAPH_JSON}: ${err}`);
      ok = false;
    }
  }
  if (graph) {
    if (!graph.ledger || typeof graph.ledger !== 'object') {
      console.error('[e2e-check-g3] FAIL: DOC-GRAPH.json has no `ledger` block.');
      ok = false;
    } else {
      console.log(`[e2e-check-g3] OK: DOC-GRAPH.json ledger block present (rowCount=${graph.ledger.rowCount}, byDrift=${JSON.stringify(graph.ledger.byDrift)}).`);
    }
    const preserved = ['generatedAt', 'nodes', 'edges', 'violations'];
    const dropped = preserved.filter((k) => !(k in graph));
    if (dropped.length) {
      console.error(`[e2e-check-g3] FAIL: ledger merge dropped pre-existing DOC-GRAPH.json key(s): ${dropped.join(', ')}.`);
      ok = false;
    } else {
      console.log(`[e2e-check-g3] OK: pre-existing DOC-GRAPH.json keys preserved (${preserved.join(', ')}).`);
    }
  }

  // --- Step 3: >=1 feature row AND >=1 nfr row in the MD ---------------
  if (existsSync(LEDGER_MD)) {
    const md = readFileSync(LEDGER_MD, 'utf8');
    if (!md.includes('GENERATED')) {
      console.error('[e2e-check-g3] FAIL: FEATURE-LEDGER.md is missing the GENERATED header.');
      ok = false;
    }
    const byKind = countLedgerRowsByKind(md);
    console.log(`[e2e-check-g3] FEATURE-LEDGER.md rows by kind (verbatim): ${JSON.stringify(byKind)}`);
    for (const kind of ['feature', 'nfr']) {
      if ((byKind[kind] ?? 0) < 1) {
        console.error(`[e2e-check-g3] FAIL: FEATURE-LEDGER.md has < 1 row of kind "${kind}".`);
        ok = false;
      } else {
        console.log(`[e2e-check-g3] OK: FEATURE-LEDGER.md has ${byKind[kind]} "${kind}" row(s).`);
      }
    }
  } else {
    console.error('[e2e-check-g3] FAIL: FEATURE-LEDGER.md missing — cannot assert kind rows.');
    ok = false;
  }

  // --- Step 4: git status scope check ----------------------------------
  const entries = gitStatusPorcelain();
  const outOfScopeButWatched = [];
  const tolerated = [];
  for (const e of entries) {
    if (isInScope(e.path)) continue;
    if (isWatched(e.path)) outOfScopeButWatched.push(e);
    else tolerated.push(e);
  }
  if (tolerated.length > 0) {
    console.log(`[e2e-check-g3] INFO: ${tolerated.length} pre-existing dirty file(s) outside tools/** and docs/** — tolerated per scope-aware dirty-tree rule, recorded verbatim:`);
    for (const e of tolerated) console.log(`  ${e.raw}`);
  }
  if (outOfScopeButWatched.length > 0) {
    console.error(`[e2e-check-g3] FAIL: ${outOfScopeButWatched.length} modified/untracked file(s) under tools/** or docs/** outside the allowed G3 scope (tools/doc-graph/**, ${[...ALLOWED_DOCS_EXACT].join(', ')}):`);
    for (const e of outOfScopeButWatched) console.error(`  ${e.raw}`);
    ok = false;
  } else {
    console.log('[e2e-check-g3] OK: git status scope check passed (only tools/doc-graph/**, the manifest, and the generated artifacts touched under the watched prefixes).');
  }

  // --- Step 5: whole-run wall-clock budget -----------------------------
  const wallMs = Date.now() - wallStart;
  console.log(`[e2e-check-g3] wall-clock elapsed: ${wallMs}ms (budget ${WHOLE_RUN_BUDGET_MS}ms).`);
  if (wallMs >= WHOLE_RUN_BUDGET_MS) {
    console.error(`[e2e-check-g3] FAIL: whole run took ${wallMs}ms, budget is ${WHOLE_RUN_BUDGET_MS}ms.`);
    ok = false;
  }

  if (!ok) {
    console.error('[e2e-check-g3] FAIL');
    process.exit(1);
  }
  console.log('[e2e-check-g3] PASS');
  process.exit(0);
}

main();
