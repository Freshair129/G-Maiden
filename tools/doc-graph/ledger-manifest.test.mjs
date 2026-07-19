#!/usr/bin/env node
/**
 * Test suite for ledger-manifest.mjs
 * Tests YAML parsing, schema validation, and ref resolution.
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadManifest, resolveRefs } from './ledger-manifest.mjs';

function createTempDir() {
  const base = join(tmpdir(), `ledger-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(base, { recursive: true });
  return base;
}

function cleanupTempDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    // ignore
  }
}

test('loadManifest: valid manifest with 2 entries', () => {
  const tempDir = createTempDir();
  try {
    const manifestContent = `entries:
  - id: feat-1
    title: "Feature One"
    kind: feature
    phase_target: P2
    refs:
      docs: docs/features/feat-1.md
      code: src-tauri/src/feat1.rs
  - id: fr-001
    title: "Functional Requirement 1"
    kind: fr
    phase_target: P3
    refs:
      srs: docs/srs/fr-001.md
      tests: tests/fr-001.test.mjs
`;
    const manifestPath = join(tempDir, 'manifest.yaml');
    writeFileSync(manifestPath, manifestContent, 'utf8');

    const entries = loadManifest(manifestPath);

    assert.equal(entries.length, 2, 'Should have 2 entries');
    assert.equal(entries[0].id, 'feat-1');
    assert.equal(entries[0].kind, 'feature');
    assert.equal(entries[0].phase_target, 'P2');
    assert.deepEqual(entries[0].refs, {
      docs: 'docs/features/feat-1.md',
      code: 'src-tauri/src/feat1.rs',
    });
    assert.equal(entries[1].id, 'fr-001');
    assert.equal(entries[1].kind, 'fr');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('loadManifest: unknown key in entry', () => {
  const tempDir = createTempDir();
  try {
    const manifestContent = `entries:
  - id: feat-1
    title: "Feature One"
    kind: feature
    phase_target: P2
    unknown_field: bad_value
    refs: {}
`;
    const manifestPath = join(tempDir, 'manifest.yaml');
    writeFileSync(manifestPath, manifestContent, 'utf8');

    assert.throws(
      () => loadManifest(manifestPath),
      /unknown key "unknown_field"/i,
      'Should error on unknown entry key'
    );
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('loadManifest: missing required field "kind"', () => {
  const tempDir = createTempDir();
  try {
    const manifestContent = `entries:
  - id: feat-1
    title: "Feature One"
    phase_target: P2
    refs: {}
`;
    const manifestPath = join(tempDir, 'manifest.yaml');
    writeFileSync(manifestPath, manifestContent, 'utf8');

    assert.throws(
      () => loadManifest(manifestPath),
      /missing required field "kind"/i,
      'Should error on missing kind field'
    );
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('loadManifest: invalid kind value', () => {
  const tempDir = createTempDir();
  try {
    const manifestContent = `entries:
  - id: feat-1
    title: "Feature One"
    kind: invalid_kind
    phase_target: P2
    refs: {}
`;
    const manifestPath = join(tempDir, 'manifest.yaml');
    writeFileSync(manifestPath, manifestContent, 'utf8');

    assert.throws(
      () => loadManifest(manifestPath),
      /invalid kind "invalid_kind"/i,
      'Should error on invalid kind'
    );
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('loadManifest: invalid phase_target', () => {
  const tempDir = createTempDir();
  try {
    const manifestContent = `entries:
  - id: feat-1
    title: "Feature One"
    kind: feature
    phase_target: P99
    refs: {}
`;
    const manifestPath = join(tempDir, 'manifest.yaml');
    writeFileSync(manifestPath, manifestContent, 'utf8');

    assert.throws(
      () => loadManifest(manifestPath),
      /invalid phase_target "P99"/i,
      'Should error on invalid phase_target'
    );
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('loadManifest: unknown ref key', () => {
  const tempDir = createTempDir();
  try {
    const manifestContent = `entries:
  - id: feat-1
    title: "Feature One"
    kind: feature
    phase_target: P2
    refs:
      docs: docs/feat.md
      unknown_ref_type: something
`;
    const manifestPath = join(tempDir, 'manifest.yaml');
    writeFileSync(manifestPath, manifestContent, 'utf8');

    assert.throws(
      () => loadManifest(manifestPath),
      /unknown ref key "unknown_ref_type"/i,
      'Should error on unknown ref key'
    );
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('loadManifest: refs must be an object', () => {
  const tempDir = createTempDir();
  try {
    const manifestContent = `entries:
  - id: feat-1
    title: "Feature One"
    kind: feature
    phase_target: P2
    refs: "not an object"
`;
    const manifestPath = join(tempDir, 'manifest.yaml');
    writeFileSync(manifestPath, manifestContent, 'utf8');

    assert.throws(
      () => loadManifest(manifestPath),
      /refs must be an object/i,
      'Should error when refs is not an object'
    );
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('resolveRefs: dangling code ref returns false', () => {
  const tempDir = createTempDir();
  try {
    // Create a real file for docs, but not for code
    mkdirSync(join(tempDir, 'docs', 'features'), { recursive: true });
    writeFileSync(join(tempDir, 'docs', 'features', 'feat.md'), '# Feature', 'utf8');

    const manifest = [
      {
        id: 'feat-1',
        title: 'Feature One',
        kind: 'feature',
        phase_target: 'P2',
        refs: {
          docs: 'docs/features/feat.md',
          code: 'src-tauri/src/nonexistent.rs', // This file does NOT exist
        },
      },
    ];

    const resolved = resolveRefs(manifest, tempDir);

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].exists.docs, true, 'docs ref should exist');
    assert.equal(resolved[0].exists.code, false, 'code ref should NOT exist');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('resolveRefs: multiple code refs, one exists', () => {
  const tempDir = createTempDir();
  try {
    mkdirSync(join(tempDir, 'src-tauri', 'src'), { recursive: true });
    writeFileSync(join(tempDir, 'src-tauri', 'src', 'exists.rs'), 'mod exists;', 'utf8');

    const manifest = [
      {
        id: 'feat-1',
        title: 'Feature One',
        kind: 'feature',
        phase_target: 'P2',
        refs: {
          code: ['src-tauri/src/missing.rs', 'src-tauri/src/exists.rs'],
        },
      },
    ];

    const resolved = resolveRefs(manifest, tempDir);

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].exists.code, true, 'code should be true if at least one ref exists');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('resolveRefs: empty/missing ref returns false', () => {
  const tempDir = createTempDir();
  try {
    const manifest = [
      {
        id: 'feat-1',
        title: 'Feature One',
        kind: 'feature',
        phase_target: 'P2',
        refs: {},
      },
    ];

    const resolved = resolveRefs(manifest, tempDir);

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].exists.docs, false, 'missing docs ref should return false');
    assert.equal(resolved[0].exists.code, false, 'missing code ref should return false');
    assert.equal(resolved[0].exists.tests, false, 'missing tests ref should return false');
    assert.equal(resolved[0].exists.review, false, 'missing review ref should return false');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('resolveRefs: preserves entry data and adds exists map', () => {
  const tempDir = createTempDir();
  try {
    mkdirSync(join(tempDir, 'docs'), { recursive: true });
    writeFileSync(join(tempDir, 'docs', 'feat.md'), '# Feature', 'utf8');

    const manifest = [
      {
        id: 'feat-1',
        title: 'Feature One',
        kind: 'feature',
        phase_target: 'P2',
        claimed_status: 'verified',
        refs: {
          docs: 'docs/feat.md',
        },
      },
    ];

    const resolved = resolveRefs(manifest, tempDir);

    assert.equal(resolved[0].id, 'feat-1');
    assert.equal(resolved[0].title, 'Feature One');
    assert.equal(resolved[0].kind, 'feature');
    assert.equal(resolved[0].claimed_status, 'verified');
    assert.deepEqual(resolved[0].exists, {
      docs: true,
      srs: false,
      code: false,
      tests: false,
      review: false,
    });
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('loadManifest: optional fields (claimed_status, source) allowed', () => {
  const tempDir = createTempDir();
  try {
    const manifestContent = `entries:
  - id: feat-1
    title: "Feature One"
    kind: feature
    phase_target: P2
    claimed_status: verified
    source: bootstrap-extraction
    refs:
      docs: docs/feat.md
`;
    const manifestPath = join(tempDir, 'manifest.yaml');
    writeFileSync(manifestPath, manifestContent, 'utf8');

    const entries = loadManifest(manifestPath);

    assert.equal(entries[0].claimed_status, 'verified');
    assert.equal(entries[0].source, 'bootstrap-extraction');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('loadManifest: nfr kind is valid', () => {
  const tempDir = createTempDir();
  try {
    const manifestContent = `entries:
  - id: nfr-latency
    title: "G-Signal Latency Budget"
    kind: nfr
    phase_target: P5
    refs:
      srs: docs/srs.md
`;
    const manifestPath = join(tempDir, 'manifest.yaml');
    writeFileSync(manifestPath, manifestContent, 'utf8');

    const entries = loadManifest(manifestPath);

    assert.equal(entries[0].kind, 'nfr');
  } finally {
    cleanupTempDir(tempDir);
  }
});

test('loadManifest: array of refs (single-line syntax)', () => {
  const tempDir = createTempDir();
  try {
    const manifestContent = `entries:
  - id: feat-1
    title: "Feature One"
    kind: feature
    phase_target: P2
    refs:
      code: [src-tauri/src/a.rs, src-tauri/src/b.rs]
      tests: [tests/a.test.mjs, tests/b.test.mjs]
`;
    const manifestPath = join(tempDir, 'manifest.yaml');
    writeFileSync(manifestPath, manifestContent, 'utf8');

    const entries = loadManifest(manifestPath);

    assert.deepEqual(entries[0].refs.code, ['src-tauri/src/a.rs', 'src-tauri/src/b.rs']);
    assert.deepEqual(entries[0].refs.tests, ['tests/a.test.mjs', 'tests/b.test.mjs']);
  } finally {
    cleanupTempDir(tempDir);
  }
});
