#!/usr/bin/env node
/**
 * tools/doc-graph/e2e-g35.test.mjs — G3.5-T5 end-to-end regression.
 *
 * WHY THIS IS A `*.test.mjs` AND NOT AN `e2e-check-g35.mjs`
 * --------------------------------------------------------
 * G1/G2/G3 each shipped a standalone `e2e-check-g*.mjs` script. Those scripts
 * are NOT covered by the epic's verify_command (`node --test
 * "tools/doc-graph/*.test.mjs"`), so an epic could go green without its own
 * end-to-end check ever running — which is exactly how G3 produced a
 * meaningless green at 22:10. This file is named `*.test.mjs` so the verify
 * gate genuinely executes it every time.
 *
 * ANTI-VACUOUS-GREEN GUARD
 * ------------------------
 * The task depends on ALL G3.5 authoring tasks. Section 0 below asserts the
 * G3.5 surface EXISTS (LEDGER_GROUPS with a real `fr` group, EMPTY_GROUP_LINE,
 * phaseTargetSource, DERIVED_PHASE_MARKER). If the authoring code is absent
 * this file fails to import / fails section 0, so it cannot pass ahead of the
 * code it exercises.
 *
 * WHAT IS ASSERTED (the four G3 guarantees, re-proved alongside G3.5's)
 *   1. Exit-code contract: exit 1 iff >=1 BLOCKING violation (status-inflation
 *      or dangling-ref), exit 0 otherwise — proved on fixtures AND on the real
 *      repo tree through a REAL child process (`node tools/doc-graph/ledger.mjs`).
 *   2. DOC-GRAPH.json merge stays ADDITIVE: generatedAt/nodes/edges/violations
 *      survive byte-identical and the key-set delta is exactly {ledger}.
 *   3. No-false-verified: `verified` is unreachable without --run-tests, without
 *      a mapped GREEN test, and without a review ref — all three are required.
 *   4. Coverage == manifest row count EXACTLY: every manifest entry appears
 *      once in the ledger block and once as a rendered MD data row.
 *   + G3.5: all three groups always render in fixed order, an empty group says
 *     `_none recorded_` out loud, and a DERIVED phase is marked inline in the
 *     generated document (the honesty rule).
 *
 * The real-tree section snapshots docs/FEATURE-LEDGER.md and docs/DOC-GRAPH.json
 * before the child run and RESTORES them afterwards, so running the suite never
 * leaves the working tree dirtier than it found it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runLedger,
  LEDGER_GROUPS,
  EMPTY_GROUP_LINE,
  GENERATED_MARKER,
  DERIVED_PHASE_MARKER,
  phaseTargetSource,
} from './ledger.mjs';
import { loadManifest } from './ledger-manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const LEDGER_CLI = join(HERE, 'ledger.mjs');
const REAL_MANIFEST = join(REPO_ROOT, 'docs', 'feature-ledger.manifest.yaml');
const REAL_LEDGER_MD = join(REPO_ROOT, 'docs', 'FEATURE-LEDGER.md');
const REAL_DOC_GRAPH = join(REPO_ROOT, 'docs', 'DOC-GRAPH.json');

const CHILD_TIMEOUT_MS = 30_000;

// The four top-level DOC-GRAPH.json keys the ledger merge must never disturb.
const PRESERVED_KEYS = ['generatedAt', 'nodes', 'edges', 'violations'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runCli(args, { cwd = REPO_ROOT } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [LEDGER_CLI, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, CHILD_TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stdout, stderr, timedOut });
    });
  });
}

/**
 * Count FEATURE-LEDGER.md ledger DATA rows per group heading. Header-driven
 * (locate the row carrying both `ID` and `Kind`) so it survives column
 * additions/reorders, and splits on UNESCAPED pipes only because mdEscape'd
 * titles may contain a literal `\|`.
 */
function parseLedgerMd(md) {
  const groups = new Map(); // heading -> { rows: [cells], empty: bool }
  let heading = null;
  let inTable = false;
  let headerCells = null;
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const h2 = /^## (.+)$/.exec(line);
    if (h2) {
      heading = h2[1];
      inTable = false;
      headerCells = null;
      if (!groups.has(heading)) groups.set(heading, { rows: [], empty: false });
      continue;
    }
    if (heading === null) continue;
    if (line === EMPTY_GROUP_LINE) {
      groups.get(heading).empty = true;
      continue;
    }
    if (!line.startsWith('|')) {
      inTable = false;
      headerCells = null;
      continue;
    }
    const cells = line.split(/(?<!\\)\|/).map((c) => c.trim());
    if (cells.includes('ID') && cells.includes('Kind')) {
      // "Rows by kind" summary table has no ID column, so this only matches
      // a real ledger table header.
      inTable = true;
      headerCells = cells;
      continue;
    }
    if (cells.includes('ID') && cells.includes('Computed')) {
      inTable = true;
      headerCells = cells;
      continue;
    }
    if (!inTable || !headerCells) continue;
    if (cells.every((c) => c === '' || /^-+$/.test(c))) continue; // separator
    const row = {};
    for (let i = 0; i < headerCells.length; i++) row[headerCells[i]] = cells[i];
    groups.get(heading).rows.push(row);
  }
  return groups;
}

function totalDataRows(groups) {
  let n = 0;
  for (const [, g] of groups) n += g.rows.length;
  return n;
}

// --- fixture builder (same shape as ledger.test.mjs, kept local so this file
// --- stands alone as the epic's end-to-end gate) ---------------------------

function makeFixtureRepo({ redTest = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'g35-e2e-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'tests'), { recursive: true });

  writeFileSync(join(root, 'src', 'thing.js'), 'export const thing = 1;\n', 'utf8');
  writeFileSync(
    join(root, 'tests', 'green.test.mjs'),
    "import test from 'node:test';\ntest('ok', () => {});\n",
    'utf8'
  );
  writeFileSync(
    join(root, 'tests', 'red.test.mjs'),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('nope', () => { assert.equal(1, 2); });\n",
    'utf8'
  );
  writeFileSync(join(root, 'docs', 'review-record.md'), '# Review: PASS\n', 'utf8');
  // A doc that really STATES a phase — content-level backing for
  // `phase_source: doc` claims (G35-R-adv finding 1).
  writeFileSync(
    join(root, 'docs', 'phased-doc.md'),
    '> **Module:** X · **Phase:** 3\n\n# X\n',
    'utf8'
  );
  writeFileSync(
    join(root, 'docs', 'DOC-GRAPH.json'),
    JSON.stringify(
      {
        generatedAt: '2026-07-20T00:00:00.000Z',
        nodes: [{ id: 'n1', path: 'docs/x.md' }],
        edges: [{ from: 'n1', to: 'n1' }],
        violations: [{ kind: 'pre-existing', detail: 'must survive the merge' }],
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  if (redTest) {
    /* nothing extra — the red fixture is already written above */
  }
  return root;
}

function entryYaml({ id, kind = 'feature', claimed, phase_source, refs }) {
  const lines = [
    `  - id: ${id}`,
    `    title: Row ${id}`,
    `    kind: ${kind}`,
    '    phase_target: P3',
  ];
  if (claimed) lines.push(`    claimed_status: ${claimed}`);
  if (phase_source) lines.push(`    phase_source: ${phase_source}`);
  lines.push('    refs:');
  const kinds = Object.keys(refs ?? {});
  if (kinds.length === 0) lines.push('      docs: []');
  for (const k of kinds) {
    const v = refs[k];
    lines.push(`      ${k}: [${(Array.isArray(v) ? v : [v]).join(', ')}]`);
  }
  return lines.join('\n');
}

function writeManifest(root, entries) {
  writeFileSync(
    join(root, 'docs', 'feature-ledger.manifest.yaml'),
    'entries:\n' + entries.map(entryYaml).join('\n') + '\n',
    'utf8'
  );
}

function readGraph(root) {
  return JSON.parse(readFileSync(join(root, 'docs', 'DOC-GRAPH.json'), 'utf8'));
}

function readMd(root) {
  return readFileSync(join(root, 'docs', 'FEATURE-LEDGER.md'), 'utf8');
}

// ===========================================================================
// Section 0 — anti-vacuous-green guard: the G3.5 surface must EXIST
// ===========================================================================

test('e2e-g35 §0: the G3.5 authoring surface exists (guards against a vacuous green)', () => {
  assert.ok(Array.isArray(LEDGER_GROUPS), 'LEDGER_GROUPS is exported');
  assert.deepEqual(
    LEDGER_GROUPS.map(([kind]) => kind),
    ['feature', 'fr', 'nfr'],
    'all three groups exist, in the DoD-pinned order, including a real `fr` group'
  );
  assert.equal(typeof EMPTY_GROUP_LINE, 'string');
  assert.ok(EMPTY_GROUP_LINE.length > 0, 'empty groups have an explicit spoken line');
  assert.equal(typeof phaseTargetSource, 'function');
  assert.equal(phaseTargetSource('doc'), 'sourced');
  assert.equal(phaseTargetSource('heuristic'), 'derived');
  assert.equal(phaseTargetSource(undefined), 'derived', 'silence defaults to derived, never sourced');
  assert.ok(DERIVED_PHASE_MARKER.length > 0, 'derived cells have an inline marker');
});

// ===========================================================================
// Section 1 — exit-code contract (G3 guarantee 1), on fixtures
// ===========================================================================

test('e2e-g35 §1a: a clean tree exits 0 (no blocking violations)', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'f-clean', kind: 'feature', refs: { code: 'src/thing.js' } },
    ]);
    const res = await runLedger({ repoRoot: root });
    assert.equal(res.exitCode, 0);
    assert.equal(res.violations.filter((v) => v.blocking).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('e2e-g35 §1b: status-inflation is BLOCKING -> exit 1', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'f-inflated', kind: 'feature', claimed: 'verified', refs: { code: 'src/thing.js' } },
    ]);
    const res = await runLedger({ repoRoot: root });
    assert.equal(res.exitCode, 1, 'a claim that outruns the evidence must exit 1');
    const v = res.violations.find((x) => x.type === 'status-inflation');
    assert.ok(v && v.blocking === true, 'status-inflation is recorded and blocking');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('e2e-g35 §1c: a dangling ref is BLOCKING -> exit 1', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'f-dangling', kind: 'feature', refs: { code: 'src/does-not-exist.js' } },
    ]);
    const res = await runLedger({ repoRoot: root });
    assert.equal(res.exitCode, 1, 'a ref that does not resolve on disk must exit 1');
    const v = res.violations.find((x) => x.type === 'dangling-ref');
    assert.ok(v && v.blocking === true, 'dangling-ref is recorded and blocking');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('e2e-g35 §1d: status-understated is INFORMATIONAL -> still exit 0', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'f-under', kind: 'feature', claimed: 'doc-only', refs: { code: 'src/thing.js' } },
    ]);
    const res = await runLedger({ repoRoot: root });
    assert.equal(res.exitCode, 0, 'an understated claim must not block the gate');
    const v = res.violations.find((x) => x.type === 'status-understated');
    assert.ok(v && v.blocking === false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// Section 2 — DOC-GRAPH.json merge stays additive (G3 guarantee 2)
// ===========================================================================

test('e2e-g35 §2: the DOC-GRAPH.json write preserves generatedAt/nodes/edges/violations and adds ONLY `ledger`', async () => {
  const root = makeFixtureRepo();
  try {
    const before = readGraph(root);
    const beforeKeys = Object.keys(before).sort();
    writeManifest(root, [
      { id: 'f-1', kind: 'feature', refs: { code: 'src/thing.js' } },
      { id: 'fr-1', kind: 'fr', refs: { code: 'src/thing.js' } },
    ]);
    await runLedger({ repoRoot: root });
    const after = readGraph(root);

    for (const k of PRESERVED_KEYS) {
      assert.ok(k in after, `${k} survives the merge`);
      assert.deepEqual(after[k], before[k], `${k} survives the merge UNMODIFIED`);
    }
    const added = Object.keys(after).filter((k) => !beforeKeys.includes(k));
    assert.deepEqual(added, ['ledger'], 'the merge adds exactly one key: `ledger`');
    const removed = beforeKeys.filter((k) => !(k in after));
    assert.deepEqual(removed, [], 'the merge removes nothing');

    assert.equal(after.ledger._generated, GENERATED_MARKER);
    assert.equal(after.ledger.rowCount, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// Section 3 — no-false-verified (G3 guarantee 3). All THREE inputs required.
// ===========================================================================

test('e2e-g35 §3a: `verified` is unreachable WITHOUT --run-tests', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      {
        id: 'f-unrun',
        kind: 'feature',
        refs: { code: 'src/thing.js', tests: 'tests/green.test.mjs', review: 'docs/review-record.md' },
      },
    ]);
    const res = await runLedger({ repoRoot: root, runTests: false });
    const row = res.rows.find((r) => r.id === 'f-unrun');
    assert.equal(row.computed, 'code+tests-present (unrun)');
    assert.notEqual(row.computed, 'verified', 'file existence alone can never buy verified');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('e2e-g35 §3b: `verified` is unreachable WITHOUT a review ref, even with --run-tests + green tests', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'f-noreview', kind: 'feature', refs: { code: 'src/thing.js', tests: 'tests/green.test.mjs' } },
    ]);
    const res = await runLedger({ repoRoot: root, runTests: true });
    const row = res.rows.find((r) => r.id === 'f-noreview');
    assert.notEqual(row.computed, 'verified');
    assert.equal(row.computed, 'code+needs-test-or-review');
    assert.ok(row.gaps.includes('review record missing'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('e2e-g35 §3c: `verified` is unreachable when a MAPPED test runs RED', async () => {
  const root = makeFixtureRepo({ redTest: true });
  try {
    writeManifest(root, [
      {
        id: 'f-red',
        kind: 'feature',
        refs: { code: 'src/thing.js', tests: 'tests/red.test.mjs', review: 'docs/review-record.md' },
      },
    ]);
    const res = await runLedger({ repoRoot: root, runTests: true });
    const row = res.rows.find((r) => r.id === 'f-red');
    assert.notEqual(row.computed, 'verified', 'a red mapped test must never reach verified');
    assert.equal(row.computed, 'code+needs-test-or-review');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('e2e-g35 §3d: `verified` IS reached with --run-tests + a GREEN mapped test + a review ref', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      {
        id: 'f-green',
        kind: 'feature',
        refs: { code: 'src/thing.js', tests: 'tests/green.test.mjs', review: 'docs/review-record.md' },
      },
    ]);
    const res = await runLedger({ repoRoot: root, runTests: true });
    const row = res.rows.find((r) => r.id === 'f-green');
    assert.equal(row.computed, 'verified', 'the positive leg must still work — the gate is tight, not welded shut');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// Section 4 — coverage == manifest row count EXACTLY (G3 guarantee 4)
// ===========================================================================

test('e2e-g35 §4: ledger block AND rendered MD each cover every manifest row exactly once', async () => {
  const root = makeFixtureRepo();
  try {
    const entries = [
      { id: 'f-a', kind: 'feature', refs: { code: 'src/thing.js' } },
      { id: 'f-b', kind: 'feature', refs: { code: 'src/thing.js' } },
      { id: 'fr-a', kind: 'fr', refs: { code: 'src/thing.js' } },
      { id: 'nfr-a', kind: 'nfr', refs: { code: 'src/thing.js' } },
    ];
    writeManifest(root, entries);
    const manifestRows = loadManifest(join(root, 'docs', 'feature-ledger.manifest.yaml'));
    assert.equal(manifestRows.length, entries.length);

    const res = await runLedger({ repoRoot: root });
    assert.equal(res.rows.length, manifestRows.length, 'in-memory coverage == manifest rows');

    const graph = readGraph(root);
    assert.equal(graph.ledger.rowCount, manifestRows.length, 'ledger.rowCount == manifest rows');
    assert.equal(graph.ledger.rows.length, manifestRows.length, 'ledger.rows == manifest rows');
    assert.deepEqual(
      graph.ledger.rows.map((r) => r.id).sort(),
      manifestRows.map((r) => r.id).sort(),
      'no row invented, no row dropped'
    );

    const groups = parseLedgerMd(readMd(root));
    assert.equal(totalDataRows(groups), manifestRows.length, 'rendered MD data rows == manifest rows');
    const renderedIds = [];
    for (const [, g] of groups) for (const r of g.rows) renderedIds.push(r.ID);
    assert.deepEqual(renderedIds.sort(), manifestRows.map((r) => r.id).sort());

    // byKind must also sum to the row count — no row falls outside a group.
    const kindSum = Object.values(graph.ledger.byKind).reduce((a, b) => a + b, 0);
    assert.equal(kindSum, manifestRows.length, 'byKind partition is total');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// Section 5 — the NEW G3.5 guarantees hold alongside the G3 ones
// ===========================================================================

test('e2e-g35 §5a: all three groups always render, in fixed order; an empty group says so out loud', async () => {
  const root = makeFixtureRepo();
  try {
    // Deliberately NO fr row — the empty group must still print its heading.
    writeManifest(root, [
      { id: 'f-only', kind: 'feature', refs: { code: 'src/thing.js' } },
      { id: 'nfr-only', kind: 'nfr', refs: { code: 'src/thing.js' } },
    ]);
    await runLedger({ repoRoot: root });
    const md = readMd(root);
    const headings = LEDGER_GROUPS.map(([, h]) => h);
    const positions = headings.map((h) => md.indexOf(`## ${h}`));
    for (let i = 0; i < headings.length; i++) {
      assert.ok(positions[i] >= 0, `group heading "${headings[i]}" is present`);
    }
    for (let i = 1; i < positions.length; i++) {
      assert.ok(positions[i] > positions[i - 1], 'groups render in the DoD-pinned order');
    }
    const groups = parseLedgerMd(md);
    const frHeading = LEDGER_GROUPS.find(([k]) => k === 'fr')[1];
    assert.equal(groups.get(frHeading).rows.length, 0);
    assert.equal(groups.get(frHeading).empty, true, 'an empty group states "none recorded" explicitly');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('e2e-g35 §5b: a DERIVED phase is marked inline in the generated document; a SOURCED phase is not', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'f-derived', kind: 'feature', refs: { code: 'src/thing.js' } }, // no phase_source
      { id: 'f-heur', kind: 'feature', phase_source: 'heuristic', refs: { code: 'src/thing.js' } },
      // G3.5-T6 + G35-R-adv finding 1: a `doc` label only earns a clean cell
      // when a docs ref backs it AND that doc actually STATES a phase.
      {
        id: 'f-sourced',
        kind: 'feature',
        phase_source: 'doc',
        refs: { docs: 'docs/phased-doc.md', code: 'src/thing.js' },
      },
      // ...and a `doc` label with NO backing document must not.
      { id: 'f-unbacked', kind: 'feature', phase_source: 'doc', refs: { code: 'src/thing.js' } },
    ]);
    const res = await runLedger({ repoRoot: root });
    assert.equal(res.rows.find((r) => r.id === 'f-derived').phase_target_source, 'derived');
    assert.equal(res.rows.find((r) => r.id === 'f-heur').phase_target_source, 'derived');
    assert.equal(res.rows.find((r) => r.id === 'f-sourced').phase_target_source, 'sourced');
    assert.equal(res.rows.find((r) => r.id === 'f-unbacked').phase_target_source, 'derived');
    assert.ok(
      res.violations.some((v) => v.type === 'unbacked-phase-source' && v.id === 'f-unbacked' && !v.blocking),
      'the downgrade is recorded as a non-blocking violation'
    );

    const groups = parseLedgerMd(readMd(root));
    const byId = new Map();
    for (const [, g] of groups) for (const r of g.rows) byId.set(r.ID, r);
    assert.ok(byId.get('f-derived').Phase.includes(DERIVED_PHASE_MARKER), 'derived cell marked in the DOC itself');
    assert.ok(byId.get('f-heur').Phase.includes(DERIVED_PHASE_MARKER));
    assert.ok(
      byId.get('f-unbacked').Phase.includes(DERIVED_PHASE_MARKER),
      'an unbacked `doc` claim renders marked, not clean'
    );
    assert.ok(
      !byId.get('f-sourced').Phase.includes(DERIVED_PHASE_MARKER),
      'a sourced phase renders clean — the marker means something'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ===========================================================================
// Section 6 — the real thing: full generator, real child process, real tree
// ===========================================================================

test('e2e-g35 §6: full generator on the REAL repo tree — honest exit code, additive merge, exact coverage', async (t) => {
  if (!existsSync(REAL_MANIFEST)) {
    t.skip('no docs/feature-ledger.manifest.yaml on this tree');
    return;
  }

  // Snapshot the two generated artifacts so this test leaves no residue.
  const snapshots = [];
  for (const p of [REAL_LEDGER_MD, REAL_DOC_GRAPH]) {
    snapshots.push({ path: p, existed: existsSync(p), body: existsSync(p) ? readFileSync(p, 'utf8') : null });
  }
  const graphBefore = existsSync(REAL_DOC_GRAPH)
    ? JSON.parse(readFileSync(REAL_DOC_GRAPH, 'utf8'))
    : null;

  try {
    const res = await runCli(['--quiet']);
    assert.equal(res.timedOut, false, 'the generator must not hang');
    assert.equal(res.signal, null, `the generator must not be killed (stderr: ${res.stderr})`);
    assert.ok(
      res.code === 0 || res.code === 1,
      `exit code must be 0 or 1 (honest), got ${res.code}. stderr:\n${res.stderr}`
    );

    // Artifacts exist and carry the GENERATED marker.
    assert.ok(existsSync(REAL_LEDGER_MD), 'FEATURE-LEDGER.md written');
    assert.ok(existsSync(REAL_DOC_GRAPH), 'DOC-GRAPH.json written');
    const md = readFileSync(REAL_LEDGER_MD, 'utf8');
    assert.ok(md.includes(GENERATED_MARKER), 'FEATURE-LEDGER.md keeps its GENERATED header');

    const graphAfter = JSON.parse(readFileSync(REAL_DOC_GRAPH, 'utf8'));
    assert.ok(graphAfter.ledger && typeof graphAfter.ledger === 'object', '`ledger` block present');
    assert.equal(graphAfter.ledger._generated, GENERATED_MARKER);

    if (graphBefore) {
      for (const k of PRESERVED_KEYS) {
        assert.ok(k in graphAfter, `${k} survives the real merge`);
        if (k in graphBefore) {
          assert.deepEqual(graphAfter[k], graphBefore[k], `${k} survives the real merge UNMODIFIED`);
        }
      }
      const beforeKeys = Object.keys(graphBefore);
      const added = Object.keys(graphAfter).filter((k) => !beforeKeys.includes(k));
      assert.ok(
        added.length === 0 || (added.length === 1 && added[0] === 'ledger'),
        `the real merge adds at most the \`ledger\` key, added=${JSON.stringify(added)}`
      );
      const removed = beforeKeys.filter((k) => !(k in graphAfter));
      assert.deepEqual(removed, [], 'the real merge removes nothing');
    }

    // Exit code must AGREE with the recorded blocking violations — the code
    // cannot be honest by luck.
    const blocking = (graphAfter.ledger.violations ?? []).filter((v) => v.blocking);
    assert.equal(
      res.code,
      blocking.length > 0 ? 1 : 0,
      `exit code must match blocking-violation count (${blocking.length} blocking)`
    );
    for (const v of blocking) {
      assert.ok(
        v.type === 'status-inflation' || v.type === 'dangling-ref',
        `only status-inflation / dangling-ref may block, got "${v.type}"`
      );
    }

    // Coverage == manifest row count, exactly, on the real manifest.
    const manifestRows = loadManifest(REAL_MANIFEST);
    assert.equal(graphAfter.ledger.rowCount, manifestRows.length, 'real ledger.rowCount == manifest rows');
    assert.equal(graphAfter.ledger.rows.length, manifestRows.length);
    assert.deepEqual(
      graphAfter.ledger.rows.map((r) => r.id).sort(),
      manifestRows.map((r) => r.id).sort(),
      'real ledger covers every manifest row exactly once'
    );
    const groups = parseLedgerMd(md);
    assert.equal(totalDataRows(groups), manifestRows.length, 'real MD data rows == manifest rows');

    // All three groups present; the fr group is non-empty on the real tree
    // (that was the whole point of G3.5-T2).
    for (const [kind, heading] of LEDGER_GROUPS) {
      assert.ok(groups.has(heading), `real ledger renders the "${heading}" group`);
      if (kind === 'fr') {
        assert.ok(groups.get(heading).rows.length > 0, 'the real tree has >= 1 FR row (G3.5 finding 1)');
      }
    }

    // No row on the real tree may be `verified` without --run-tests.
    for (const r of graphAfter.ledger.rows) {
      assert.notEqual(
        r.computed,
        'verified',
        `row ${r.id} reached verified WITHOUT --run-tests — the no-false-verified rule regressed`
      );
    }
    assert.equal(graphAfter.ledger.runTests, false, 'this run did not pass --run-tests');
  } finally {
    // Restore the tree exactly as we found it.
    for (const s of snapshots) {
      if (s.existed) writeFileSync(s.path, s.body, 'utf8');
      else if (existsSync(s.path)) rmSync(s.path, { force: true });
    }
  }
});
