#!/usr/bin/env node
/**
 * scan.test.mjs — tests for scan.mjs, the T1-T4 doc-graph CLI composer.
 *
 * Builds two self-contained fixture repos under the OS temp dir (never touches
 * the real G-Maiden docs/ tree):
 *   - "dirty": seeds one violation of every reason the T1-T4 validators can
 *     produce, asserts the CLI exits 1 and the report/JSON reflect it.
 *   - "clean": no violations at all, asserts the CLI exits 0.
 *
 * Run with: node --test tools/doc-graph/scan.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { computeGeneratedAt, runScan, INFORMATIONAL_REASONS, STRICT_INFORMATIONAL_REASONS } from './scan.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCAN_CLI = join(__dirname, 'scan.mjs');

function write(root, relPath, content) {
  const full = join(root, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
  return full;
}

function makeDirtyFixture() {
  const root = mkdtempSync(join(tmpdir(), 'doc-graph-dirty-'));

  write(
    root,
    'docs/README.md',
    `---
title: "Docs Home"
version: "0.1.0"
---

# Docs Home

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-19 | initial |
`
  );

  // unresolved (blocking) + glob-slug (informational). [[docs/README]] is
  // deliberately cited twice below — a valid, resolved slug repeated across
  // two lines — to prove this is NOT flagged (false-positive regression,
  // G15-T1): repeated citation of a real doc is normal prose, not collision.
  write(
    root,
    'docs/links.md',
    `---
title: "Links"
version: "0.1.0"
---

# Links

Unresolved: [[does-not-exist]]
Resolved A: [[docs/README]]
Resolved B (again): [[docs/README]]
Wildcard: [[glob-*]]

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-19 | initial |
`
  );

  // missing-file + bad-anchor (blocking)
  write(
    root,
    'docs/symbols.md',
    `---
title: "Symbols"
version: "0.1.0"
---

# Symbols

Missing: [missing](file:///g:/G-Maiden/does-not-exist.txt)
Bad anchor: [anchor](file:///g:/G-Maiden/anchor-target.txt#L999)

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-19 | initial |
`
  );
  write(root, 'anchor-target.txt', 'line one\nline two\nline three\n');

  // missing-changelog (blocking)
  write(
    root,
    'docs/metadata-bad.md',
    `---
title: "Bad Metadata"
version: "1.0.0"
---

# Bad Metadata

No changelog table here at all.
`
  );

  // version-changelog-mismatch (blocking)
  write(
    root,
    'docs/metadata-mismatch.md',
    `---
title: "Mismatch"
version: "0.2.0"
---

# Mismatch

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-19 | first |
| 0.3.0 | 2026-07-19 | newer than frontmatter |
`
  );

  // duplicate-slug (blocking, x2) + no-metadata (informational, x2)
  write(root, 'docs/dup/a/foo.md', `# Foo A\n\nNo frontmatter, no legacy header.\n`);
  write(root, 'docs/dup/b/foo.md', `# Foo B\n\nNo frontmatter, no legacy header either.\n`);

  return root;
}

function makeCleanFixture() {
  const root = mkdtempSync(join(tmpdir(), 'doc-graph-clean-'));

  write(
    root,
    'docs/README.md',
    `---
title: "Docs Home"
version: "0.1.0"
---

# Docs Home

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-19 | initial |
`
  );

  write(
    root,
    'docs/other.md',
    `---
title: "Other"
version: "0.1.0"
---

# Other

See [[docs/README]] for details.
And a [source link](file:///g:/G-Maiden/real-target.txt).

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-19 | initial |
`
  );
  write(root, 'real-target.txt', 'hello\n');

  return root;
}

// G2-T2: fixtures for the pinned v0.4.0 frontmatter rulebook, only enforced
// under --strict. Every file here passes T1-T3 (no wikilinks/symbol links)
// and T4's version<->changelog check, so under non-strict the fixture is
// entirely clean -- any new-reason violation appearing without --strict would
// mean the flag leaked, which the isolation test below asserts against.
function changelogFor(version) {
  return `\n## Changelog\n| Version | Date | Summary |\n| --- | --- | --- |\n| ${version} | 2026-07-19 | initial |\n`;
}

function makeStrictFrontmatterFixture() {
  const root = mkdtempSync(join(tmpdir(), 'doc-graph-strict-'));

  // Fully compliant -- must never produce any violation, strict or not.
  write(
    root,
    'docs/strict-clean.md',
    `---\ntitle: "Strict Clean"\ndoc_id: "strict-clean"\nstatus: "draft"\nversion: "0.1.0"\nupdated: "2026-07-19"\nowner: "Boss"\n---\n\n# Strict Clean\n${changelogFor('0.1.0')}`
  );

  // missing-required-field x2 ('updated', 'owner' both absent)
  write(
    root,
    'docs/strict-missing-field.md',
    `---\ntitle: "Strict Missing Field"\ndoc_id: "strict-missing-field"\nstatus: "draft"\nversion: "0.1.0"\n---\n\n# Strict Missing Field\n${changelogFor('0.1.0')}`
  );

  // invalid-status
  write(
    root,
    'docs/strict-invalid-status.md',
    `---\ntitle: "Strict Invalid Status"\ndoc_id: "strict-invalid-status"\nstatus: "banana"\nversion: "0.1.0"\nupdated: "2026-07-19"\nowner: "Boss"\n---\n\n# Strict Invalid Status\n${changelogFor('0.1.0')}`
  );

  // missing-approval (status accepted, no approved_by/approved_date)
  write(
    root,
    'docs/strict-missing-approval.md',
    `---\ntitle: "Strict Missing Approval"\ndoc_id: "strict-missing-approval"\nstatus: "accepted"\nversion: "0.1.0"\nupdated: "2026-07-19"\nowner: "Boss"\n---\n\n# Strict Missing Approval\n${changelogFor('0.1.0')}`
  );

  // doc-id-slug-mismatch
  write(
    root,
    'docs/strict-docid-mismatch.md',
    `---\ntitle: "Strict Docid Mismatch"\ndoc_id: "totally-wrong-slug"\nstatus: "draft"\nversion: "0.1.0"\nupdated: "2026-07-19"\nowner: "Boss"\n---\n\n# Strict Docid Mismatch\n${changelogFor('0.1.0')}`
  );

  // legacy-status-case (warning only -- approved_by/date present so it does
  // NOT also trip missing-approval; isolates the warning from any error).
  write(
    root,
    'docs/strict-legacy-case.md',
    `---\ntitle: "Strict Legacy Case"\ndoc_id: "strict-legacy-case"\nstatus: "Accepted"\nversion: "0.1.0"\nupdated: "2026-07-19"\nowner: "Boss"\napproved_by: "Boss"\napproved_date: "2026-07-19"\n---\n\n# Strict Legacy Case\n${changelogFor('0.1.0')}`
  );

  return root;
}

// Only the always-clean doc + the warning-only doc -- proves a lone
// 'legacy-status-case' never gates the exit code even under --strict.
function makeStrictWarnOnlyFixture() {
  const root = mkdtempSync(join(tmpdir(), 'doc-graph-strict-warn-'));

  write(
    root,
    'docs/strict-clean.md',
    `---\ntitle: "Strict Clean"\ndoc_id: "strict-clean"\nstatus: "draft"\nversion: "0.1.0"\nupdated: "2026-07-19"\nowner: "Boss"\n---\n\n# Strict Clean\n${changelogFor('0.1.0')}`
  );

  write(
    root,
    'docs/strict-legacy-case.md',
    `---\ntitle: "Strict Legacy Case"\ndoc_id: "strict-legacy-case"\nstatus: "Accepted"\nversion: "0.1.0"\nupdated: "2026-07-19"\nowner: "Boss"\napproved_by: "Boss"\napproved_date: "2026-07-19"\n---\n\n# Strict Legacy Case\n${changelogFor('0.1.0')}`
  );

  return root;
}

function runCli(root, extraArgs = []) {
  const result = spawnSync(
    process.execPath,
    [SCAN_CLI, '--repo-root', root, '--now', '2026-07-19T12:00:00.000Z', ...extraArgs],
    { encoding: 'utf8' }
  );
  return result;
}

// ---------------------------------------------------------------------------

test('dirty fixture: CLI exits 1 and seeds every violation reason', () => {
  const root = makeDirtyFixture();
  try {
    const result = runCli(root);
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\nstderr:\n${result.stderr}`);

    const graph = JSON.parse(readFileSync(join(root, 'docs/DOC-GRAPH.json'), 'utf8'));
    assert.equal(graph.generatedAt, '2026-07-19T12:00:00.000Z');
    assert.ok(Array.isArray(graph.nodes) && graph.nodes.length > 0, 'nodes present');
    assert.ok(Array.isArray(graph.edges), 'edges present');

    const reasons = new Set(graph.violations.map((v) => v.reason));
    const expectedReasons = [
      'duplicate-slug',
      'unresolved',
      'glob-slug',
      'missing-file',
      'bad-anchor',
      'missing-changelog',
      'version-changelog-mismatch',
      'no-metadata',
    ];
    for (const reason of expectedReasons) {
      assert.ok(reasons.has(reason), `expected violation reason "${reason}" to be present`);
    }

    // 'collision' is a retired false-positive reason (G15-T1, 2026-07-19):
    // repeated valid wikilinks (docs/links.md cites [[docs/README]] twice)
    // must never surface it. True slug ambiguity is 'duplicate-slug' only.
    assert.ok(!reasons.has('collision'), 'collision must never be emitted (retired false-positive rule)');

    // duplicate-slug seeded for both colliding files
    const dupFiles = graph.violations
      .filter((v) => v.reason === 'duplicate-slug')
      .map((v) => v.file)
      .sort();
    assert.deepEqual(dupFiles, ['docs/dup/a/foo.md', 'docs/dup/b/foo.md']);

    // blocking-vs-informational split matches INFORMATIONAL_REASONS
    const blocking = graph.violations.filter((v) => !INFORMATIONAL_REASONS.has(v.reason));
    assert.ok(blocking.length > 0, 'at least one blocking violation');
    for (const v of graph.violations) {
      if (INFORMATIONAL_REASONS.has(v.reason)) {
        assert.ok(v.reason === 'no-metadata' || v.reason === 'glob-slug');
      }
    }

    // doc nodes exist for every scanned file, code node for the valid symbol target
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    assert.ok(nodeIds.has('docs/README.md'));
    assert.ok(nodeIds.has('docs/links.md'));
    assert.ok(nodeIds.has('docs/symbols.md'));

    // wikilink edges resolved to docs/README.md
    const wikiEdges = graph.edges.filter((e) => e.type === 'wikilink');
    assert.ok(wikiEdges.some((e) => e.from === 'docs/links.md' && e.to === 'docs/README.md'));

    const report = readFileSync(join(root, 'docs/DOC-GRAPH-REPORT.md'), 'utf8');
    assert.ok(report.includes('PASS (exit 0)') === false, 'report should not claim PASS');
    assert.ok(report.includes('FAIL (exit 1)'), 'report should state FAIL');
    for (const reason of expectedReasons) {
      assert.ok(report.includes(reason), `report should mention reason "${reason}"`);
    }
    // per-file section with a line-numbered entry
    assert.ok(report.includes('### docs/links.md'));
    assert.match(report, /\[L\d+\]/, 'report should include at least one line-numbered violation');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('clean fixture: CLI exits 0 with no violations', () => {
  const root = makeCleanFixture();
  try {
    const result = runCli(root);
    assert.equal(result.status, 0, `expected exit 0, got ${result.status}\nstderr:\n${result.stderr}`);

    const graph = JSON.parse(readFileSync(join(root, 'docs/DOC-GRAPH.json'), 'utf8'));
    assert.deepEqual(graph.violations, []);
    assert.ok(graph.nodes.length >= 2);
    assert.ok(graph.edges.some((e) => e.type === 'wikilink'));
    assert.ok(graph.edges.some((e) => e.type === 'symbol'));

    const report = readFileSync(join(root, 'docs/DOC-GRAPH-REPORT.md'), 'utf8');
    assert.ok(report.includes('PASS (exit 0)'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// G2-T2: --strict wiring of frontmatter-rules.mjs (pinned v0.4.0 rulebook).

const STRICT_NEW_REASONS = [
  'missing-required-field',
  'invalid-status',
  'legacy-status-case',
  'missing-approval',
  'doc-id-slug-mismatch',
];

test('strict frontmatter fixture WITHOUT --strict: flag is fully inert (isolation)', () => {
  const root = makeStrictFrontmatterFixture();
  try {
    const result = runCli(root); // no --strict
    assert.equal(result.status, 0, `expected exit 0 without --strict, got ${result.status}\nstderr:\n${result.stderr}`);

    const graph = JSON.parse(readFileSync(join(root, 'docs/DOC-GRAPH.json'), 'utf8'));
    assert.deepEqual(graph.violations, [], 'no violations at all without --strict (fixture is clean per T1-T4)');

    const report = readFileSync(join(root, 'docs/DOC-GRAPH-REPORT.md'), 'utf8');
    for (const reason of STRICT_NEW_REASONS) {
      assert.ok(!report.includes(reason), `report must not mention strict-only reason "${reason}" without --strict`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  // Same assertion via the pure runScan() API (no --strict key at all), on a
  // fresh un-scanned copy of the fixture (the CLI run above wrote
  // DOC-GRAPH.json/-REPORT.md into the first root's docs/, which would itself
  // surface as a new 'no-metadata' doc node if reused).
  const freshRoot = makeStrictFrontmatterFixture();
  try {
    const pure = runScan({ repoRoot: freshRoot, now: '2026-07-19T12:00:00.000Z' });
    assert.equal(pure.exitCode, 0);
    assert.deepEqual(pure.graph.violations, []);
  } finally {
    rmSync(freshRoot, { recursive: true, force: true });
  }
});

test('strict frontmatter fixture WITH --strict: new violations appear and gate the exit code', () => {
  const root = makeStrictFrontmatterFixture();
  try {
    const result = runCli(root, ['--strict']);
    assert.equal(result.status, 1, `expected exit 1 with --strict, got ${result.status}\nstderr:\n${result.stderr}`);

    const graph = JSON.parse(readFileSync(join(root, 'docs/DOC-GRAPH.json'), 'utf8'));
    const reasons = new Set(graph.violations.map((v) => v.reason));
    for (const reason of STRICT_NEW_REASONS) {
      assert.ok(reasons.has(reason), `expected strict violation reason "${reason}" to be present`);
    }

    // missing-required-field fired once per missing field (updated, owner)
    const missingFields = graph.violations
      .filter((v) => v.file === 'docs/strict-missing-field.md' && v.reason === 'missing-required-field')
      .map((v) => v.field)
      .sort();
    assert.deepEqual(missingFields, ['owner', 'updated']);

    // doc-id-slug-mismatch carries the offending id + expected slug
    const docIdViolation = graph.violations.find(
      (v) => v.file === 'docs/strict-docid-mismatch.md' && v.reason === 'doc-id-slug-mismatch'
    );
    assert.ok(docIdViolation, 'doc-id-slug-mismatch violation present');
    assert.equal(docIdViolation.docId, 'totally-wrong-slug');
    assert.equal(docIdViolation.expectedSlug, 'strict-docid-mismatch');

    // the always-clean fixture doc contributes zero violations even under --strict
    assert.ok(
      !graph.violations.some((v) => v.file === 'docs/strict-clean.md'),
      'fully-compliant doc must stay violation-free under --strict'
    );

    const blocking = graph.violations.filter((v) => !STRICT_INFORMATIONAL_REASONS.has(v.reason) && !INFORMATIONAL_REASONS.has(v.reason));
    assert.ok(blocking.length > 0, 'at least one blocking strict violation');
    assert.ok(
      !blocking.some((v) => v.reason === 'legacy-status-case'),
      'legacy-status-case must never be classified as blocking'
    );

    const report = readFileSync(join(root, 'docs/DOC-GRAPH-REPORT.md'), 'utf8');
    assert.ok(report.includes('FAIL (exit 1)'));
    for (const reason of STRICT_NEW_REASONS) {
      assert.ok(report.includes(reason), `report should mention strict reason "${reason}"`);
    }
    assert.match(report, /legacy-status-case[^\n]*\|\s*\d+\s*\|\s*no \(informational\)\s*\|/, 'legacy-status-case row marked non-blocking in the report table');

    // Same assertion via the pure runScan({ strict: true }) API.
    const pure = runScan({ repoRoot: root, now: '2026-07-19T12:00:00.000Z', strict: true });
    assert.equal(pure.exitCode, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('strict warning-only fixture: a lone legacy-status-case never gates the exit code', () => {
  const root = makeStrictWarnOnlyFixture();
  try {
    const result = runCli(root, ['--strict']);
    assert.equal(result.status, 0, `expected exit 0 (warning-only), got ${result.status}\nstderr:\n${result.stderr}`);

    const graph = JSON.parse(readFileSync(join(root, 'docs/DOC-GRAPH.json'), 'utf8'));
    const reasons = graph.violations.map((v) => v.reason);
    assert.deepEqual(reasons, ['legacy-status-case']);

    const report = readFileSync(join(root, 'docs/DOC-GRAPH-REPORT.md'), 'utf8');
    assert.ok(report.includes('PASS (exit 0)'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Unit coverage for the pure helpers, independent of the CLI subprocess.

test('runScan(): pure function matches CLI exit code for the dirty fixture', () => {
  const root = makeDirtyFixture();
  try {
    const { exitCode, graph } = runScan({ repoRoot: root, now: '2026-01-01T00:00:00.000Z' });
    assert.equal(exitCode, 1);
    assert.equal(graph.generatedAt, '2026-01-01T00:00:00.000Z');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('computeGeneratedAt(): uses --now verbatim (as ISO) when provided', () => {
  const iso = computeGeneratedAt({ now: '2026-07-19T00:00:00.000Z', files: [] });
  assert.equal(iso, '2026-07-19T00:00:00.000Z');
});

test('computeGeneratedAt(): falls back to max file mtime, not wall-clock, when --now is absent', () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-graph-mtime-'));
  try {
    const older = write(root, 'a.md', '# a\n');
    const newer = write(root, 'b.md', '# b\n');
    const oldTime = new Date('2020-01-01T00:00:00.000Z');
    const newTime = new Date('2024-06-15T00:00:00.000Z');
    utimesSync(older, oldTime, oldTime);
    utimesSync(newer, newTime, newTime);

    const iso = computeGeneratedAt({ files: [older, newer] });
    assert.equal(iso, newTime.toISOString());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

console.log('scan.test.mjs: all assertions passed');
