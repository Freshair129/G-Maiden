// tools/doc-graph/scan-ledger-preserve.test.mjs
//
// Regression test for the scan<->ledger clobber found 2026-07-20: ledger.mjs
// MERGES a {ledger} block into docs/DOC-GRAPH.json additively, but scan.mjs's
// wholesale rewrite used to drop it (699 lines lost on a rescan). Scan must
// carry a foreign top-level `ledger` key over into its fresh output.
//
// Drives the real scan.mjs CLI as a child process against a throwaway docs
// tree with --out-json/--out-report/--out-index overrides, so no repo
// artifact is touched.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCAN = join(HERE, 'scan.mjs');

function runScanCli(root) {
  // scan exit 1 (violations) is fine for this test; only crashes are not.
  try {
    execFileSync(process.execPath, [
      SCAN,
      '--repo-root', root,
      '--docs-dir', join(root, 'docs'),
      '--out-json', join(root, 'docs', 'DOC-GRAPH.json'),
      '--out-report', join(root, 'docs', 'DOC-GRAPH-REPORT.md'),
      '--out-index', join(root, 'docs', 'atomic_index.jsonl'),
    ], { encoding: 'utf8' });
  } catch (err) {
    if (err.status === undefined || err.status > 1) throw err;
  }
}

test('scan.mjs preserves a foreign ledger block across a rescan', () => {
  const root = mkdtempSync(join(tmpdir(), 'g3-scan-preserve-'));
  try {
    mkdirSync(join(root, 'docs'), { recursive: true });
    writeFileSync(join(root, 'docs', 'a-doc.md'), '# A Doc\n\nBody.\n', 'utf8');

    // First scan: creates DOC-GRAPH.json with scan-owned keys only.
    runScanCli(root);
    const first = JSON.parse(readFileSync(join(root, 'docs', 'DOC-GRAPH.json'), 'utf8'));
    assert.equal(first.ledger, undefined);

    // Simulate ledger.mjs's additive merge.
    first.ledger = { _generated: 'GENERATED', rowCount: 2, rows: [{ id: 'x' }], violations: [] };
    writeFileSync(
      join(root, 'docs', 'DOC-GRAPH.json'),
      JSON.stringify(first, null, 2) + '\n',
      'utf8'
    );

    // Rescan: scan-owned keys refresh, the ledger block must survive.
    runScanCli(root);
    const second = JSON.parse(readFileSync(join(root, 'docs', 'DOC-GRAPH.json'), 'utf8'));
    assert.ok(Array.isArray(second.nodes));
    assert.deepEqual(second.ledger, first.ledger);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
