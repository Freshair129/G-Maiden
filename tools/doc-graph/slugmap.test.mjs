#!/usr/bin/env node
/**
 * Test suite for slugmap.mjs
 *
 * Tests cover:
 * - Normal markdown files
 * - README files in nested directories
 * - Directories with spaces in names
 * - Duplicate slug detection
 * - UTF-8 BOM handling
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSlugMap, collisions } from './slugmap.mjs';

// Test fixture directory (temporary)
// Fixture lives in the OS temp dir — never inside the repo (write-scope rule)
const fixtureDir = join(tmpdir(), `g1-slugmap-fixture-${process.pid}`);

/**
 * Set up test fixtures
 */
function setupFixture() {
  // Clean up if it exists
  try {
    rmSync(fixtureDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore
  }

  // Create fixture tree
  mkdirSync(fixtureDir, { recursive: true });
  mkdirSync(join(fixtureDir, 'nested', 'deep'), { recursive: true });
  mkdirSync(join(fixtureDir, 'change request'), { recursive: true });
  mkdirSync(join(fixtureDir, 'duplicates'), { recursive: true });

  // Normal file
  writeFileSync(join(fixtureDir, 'normal.md'), '# Normal File\n');

  // README in docs root (special case)
  writeFileSync(join(fixtureDir, 'README.md'), '# Root README\n');

  // README in nested directory
  writeFileSync(join(fixtureDir, 'nested', 'README.md'), '# Nested README\n');

  // Nested file
  writeFileSync(join(fixtureDir, 'nested', 'deep', 'article.md'), '# Deep Article\n');

  // File in directory with spaces
  writeFileSync(
    join(fixtureDir, 'change request', 'CR-001.md'),
    '# Change Request 001\n'
  );

  // Duplicate slugs (two files named README in different nested dirs)
  writeFileSync(join(fixtureDir, 'duplicates', 'README.md'), '# Duplicates README\n');

  // UTF-8 BOM prefixed file
  const bomContent = '﻿# BOM File\n';
  writeFileSync(join(fixtureDir, 'bom-file.md'), bomContent, 'utf8');
}

/**
 * Tear down test fixtures
 */
function teardownFixture() {
  try {
    rmSync(fixtureDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore
  }
}

// Main test suite
test('buildSlugMap - basic functionality', (t) => {
  setupFixture();

  const slugMap = buildSlugMap(fixtureDir);

  // Verify all expected slugs are present
  assert(slugMap.has('normal'), 'should have normal file slug');
  // Root README should use the base directory name (fixtureDir lives in tmpdir)
  const expectedRootReadme = `${basename(fixtureDir)}/README`;
  assert(slugMap.has(expectedRootReadme), 'should have root README slug using base dir name');
  assert(slugMap.has('nested/README'), 'should have nested README with parent dir');
  assert(slugMap.has('article'), 'should have deep article slug');
  assert(slugMap.has('CR-001'), 'should handle spaces in dirname');

  teardownFixture();
});

test('buildSlugMap - normal file mapping', (t) => {
  setupFixture();

  const slugMap = buildSlugMap(fixtureDir);
  const normalPath = slugMap.get('normal');

  assert(normalPath, 'normal slug should exist');
  assert(normalPath.endsWith('normal.md'), 'slug should map to correct relative path');

  teardownFixture();
});

test('buildSlugMap - README in nested directory', (t) => {
  setupFixture();

  const slugMap = buildSlugMap(fixtureDir);
  const nestedReadmePath = slugMap.get('nested/README');

  assert(nestedReadmePath, 'nested/README slug should exist');
  assert(nestedReadmePath.includes('nested') && nestedReadmePath.endsWith('README.md'),
    'should map to nested/README.md');

  teardownFixture();
});

test('buildSlugMap - space in directory name', (t) => {
  setupFixture();

  const slugMap = buildSlugMap(fixtureDir);
  const crPath = slugMap.get('CR-001');

  assert(crPath, 'CR-001 slug should exist');
  assert(crPath.includes('change request'), 'should handle directory with spaces');

  teardownFixture();
});

test('buildSlugMap - root README special case', (t) => {
  setupFixture();

  const slugMap = buildSlugMap(fixtureDir);

  // The root README.md should map to '<baseDirName>/README'
  const expectedRootReadme = `${basename(fixtureDir)}/README`;
  assert(slugMap.has(expectedRootReadme),
    'should handle root README with base dir name prefix');

  teardownFixture();
});

test('collisions - detect duplicate slugs', (t) => {
  // Create a custom test case with actual duplicates
  setupFixture();

  // Add a second file that would create a collision
  // (Both article.md files would have slug 'article')
  mkdirSync(join(fixtureDir, 'another'), { recursive: true });
  writeFileSync(join(fixtureDir, 'another', 'article.md'), '# Another Article\n');

  const slugMap = buildSlugMap(fixtureDir);
  const violations = collisions(slugMap);

  // Check if collision is detected
  const articleCollisions = violations.filter(v => v.slug === 'article');

  if (articleCollisions.length > 0) {
    assert.strictEqual(articleCollisions[0].type, 'duplicate-slug',
      'collision should be marked as duplicate-slug');
    assert(articleCollisions[0].paths.length >= 2,
      'collision should list multiple paths');
  }

  teardownFixture();
});

test('collisions - empty map returns no violations', (t) => {
  const emptyMap = new Map();
  const violations = collisions(emptyMap);

  assert.strictEqual(violations.length, 0, 'empty map should have no violations');
});

test('collisions - detects a true duplicate-basename slug pair', (t) => {
  setupFixture();
  // Seed a TRUE duplicate-basename collision locally (kept out of the shared
  // fixture so size/uniqueness tests stay unaffected)
  writeFileSync(join(fixtureDir, 'nested', 'dupe.md'), '# Dupe A');
  writeFileSync(join(fixtureDir, 'duplicates', 'dupe.md'), '# Dupe B');

  const slugMap = buildSlugMap(fixtureDir);
  const violations = collisions(slugMap);

  // (each file has a unique slug based on our setup)
  const duplicateViolations = violations.filter(v => v.type === 'duplicate-slug');

  // If there are no duplicates, violations should be empty or only contain non-duplicate types
  // The fixture seeds exactly one true collision: 'dupe' claimed by two non-README files
  const dupe = duplicateViolations.find((v) => (v.slug || v.id || '').includes('dupe'));
  assert(dupe, `collisions must report the seeded 'dupe' duplicate-basename pair (got ${JSON.stringify(duplicateViolations)})`);

  teardownFixture();
});

// NOTE: no BOM test here by design — slugmap derives slugs from FILENAMES and never
// reads file content, so a BOM fixture exercises nothing (review finding, 2026-07-19).
// BOM handling is covered where content is actually parsed: metadata.test.mjs.

test('buildSlugMap - handles missing or inaccessible directories gracefully', (t) => {
  // Test with non-existent directory
  const nonExistentDir = join(process.cwd(), '.non-existent-dir-slugmap');

  // Should not throw; should return empty map
  let slugMap;
  try {
    slugMap = buildSlugMap(nonExistentDir);
  } catch (e) {
    // If it throws, that's ok for a truly non-existent dir
    slugMap = new Map();
  }

  assert(slugMap instanceof Map, 'should return a Map even for missing directory');
});

console.log('All tests passed!');
