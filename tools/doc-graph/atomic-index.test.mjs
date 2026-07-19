#!/usr/bin/env node
/**
 * tools/doc-graph/atomic-index.test.mjs
 *
 * Tests for atomic-index.mjs.
 *
 * Verifies:
 *   - Every fixture file gets exactly one line in output
 *   - JSON is parseable
 *   - Slug matches expected values
 *   - Output is deterministic across two runs (byte-identical)
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildIndex } from './atomic-index.mjs';

/**
 * Create a temporary test fixture directory with sample markdown files.
 */
function setupFixture() {
  const tmpDir = join(tmpdir(), `atomic-index-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });

  const docsDir = join(tmpDir, 'docs');
  mkdirSync(docsDir, { recursive: true });

  // Create some test markdown files
  writeFileSync(join(docsDir, 'README.md'), `---
status: active
version: 1.0.0
---

# Docs Root

## Changelog

| Version | Date |
| --- | --- |
| 1.0.0 | 2026-07-19 |

Sample docs root.
`);

  mkdirSync(join(docsDir, 'features'), { recursive: true });
  writeFileSync(
    join(docsDir, 'features', 'FEAT-001.md'),
    `---
status: draft
version: 0.1.0
---

# Feature One

This is [[docs/README]].

## Changelog

| Version | Date |
| --- | --- |
| 0.1.0 | 2026-07-19 |
`
  );

  writeFileSync(
    join(docsDir, 'features', 'FEAT-002.md'),
    `# Feature Two

No metadata on this one.
`
  );

  // Create a brain directory
  const brainDir = join(tmpDir, '.govibe', '.brain');
  mkdirSync(brainDir, { recursive: true });

  writeFileSync(
    join(brainDir, 'memory.md'),
    `---
status: accepted
version: 2.0.0
---

# Brain Memory

Link to [[FEAT-001]].

## Changelog

| Version | Date |
| --- | --- |
| 2.0.0 | 2026-07-19 |
`
  );

  return { tmpDir, docsDir, brainDir };
}

test('buildIndex - fixture files', (t) => {
  const { tmpDir, docsDir, brainDir } = setupFixture();

  try {
    // Build index
    const index = buildIndex([docsDir]);

    // Verify we have 3 files
    assert.equal(index.length, 3, 'Should have 3 documents');

    // Check that all have required fields
    for (const entry of index) {
      assert(entry.path, 'Every entry must have path');
      assert(entry.slug, 'Every entry must have slug');
      assert(Array.isArray(entry.headings), 'headings must be an array');
      assert(entry.outbound, 'outbound must exist');
      assert(Array.isArray(entry.outbound.wikilinks), 'outbound.wikilinks must be array');
      assert(Array.isArray(entry.outbound.symbolLinks), 'outbound.symbolLinks must be array');
    }
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('buildIndex - slug computation', (t) => {
  const { tmpDir, docsDir } = setupFixture();

  try {
    const index = buildIndex([docsDir]);

    // Find specific entries by path
    const readmeEntry = index.find((e) => e.path.includes('docs/README.md'));
    const featEntry = index.find((e) => e.path.includes('FEAT-001.md'));

    assert(readmeEntry, 'Should find README');
    assert.equal(readmeEntry.slug, 'docs/README', 'README slug should be docs/README');

    assert(featEntry, 'Should find FEAT-001');
    assert.equal(featEntry.slug, 'FEAT-001', 'FEAT-001 slug should match filename');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('buildIndex - metadata extraction', (t) => {
  const { tmpDir, docsDir } = setupFixture();

  try {
    const index = buildIndex([docsDir]);

    const readmeEntry = index.find((e) => e.slug === 'docs/README');
    assert.equal(readmeEntry.status, 'active', 'Should extract status');
    assert.equal(readmeEntry.version, '1.0.0', 'Should extract version');

    const featEntry = index.find((e) => e.slug === 'FEAT-001');
    assert.equal(featEntry.status, 'draft', 'Should extract status');

    const feat2Entry = index.find((e) => e.slug === 'FEAT-002');
    assert.equal(feat2Entry.status, null, 'Should be null when no metadata');
    assert.equal(feat2Entry.version, null, 'Should be null when no version');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('buildIndex - title extraction', (t) => {
  const { tmpDir, docsDir } = setupFixture();

  try {
    const index = buildIndex([docsDir]);

    const readmeEntry = index.find((e) => e.slug === 'docs/README');
    assert.equal(readmeEntry.title, 'Docs Root', 'Should extract first h1 as title');

    const featEntry = index.find((e) => e.slug === 'FEAT-001');
    assert.equal(featEntry.title, 'Feature One', 'Should extract title from FEAT-001');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('buildIndex - wikilinks extraction', (t) => {
  const { tmpDir, docsDir } = setupFixture();

  try {
    const index = buildIndex([docsDir]);

    const featEntry = index.find((e) => e.slug === 'FEAT-001');
    assert(featEntry.outbound.wikilinks.length > 0, 'Should extract wikilinks');

    const wikilink = featEntry.outbound.wikilinks.find((w) => w.slug === 'docs/README');
    assert(wikilink, 'Should find docs/README wikilink');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('buildIndex - deterministic output', (t) => {
  const { tmpDir, docsDir } = setupFixture();

  try {
    // Run twice and compare
    const index1 = buildIndex([docsDir]);
    const index2 = buildIndex([docsDir]);

    // Convert to JSON and compare byte-for-byte
    const json1 = JSON.stringify(index1, null, 2);
    const json2 = JSON.stringify(index2, null, 2);

    assert.equal(json1, json2, 'Output should be byte-identical across runs');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('buildIndex - multiple roots', (t) => {
  const { tmpDir, docsDir, brainDir } = setupFixture();

  try {
    // Build index with both docs and brain
    const index = buildIndex([docsDir, brainDir]);

    // Should have entries from both
    const docsEntries = index.filter((e) => e.path.includes('docs'));
    const brainEntries = index.filter((e) => e.path.includes('.govibe'));

    assert(docsEntries.length > 0, 'Should have docs entries');
    assert(brainEntries.length > 0, 'Should have brain entries');
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});

test('buildIndex - JSON parseability', (t) => {
  const { tmpDir, docsDir } = setupFixture();

  try {
    const index = buildIndex([docsDir]);

    // Each entry should be JSON-serializable
    for (const entry of index) {
      const json = JSON.stringify(entry);
      const parsed = JSON.parse(json);
      assert.deepEqual(parsed, entry, `Entry should round-trip through JSON`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true });
  }
});
