import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { scanEncoding } from './encoding-check.mjs';

test('accepts valid UTF-8 Thai documentation', () => {
  const root = mkdtempSync(join(tmpdir(), 'gmaiden-encoding-'));
  try {
    writeFileSync(join(root, 'good.md'), '# ภาษาไทย\nข้อความปกติ — UTF-8\n', 'utf8');
    assert.deepEqual(scanEncoding([root]), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reports common UTF-8 decoded-as-Windows-1252 markers', () => {
  const root = mkdtempSync(join(tmpdir(), 'gmaiden-encoding-'));
  try {
    writeFileSync(join(root, 'bad.md'), '# \u00e0\u00b8\u201a\u00e0\u00b8\u2014\u00e0\u00b8\u201d\u00e0\u00b8\u00aa\u00e0\u00b8\u00ad\u00e0\u00b8\u0161\n', 'utf8');
    const findings = scanEncoding([root]);
    assert.ok(findings.length > 0);
    assert.equal(findings[0].line, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
