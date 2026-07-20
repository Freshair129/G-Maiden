// tools/doc-graph/ledger.test.mjs — G3-T3 tests.
//
// Drives runLedger() (and the pure helpers) against throwaway fixture repos
// built under a temp dir, covering:
//   - every status value on the ladder: doc-only, designed, in-code,
//     code+needs-test-or-review, code+tests-present (unrun), verified
//   - the no-false-verified rule (verified unreachable without --run-tests)
//   - status-inflation (blocking, exit 1) and status-understated
//     (informational, exit 0)
//   - a dangling ref (blocking, exit 1)
//   - the DOC-GRAPH.json merge preserving pre-existing top-level keys
//   - GENERATED markers on both artifacts
//
// The 'verified' case really spawns `node --test` on a trivial passing
// fixture test (no stubbing) — that is the honest path runLedger takes.
//
// RCA (G3.5-T3) for the load-sensitive `verified`-rung flake this suite used
// to exhibit: recorded in the header of tools/doc-graph/ledger-runtests.mjs,
// which is the module that owns the spawn and where the bug actually lived.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runLedger,
  computeStatus,
  classifyDrift,
  evidenceGaps,
  statusRank,
  baseStatus,
  STATUS_LADDER,
  GENERATED_MARKER,
  phaseTargetSource,
  DERIVED_PHASE_MARKER,
  DERIVED_PHASE_LEGEND,
} from './ledger.mjs';
import { countPasses } from './ledger-runtests.mjs';

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------

function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'g3-ledger-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  mkdirSync(join(root, 'tests'), { recursive: true });

  writeFileSync(
    join(root, 'docs', 'accepted-doc.md'),
    '---\ntitle: Accepted Doc\nstatus: accepted\n---\n\n# Accepted Doc\n',
    'utf8'
  );
  writeFileSync(
    join(root, 'docs', 'draft-doc.md'),
    // Carries a **Phase:** statement so it can BACK a `phase_source: doc`
    // claim (content-level check, G35-R-adv finding 1); its frontmatter
    // status stays `draft` so it still exercises the doc-only rung.
    '---\ntitle: Draft Doc\nstatus: draft\n---\n\n> **Phase:** 3\n\n# Draft Doc\n',
    'utf8'
  );
  writeFileSync(join(root, 'docs', 'no-fm-doc.md'), '# No Frontmatter\n', 'utf8');
  writeFileSync(join(root, 'src', 'thing.js'), 'export const thing = 1;\n', 'utf8');
  writeFileSync(
    join(root, 'tests', 'thing.test.mjs'),
    "import test from 'node:test';\ntest('ok', () => {});\n",
    'utf8'
  );
  writeFileSync(join(root, 'docs', 'review-record.md'), '# Review: PASS\n', 'utf8');
  // Pre-existing DOC-GRAPH.json the merge must not disturb.
  writeFileSync(
    join(root, 'docs', 'DOC-GRAPH.json'),
    JSON.stringify(
      { generatedAt: 'fixture', nodes: [{ id: 'n1' }], edges: [], violations: [] },
      null,
      2
    ) + '\n',
    'utf8'
  );
  return root;
}

function entryYaml({ id, kind = 'feature', claimed, refs }) {
  const lines = [
    `  - id: ${id}`,
    `    title: Row ${id}`,
    `    kind: ${kind}`,
    '    phase_target: P3',
  ];
  if (claimed) lines.push(`    claimed_status: ${claimed}`);
  lines.push('    refs:');
  const kinds = Object.keys(refs ?? {});
  if (kinds.length === 0) {
    // schema requires refs to be a mapping; docs: [] keeps it valid + empty.
    lines.push('      docs: []');
  }
  for (const k of kinds) {
    const v = refs[k];
    lines.push(`      ${k}: [${(Array.isArray(v) ? v : [v]).join(', ')}]`);
  }
  return lines.join('\n');
}

function writeManifest(root, entries) {
  const yaml = 'entries:\n' + entries.map(entryYaml).join('\n') + '\n';
  writeFileSync(join(root, 'docs', 'feature-ledger.manifest.yaml'), yaml, 'utf8');
}

async function run(root, opts = {}) {
  return runLedger({ repoRoot: root, ...opts });
}

function rowById(result, id) {
  const row = result.rows.find((r) => r.id === id);
  assert.ok(row, `row ${id} present`);
  return row;
}

// ---------------------------------------------------------------------------
// Pure-helper units
// ---------------------------------------------------------------------------

test('statusRank ranks the full ladder in order; unknown = -1', () => {
  const ranks = STATUS_LADDER.map(statusRank);
  assert.deepEqual(ranks, [0, 1, 2, 3, 4, 5]);
  assert.equal(statusRank('code+tests-present (unrun)'), statusRank('code+tests-present'));
  assert.equal(statusRank('SHIPPED'), -1);
});

test('baseStatus strips the (unrun) annotation only', () => {
  assert.equal(baseStatus('code+tests-present (unrun)'), 'code+tests-present');
  assert.equal(baseStatus('verified'), 'verified');
});

test('computeStatus: every rung of the ladder', () => {
  const E = (o) => ({ docs: false, srs: false, code: false, tests: false, review: false, ...o });
  const noRun = { runTests: false, testPassed: false, primaryDocStatus: null };
  // doc-only: docs resolve but frontmatter not accepted/stable
  assert.equal(computeStatus(E({ docs: true }), { ...noRun, primaryDocStatus: 'draft' }), 'doc-only');
  // designed: docs resolve + accepted/stable frontmatter
  assert.equal(computeStatus(E({ docs: true }), { ...noRun, primaryDocStatus: 'accepted' }), 'designed');
  assert.equal(computeStatus(E({ docs: true }), { ...noRun, primaryDocStatus: 'stable' }), 'designed');
  // in-code
  assert.equal(computeStatus(E({ code: true }), noRun), 'in-code');
  // code+needs-test-or-review (either one missing)
  assert.equal(computeStatus(E({ code: true, tests: true }), noRun), 'code+needs-test-or-review');
  assert.equal(computeStatus(E({ code: true, review: true }), noRun), 'code+needs-test-or-review');
  // unrun downgrade — verified is NOT reachable without --run-tests
  assert.equal(
    computeStatus(E({ code: true, tests: true, review: true }), noRun),
    'code+tests-present (unrun)'
  );
  // verified only with runTests + green
  assert.equal(
    computeStatus(E({ code: true, tests: true, review: true }), {
      runTests: true, testPassed: true, primaryDocStatus: null,
    }),
    'verified'
  );
  // runTests but red -> falls back to needs-test-or-review
  assert.equal(
    computeStatus(E({ code: true, tests: true, review: true }), {
      runTests: true, testPassed: false, primaryDocStatus: null,
    }),
    'code+needs-test-or-review'
  );
});

test('classifyDrift: both directions + unclaimed + unknown-claim', () => {
  assert.equal(classifyDrift('verified', 'in-code'), 'status-inflation');
  assert.equal(classifyDrift('doc-only', 'in-code'), 'status-understated');
  assert.equal(classifyDrift('in-code', 'in-code'), 'aligned');
  assert.equal(classifyDrift(undefined, 'in-code'), 'unclaimed');
  // unknown free-text claim surfaces as inflation, never silently passes
  assert.equal(classifyDrift('SHIPPED', 'verified'), 'status-inflation');
  // the (unrun) downgrade shares its base rank: claiming the base is aligned
  assert.equal(classifyDrift('code+tests-present', 'code+tests-present (unrun)'), 'aligned');
});

test('evidenceGaps names exactly what is missing to advance', () => {
  const E = (o) => ({ docs: false, srs: false, code: false, tests: false, review: false, ...o });
  assert.deepEqual(
    evidenceGaps(E({ docs: true }), 'doc-only'),
    ['primary doc status not accepted/stable', 'no code mapped']
  );
  assert.deepEqual(evidenceGaps(E({ docs: true }), 'designed'), ['no code mapped']);
  assert.deepEqual(evidenceGaps(E({ code: true }), 'in-code'), ['no tests mapped', 'review record missing']);
  assert.deepEqual(
    evidenceGaps(E({ code: true, tests: true }), 'code+needs-test-or-review'),
    ['review record missing']
  );
  assert.deepEqual(
    evidenceGaps(E({ code: true, tests: true, review: true }), 'code+tests-present (unrun)'),
    ['tests not run (--run-tests)']
  );
  assert.deepEqual(evidenceGaps(E({ code: true, tests: true, review: true }), 'verified'), []);
});

test('phaseTargetSource: only "doc" is sourced; heuristic AND missing default to derived', () => {
  // G3.5 review finding 3: absence of phase_source must default to derived,
  // never silently to clean/sourced — a disclosure that only lives in the
  // manifest header does not count.
  assert.equal(phaseTargetSource('doc'), 'sourced');
  assert.equal(phaseTargetSource('heuristic'), 'derived');
  assert.equal(phaseTargetSource(undefined), 'derived');
  assert.equal(phaseTargetSource(null), 'derived');
  assert.equal(DERIVED_PHASE_MARKER, '*(derived)*');
});

test('phaseTargetSource: a "doc" claim with no backing document is NOT sourced', () => {
  // G3.5-T6: defaulting the ABSENT value to derived is bypassed by an
  // explicit wrong value. A sourced claim must prove itself with a docs ref
  // that resolves on disk and could carry the phase statement.
  assert.equal(phaseTargetSource('doc', true), 'sourced');
  assert.equal(phaseTargetSource('doc', false), 'derived');
  assert.equal(phaseTargetSource('heuristic', true), 'derived');
  assert.equal(phaseTargetSource('derived', true), 'derived');
});

// ---------------------------------------------------------------------------
// runLedger() on fixture repos
// ---------------------------------------------------------------------------

test('fixture: every status value computes from disk evidence (no --run-tests)', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'F-DOCONLY', refs: { docs: ['docs/draft-doc.md'] } },
      { id: 'F-DESIGNED', refs: { docs: ['docs/accepted-doc.md'] } },
      { id: 'F-NOFM', refs: { docs: ['docs/no-fm-doc.md'] } },
      { id: 'F-INCODE', refs: { code: ['src/thing.js'] } },
      { id: 'F-NEEDS', refs: { code: ['src/thing.js'], tests: ['tests/thing.test.mjs'] } },
      {
        id: 'F-UNRUN',
        refs: {
          code: ['src/thing.js'],
          tests: ['tests/thing.test.mjs'],
          review: ['docs/review-record.md'],
        },
      },
    ]);
    const result = await run(root);
    assert.equal(rowById(result, 'F-DOCONLY').computed, 'doc-only');
    assert.equal(rowById(result, 'F-DESIGNED').computed, 'designed');
    assert.equal(rowById(result, 'F-NOFM').computed, 'doc-only'); // no frontmatter -> not designed
    assert.equal(rowById(result, 'F-INCODE').computed, 'in-code');
    assert.equal(rowById(result, 'F-NEEDS').computed, 'code+needs-test-or-review');
    // no-false-verified: full evidence WITHOUT --run-tests stays honest
    assert.equal(rowById(result, 'F-UNRUN').computed, 'code+tests-present (unrun)');
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: verified requires --run-tests AND green tests AND a review ref', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      {
        id: 'F-VERIFIED',
        refs: {
          code: ['src/thing.js'],
          tests: ['tests/thing.test.mjs'],
          review: ['docs/review-record.md'],
        },
      },
    ]);
    const result = await run(root, { runTests: true });
    assert.equal(rowById(result, 'F-VERIFIED').computed, 'verified');
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: status-inflation is a blocking violation (exit 1)', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'F-INFLATE', claimed: 'verified', refs: { code: ['src/thing.js'] } },
    ]);
    const result = await run(root);
    assert.equal(rowById(result, 'F-INFLATE').drift, 'status-inflation');
    const v = result.violations.filter((x) => x.type === 'status-inflation');
    assert.equal(v.length, 1);
    assert.equal(v[0].blocking, true);
    assert.equal(result.exitCode, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: status-understated is informational only (exit 0)', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'F-UNDER', claimed: 'doc-only', refs: { code: ['src/thing.js'] } },
    ]);
    const result = await run(root);
    assert.equal(rowById(result, 'F-UNDER').drift, 'status-understated');
    const v = result.violations.filter((x) => x.type === 'status-understated');
    assert.equal(v.length, 1);
    assert.equal(v[0].blocking, false);
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: a dangling ref is a blocking violation (exit 1)', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'F-DANGLE', refs: { code: ['src/thing.js', 'src/ghost.js'] } },
    ]);
    const result = await run(root);
    const v = result.violations.filter((x) => x.type === 'dangling-ref');
    assert.equal(v.length, 1);
    assert.match(v[0].detail, /src\/ghost\.js/);
    assert.equal(v[0].blocking, true);
    assert.equal(result.exitCode, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: DOC-GRAPH.json merge preserves pre-existing keys; artifacts carry GENERATED markers', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [{ id: 'F-ONE', refs: { code: ['src/thing.js'] } }]);
    const result = await run(root);
    assert.equal(result.exitCode, 0);

    const graph = JSON.parse(readFileSync(join(root, 'docs', 'DOC-GRAPH.json'), 'utf8'));
    // pre-existing keys untouched
    assert.equal(graph.generatedAt, 'fixture');
    assert.deepEqual(graph.nodes, [{ id: 'n1' }]);
    assert.deepEqual(graph.edges, []);
    assert.deepEqual(graph.violations, []);
    // ledger block present with rows + violations
    assert.equal(graph.ledger.rowCount, 1);
    assert.ok(Array.isArray(graph.ledger.rows));
    assert.ok(Array.isArray(graph.ledger.violations));
    assert.ok(graph.ledger._generated.includes('GENERATED'));

    const md = readFileSync(join(root, 'docs', 'FEATURE-LEDGER.md'), 'utf8');
    assert.ok(md.includes(GENERATED_MARKER));
    assert.ok(md.includes('| ID | Title | Phase | Computed | Claimed | Drift | Evidence gaps | Source |'));
    assert.ok(
      !md.includes('| ID | Title | Kind |'),
      'the flat Kind column is gone (kind is the group now)'
    );
    assert.ok(md.includes('F-ONE'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: a HOLLOW test file (zero test() calls, exit 0) must NOT reach verified', async () => {
  // G3-R-adv finding 1: `node --test` on a file with no tests exits 0.
  const root = makeFixtureRepo();
  try {
    writeFileSync(join(root, 'tests', 'hollow.test.mjs'), '// no tests here\n', 'utf8');
    writeManifest(root, [
      {
        id: 'F-HOLLOW',
        refs: {
          code: ['src/thing.js'],
          tests: ['tests/hollow.test.mjs'],
          review: ['docs/review-record.md'],
        },
      },
    ]);
    const result = await run(root, { runTests: true });
    const row = rowById(result, 'F-HOLLOW');
    assert.notEqual(row.computed, 'verified');
    assert.equal(row.computed, 'code+needs-test-or-review');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: a SCALAR review ref counts like a 1-element array for verified', async () => {
  // G3-R-adv finding 2: schema permits review: <string|array>; the scalar form
  // must not silently cap a genuinely green row below verified.
  const root = makeFixtureRepo();
  try {
    const yaml = [
      'entries:',
      '  - id: F-SCALAR-REVIEW',
      '    title: Scalar review row',
      '    kind: feature',
      '    phase_target: P3',
      '    refs:',
      '      code: [src/thing.js]',
      '      tests: [tests/thing.test.mjs]',
      '      review: docs/review-record.md',
      '',
    ].join('\n');
    writeFileSync(join(root, 'docs', 'feature-ledger.manifest.yaml'), yaml, 'utf8');
    const result = await run(root, { runTests: true });
    assert.equal(rowById(result, 'F-SCALAR-REVIEW').computed, 'verified');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: a cargo: test ref counts as tests evidence (existence level)', async () => {
  // G3-T4 defines `cargo:<name>` command refs; a mapped cargo test means the
  // row's tests refs are NOT "missing/empty" (pinned in-code rule), even
  // though there is no file to existsSync. It still cannot reach verified
  // without --run-tests actually running it.
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'F-CARGO', refs: { code: ['src/thing.js'], tests: ['cargo:thing::tests::'] } },
      {
        id: 'F-CARGO-FULL',
        refs: {
          code: ['src/thing.js'],
          tests: ['cargo:thing::tests::'],
          review: ['docs/review-record.md'],
        },
      },
    ]);
    const result = await run(root);
    assert.equal(rowById(result, 'F-CARGO').computed, 'code+needs-test-or-review');
    // full evidence but unrun -> the honest downgrade, never verified
    assert.equal(rowById(result, 'F-CARGO-FULL').computed, 'code+tests-present (unrun)');
    assert.equal(result.exitCode, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: duplicate manifest ids are rejected', async () => {
  // G3-R-adv finding 3.
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'F-DUP', refs: { code: ['src/thing.js'] } },
      { id: 'F-DUP', refs: { docs: ['docs/draft-doc.md'] } },
    ]);
    await assert.rejects(() => run(root), /duplicate id "F-DUP"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// --- Grouping (G3.5 finding 1) ---------------------------------------------
// The DoD wants three explicitly-headed groups in a fixed order, ALWAYS
// printed. Helper: assert the headings exist, are ordered, and report where.

function groupOffsets(md) {
  const offsets = {
    feature: md.indexOf('## Features'),
    fr: md.indexOf('## Functional Requirements'),
    nfr: md.indexOf('## Non-Functional Requirements'),
  };
  assert.ok(offsets.feature > -1, '## Features heading present');
  assert.ok(offsets.fr > offsets.feature, '## Functional Requirements follows Features');
  assert.ok(offsets.nfr > offsets.fr, '## Non-Functional Requirements follows FRs');
  return offsets;
}

/** The slice of the document belonging to one group heading. */
function groupBody(md, offsets, kind) {
  const order = ['feature', 'fr', 'nfr'];
  const start = offsets[kind];
  const next = order
    .map((k) => offsets[k])
    .filter((v) => v > start)
    .sort((a, b) => a - b)[0];
  return md.slice(start, next ?? md.length);
}

test('fixture: MD emits three ordered groups, all populated; heuristic phases render *(derived)*', async () => {
  // G3.5 review findings 1+3: DoD says grouped (features, FRs, NFRs) with
  // explicit headings, and a badge-heuristic phase_target must render marked,
  // never as fact.
  const root = makeFixtureRepo();
  try {
    const yaml = [
      'entries:',
      '  - id: F-FEAT',
      '    title: A feature',
      '    kind: feature',
      '    phase_target: P5',
      '    phase_source: heuristic',
      '    refs:',
      '      code: [src/thing.js]',
      '  - id: FR-ONE',
      '    title: An FR',
      '    kind: fr',
      '    phase_target: P3',
      '    phase_source: doc',
      '    refs:',
      // a doc claim only renders clean when a docs ref BACKS it (G3.5-T6)
      '      docs: [docs/draft-doc.md]',
      '      code: [src/thing.js]',
      '  - id: N-ONE',
      '    title: An NFR',
      '    kind: nfr',
      '    phase_target: P6',
      '    refs:',
      '      docs: [docs/draft-doc.md]',
      '',
    ].join('\n');
    writeFileSync(join(root, 'docs', 'feature-ledger.manifest.yaml'), yaml, 'utf8');
    const result = await run(root);
    assert.equal(result.exitCode, 0);
    const md = readFileSync(join(root, 'docs', 'FEATURE-LEDGER.md'), 'utf8');
    const offsets = groupOffsets(md);

    // each row lands under its OWN group, not merely somewhere in the doc
    assert.match(groupBody(md, offsets, 'feature'), /\| F-FEAT \|/);
    assert.match(groupBody(md, offsets, 'fr'), /\| FR-ONE \|/);
    assert.match(groupBody(md, offsets, 'nfr'), /\| N-ONE \|/);
    // no group is empty, so nothing claims "_none recorded_"
    assert.ok(!md.includes('_none recorded_'));

    // heuristic (phase_source: heuristic) -> marked inline, never a bare fact
    assert.match(md, /\| F-FEAT \|.*\| P5 \*\(derived\)\* \|/);
    // doc-sourced -> renders clean, no marker
    assert.match(md, /\| FR-ONE \|.*\| P3 \|/);
    // The FR group has no derived ROWS, so no Phase cell carries the marker —
    // but per the DoD ("a legend under each group") the legend still prints,
    // so assert on the table body rather than on the whole group.
    const frTable = groupBody(md, offsets, 'fr')
      .split('\n')
      .filter((l) => l.startsWith('|'))
      .join('\n');
    assert.ok(
      !frTable.includes(DERIVED_PHASE_MARKER),
      'the FR group has no derived rows, so no FR Phase cell is marked'
    );

    // N-ONE has NO phase_source at all — absence must default to derived,
    // never silently to clean/sourced (the honesty fix for finding 3).
    assert.match(md, /\| N-ONE \|.*\| P6 \*\(derived\)\* \|/);

    // a legend explaining the marker prints under EVERY group that has a
    // derived row (features and NFRs here), not once at the top of the doc.
    const featureBody = groupBody(md, offsets, 'feature');
    const nfrBody = groupBody(md, offsets, 'nfr');
    assert.match(featureBody, /legend|derived.*bootstrap badge-heuristic/i);
    assert.match(nfrBody, /legend|derived.*bootstrap badge-heuristic/i);
    // ...and under the FR group too — the legend is unconditional (G3.5-T7).
    assert.match(groupBody(md, offsets, 'fr'), /legend|derived.*bootstrap badge-heuristic/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: a group with only sourced phases marks no cell, but still prints the legend', async () => {
  // Sourced values render clean — no Phase cell is marked. The legend itself
  // is unconditional (G3.5-T7: the DoD says "under each group"), so it prints
  // under this group too even though nothing here is derived.
  const root = makeFixtureRepo();
  try {
    const yaml = [
      'entries:',
      '  - id: F-SOURCED',
      '    title: A sourced feature',
      '    kind: feature',
      '    phase_target: P2',
      '    phase_source: doc',
      '    refs:',
      '      docs: [docs/draft-doc.md]',
      '      code: [src/thing.js]',
      '',
    ].join('\n');
    writeFileSync(join(root, 'docs', 'feature-ledger.manifest.yaml'), yaml, 'utf8');
    const result = await run(root);
    assert.equal(result.exitCode, 0);
    const md = readFileSync(join(root, 'docs', 'FEATURE-LEDGER.md'), 'utf8');

    assert.match(md, /\| F-SOURCED \|.*\| P2 \|/); // clean, no marker
    // No TABLE ROW carries the marker...
    const tableRows = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| ---'));
    assert.ok(
      !tableRows.some((l) => l.includes(DERIVED_PHASE_MARKER)),
      'no derived rows anywhere -> no marked Phase cell anywhere'
    );
    // ...but the legend still prints under each of the three groups.
    const legendCount = md.split(`_${DERIVED_PHASE_LEGEND}_`).length - 1;
    assert.equal(legendCount, 3, 'the legend prints under every group, unconditionally');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: phase_source: doc with NO resolvable docs ref renders derived + a non-blocking violation', async () => {
  // The G3.5-T6 hole: an explicit `doc` label bypassed the derived default,
  // so a row with an empty refs.docs rendered a clean, unmarked Phase cell as
  // though a source document had stated it. The claim must now prove itself.
  const root = makeFixtureRepo();
  try {
    const yaml = [
      'entries:',
      '  - id: N-UNBACKED',
      '    title: An NFR claiming a sourced phase it cannot back',
      '    kind: nfr',
      '    phase_target: P6',
      '    phase_source: doc',
      '    refs:',
      '      docs: []',
      '      srs: ["§4.1"]',
      '',
    ].join('\n');
    writeFileSync(join(root, 'docs', 'feature-ledger.manifest.yaml'), yaml, 'utf8');
    const result = await run(root);

    // the downgrade is a manifest-quality signal, not a pipeline failure
    assert.equal(result.exitCode, 0, 'unbacked phase claims do NOT block generation');
    const row = result.rows.find((r) => r.id === 'N-UNBACKED');
    assert.equal(row.phase_source, 'doc', 'the raw manifest label is preserved verbatim');
    assert.equal(row.phase_target_source, 'derived', 'but the computed provenance is derived');

    const v = result.violations.find((x) => x.type === 'unbacked-phase-source');
    assert.ok(v, 'the downgrade is recorded, never a silent rewrite');
    assert.equal(v.id, 'N-UNBACKED');
    assert.equal(v.blocking, false);

    // and the reader of the DOCUMENT sees it — an srs section label is not a
    // resolvable document and cannot back the claim.
    const md = readFileSync(join(root, 'docs', 'FEATURE-LEDGER.md'), 'utf8');
    assert.match(md, /\| N-UNBACKED \|.*\| P6 \*\(derived\)\* \|/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: phase_source: doc backed by a REAL-BUT-PHASELESS doc still renders derived (content check)', async () => {
  // G35-R-adv finding 1: existence-level backing was gameable — a row citing
  // a document that exists but never states any phase (the SRS) rendered a
  // clean, sourced Phase cell. Backing is now content-level: the cited doc
  // must actually contain a `**Phase:**` statement.
  const root = makeFixtureRepo();
  try {
    writeFileSync(
      join(root, 'docs', 'phased-doc.md'),
      '> **Module:** X · **Phase:** 3\n\n# X\n',
      'utf8'
    );
    const yaml = [
      'entries:',
      '  - id: F-PHASELESS',
      '    title: Cites a real doc that states no phase',
      '    kind: fr',
      '    phase_target: P2',
      '    phase_source: doc',
      '    refs:',
      '      docs: [docs/no-fm-doc.md]',
      '  - id: F-PHASED',
      '    title: Cites a doc that really states a phase',
      '    kind: feature',
      '    phase_target: P3',
      '    phase_source: doc',
      '    refs:',
      '      docs: [docs/phased-doc.md]',
      '',
    ].join('\n');
    writeFileSync(join(root, 'docs', 'feature-ledger.manifest.yaml'), yaml, 'utf8');
    const result = await run(root);
    assert.equal(result.exitCode, 0);

    const phaseless = result.rows.find((r) => r.id === 'F-PHASELESS');
    assert.equal(phaseless.phase_target_source, 'derived');
    const v = result.violations.find(
      (x) => x.type === 'unbacked-phase-source' && x.id === 'F-PHASELESS'
    );
    assert.ok(v, 'real-but-phaseless doc backing is recorded as unbacked');

    const phased = result.rows.find((r) => r.id === 'F-PHASED');
    assert.equal(phased.phase_target_source, 'sourced');
    const md = readFileSync(join(root, 'docs', 'FEATURE-LEDGER.md'), 'utf8');
    assert.match(md, /\| F-PHASELESS \|.*\| P2 \*\(derived\)\* \|/);
    assert.match(md, /\| F-PHASED \|.*\| P3 \|/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: an EMPTY fr group still prints its heading + "_none recorded_"', async () => {
  // The exact regression G3 shipped: zero FR rows rendered as a missing
  // section, which read as a deliberate design choice instead of a gap.
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'F-FEAT', kind: 'feature', refs: { code: ['src/thing.js'] } },
      { id: 'N-ONE', kind: 'nfr', refs: { docs: ['docs/draft-doc.md'] } },
    ]);
    const result = await run(root);
    assert.equal(result.exitCode, 0);
    const md = readFileSync(join(root, 'docs', 'FEATURE-LEDGER.md'), 'utf8');
    const offsets = groupOffsets(md); // heading present despite zero rows

    const fr = groupBody(md, offsets, 'fr');
    assert.match(fr, /_none recorded_/, 'empty FR group says so out loud');
    assert.ok(!fr.includes('| ID | Title |'), 'empty group renders no table');
    // the populated groups are unaffected
    assert.match(groupBody(md, offsets, 'feature'), /\| F-FEAT \|/);
    assert.match(groupBody(md, offsets, 'nfr'), /\| N-ONE \|/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: an EMPTY nfr group still prints its heading + "_none recorded_"', async () => {
  const root = makeFixtureRepo();
  try {
    writeManifest(root, [
      { id: 'F-FEAT', kind: 'feature', refs: { code: ['src/thing.js'] } },
      { id: 'FR-ONE', kind: 'fr', refs: { code: ['src/thing.js'] } },
    ]);
    const result = await run(root);
    assert.equal(result.exitCode, 0);
    const md = readFileSync(join(root, 'docs', 'FEATURE-LEDGER.md'), 'utf8');
    const offsets = groupOffsets(md);

    const nfr = groupBody(md, offsets, 'nfr');
    assert.match(nfr, /_none recorded_/, 'empty NFR group says so out loud');
    assert.ok(!nfr.includes('| ID | Title |'), 'empty group renders no table');
    assert.match(groupBody(md, offsets, 'feature'), /\| F-FEAT \|/);
    assert.match(groupBody(md, offsets, 'fr'), /\| FR-ONE \|/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: an invalid phase_source value is rejected', async () => {
  const root = makeFixtureRepo();
  try {
    const yaml = [
      'entries:',
      '  - id: F-BAD',
      '    title: Bad phase source',
      '    kind: feature',
      '    phase_target: P5',
      '    phase_source: guessed',
      '    refs:',
      '      code: [src/thing.js]',
      '',
    ].join('\n');
    writeFileSync(join(root, 'docs', 'feature-ledger.manifest.yaml'), yaml, 'utf8');
    await assert.rejects(() => run(root), /invalid phase_source "guessed"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('countPasses parses the REAL runner kinds (cargo-test / node-test)', () => {
  // Regression: countPasses once matched kind 'cargo' while the mapper emits
  // 'cargo-test' — every cargo row counted 0 passes and --run-tests demoted
  // all 15 evidence-complete rows on the real tree.
  assert.equal(countPasses('cargo-test', 'test result: ok. 3 passed; 0 failed'), 3);
  assert.equal(
    countPasses('cargo-test', 'test result: ok. 0 passed\ntest result: ok. 7 passed'),
    7
  );
  assert.equal(countPasses('node-test', '✔ my case (1.23ms)\nℹ pass 1'), 1);
  assert.equal(countPasses('node-test', 'ok 1 - my case\n# pass 1'), 1);
  // implicit file-level point only -> hollow
  assert.equal(countPasses('node-test', 'ok 1 - C:\\x\\hollow.test.mjs\n# pass 1'), 0);
});

test('fixture: unmappable test refs (vitest .ts) stay "(unrun)" under --run-tests', async () => {
  // Evidence exists but no ref maps to a runnable command — that is not
  // "a test failed", so the row must not demote to code+needs-test-or-review.
  const root = makeFixtureRepo();
  try {
    writeFileSync(join(root, 'tests', 'thing.test.ts'), 'export {};\n', 'utf8');
    writeManifest(root, [
      {
        id: 'F-VITEST',
        refs: {
          code: ['src/thing.js'],
          tests: ['tests/thing.test.ts'],
          review: ['docs/review-record.md'],
        },
      },
    ]);
    const result = await run(root, { runTests: true });
    assert.equal(rowById(result, 'F-VITEST').computed, 'code+tests-present (unrun)');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixture: missing manifest throws (CLI maps this to fatal exit 2)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'g3-ledger-'));
  try {
    await assert.rejects(() => run(root), /manifest not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
