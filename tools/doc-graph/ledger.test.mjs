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
    '---\ntitle: Draft Doc\nstatus: draft\n---\n\n# Draft Doc\n',
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
    assert.ok(md.includes('| ID | Title | Kind | Phase | Computed | Claimed | Drift | Evidence gaps | Source |'));
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

test('fixture: MD groups rows into per-kind sections; heuristic phases render †', async () => {
  // G3.5 review findings 1+3: DoD says grouped (features, FRs, NFRs), and a
  // badge-heuristic phase_target must render marked, never as fact.
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
    const fi = md.indexOf('### Features');
    const ri = md.indexOf('### Functional requirements (FR)');
    const ni = md.indexOf('### Non-functional requirements (NFR)');
    assert.ok(fi > -1 && ri > fi && ni > ri, 'three kind sections in order');
    assert.match(md, /\| F-FEAT \|.*\| P5† \|/); // heuristic -> marked
    assert.match(md, /\| FR-ONE \|.*\| P3 \|/); // doc-sourced -> plain
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
