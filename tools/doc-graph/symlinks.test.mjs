#!/usr/bin/env node

/**
 * tools/doc-graph/symlinks.test.mjs
 * Tests for symlinks.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { extractSymbolLinks, validateSymbolLinks } from './symlinks.mjs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');

test('extractSymbolLinks - valid file link', () => {
  const mdText = `# Test
Some text [link to docs](file:///g:/G-Maiden/docs/README.md) here.`;

  const links = extractSymbolLinks(mdText);
  assert.equal(links.length, 1);
  assert.equal(links[0].target, 'docs/README.md');
  assert.equal(links[0].anchorLine, null);
  assert.equal(links[0].line, 2);
});

test('extractSymbolLinks - valid dir link', () => {
  const mdText = `# Test
Link to [directory](file:///G:/G-Maiden/docs/) here.`;

  const links = extractSymbolLinks(mdText);
  assert.equal(links.length, 1);
  assert.equal(links[0].target, 'docs/');
  assert.equal(links[0].anchorLine, null);
  assert.equal(links[0].line, 2);
});

test('extractSymbolLinks - with #L anchor', () => {
  const mdText = `See [this section](file:///g:/G-Maiden/docs/README.md#L10) for details.`;

  const links = extractSymbolLinks(mdText);
  assert.equal(links.length, 1);
  assert.equal(links[0].target, 'docs/README.md');
  assert.equal(links[0].anchorLine, 10);
  assert.equal(links[0].line, 1);
});

test('extractSymbolLinks - %20 encoded path', () => {
  const mdText = `Check [this file](file:///g:/G-Maiden/docs/change%20request/CR-001.md) out.`;

  const links = extractSymbolLinks(mdText);
  assert.equal(links.length, 1);
  assert.equal(links[0].target, 'docs/change request/CR-001.md');
  assert.equal(links[0].anchorLine, null);
  assert.equal(links[0].line, 1);
});

test('extractSymbolLinks - multiple links', () => {
  const mdText = `
[file1](file:///g:/G-Maiden/docs/README.md)
Some text
[file2](file:///G:/G-Maiden/AGENTS.md#L5)
`;

  const links = extractSymbolLinks(mdText);
  assert.equal(links.length, 2);
  assert.equal(links[0].target, 'docs/README.md');
  assert.equal(links[0].anchorLine, null);
  assert.equal(links[0].line, 2);
  assert.equal(links[1].target, 'AGENTS.md');
  assert.equal(links[1].anchorLine, 5);
  assert.equal(links[1].line, 4);
});

test('extractSymbolLinks - non-file URLs ignored', () => {
  const mdText = `
[http link](https://example.com)
[regular link](./docs/README.md)
[file link](file:///g:/G-Maiden/docs/README.md)
`;

  const links = extractSymbolLinks(mdText);
  assert.equal(links.length, 1);
  assert.equal(links[0].target, 'docs/README.md');
});

test('validateSymbolLinks - valid file exists', () => {
  const links = [
    { target: 'docs/README.md', anchorLine: null, line: 1 }
  ];

  const violations = validateSymbolLinks(links, repoRoot);
  assert.equal(violations.length, 0);
});

test('validateSymbolLinks - valid directory exists', () => {
  const links = [
    { target: 'docs/', anchorLine: null, line: 1 }
  ];

  const violations = validateSymbolLinks(links, repoRoot);
  assert.equal(violations.length, 0);
});

test('validateSymbolLinks - missing file', () => {
  const links = [
    { target: 'docs/nonexistent-file-xyz.md', anchorLine: null, line: 1 }
  ];

  const violations = validateSymbolLinks(links, repoRoot);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].reason, 'missing-file');
  assert.equal(violations[0].line, 1);
});

test('validateSymbolLinks - valid #L anchor', () => {
  // docs/README.md should exist and have more than 1 line
  const links = [
    { target: 'docs/README.md', anchorLine: 1, line: 1 }
  ];

  const violations = validateSymbolLinks(links, repoRoot);
  assert.equal(violations.length, 0);
});

test('validateSymbolLinks - out-of-range #L anchor', () => {
  // Create a temporary test file with known line count
  const testDir = path.join(repoRoot, 'tools/doc-graph/.test-temp');
  const testFile = path.join(testDir, 'test-anchor.md');

  // Clean up any existing test files
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Create a file with exactly 5 lines
  fs.writeFileSync(testFile, 'line1\nline2\nline3\nline4\nline5');

  try {
    const links = [
      { target: 'tools/doc-graph/.test-temp/test-anchor.md', anchorLine: 10, line: 1 }
    ];

    const violations = validateSymbolLinks(links, repoRoot);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].reason, 'bad-anchor');
  } finally {
    // Clean up
    fs.unlinkSync(testFile);
    if (fs.readdirSync(testDir).length === 0) {
      fs.rmdirSync(testDir);
    }
  }
});

test('validateSymbolLinks - anchor at line 0 (invalid)', () => {
  const testDir = path.join(repoRoot, 'tools/doc-graph/.test-temp');
  const testFile = path.join(testDir, 'test-anchor2.md');

  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  fs.writeFileSync(testFile, 'line1\nline2\nline3');

  try {
    const links = [
      { target: 'tools/doc-graph/.test-temp/test-anchor2.md', anchorLine: 0, line: 1 }
    ];

    const violations = validateSymbolLinks(links, repoRoot);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].reason, 'bad-anchor');
  } finally {
    fs.unlinkSync(testFile);
    if (fs.readdirSync(testDir).length === 0) {
      fs.rmdirSync(testDir);
    }
  }
});

test('validateSymbolLinks - multiple violations', () => {
  const links = [
    { target: 'docs/README.md', anchorLine: null, line: 1 }, // valid
    { target: 'docs/missing.md', anchorLine: null, line: 2 }, // missing
    { target: 'docs/missing.md', anchorLine: 5, line: 3 }, // missing
  ];

  const violations = validateSymbolLinks(links, repoRoot);
  assert.equal(violations.length, 2); // Two missing-file violations
  assert.equal(violations[0].reason, 'missing-file');
  assert.equal(violations[1].reason, 'missing-file');
});

test('validateSymbolLinks - handles BOM in files', () => {
  const testDir = path.join(repoRoot, 'tools/doc-graph/.test-temp');
  const testFile = path.join(testDir, 'test-bom.md');

  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Write file with BOM
  const content = '﻿line1\nline2\nline3';
  fs.writeFileSync(testFile, content, 'utf-8');

  try {
    const links = [
      { target: 'tools/doc-graph/.test-temp/test-bom.md', anchorLine: 3, line: 1 }
    ];

    // Should handle BOM and treat #L3 as valid
    const violations = validateSymbolLinks(links, repoRoot);
    assert.equal(violations.length, 0);
  } finally {
    fs.unlinkSync(testFile);
    if (fs.readdirSync(testDir).length === 0) {
      fs.rmdirSync(testDir);
    }
  }
});

test('extractSymbolLinks - empty input', () => {
  const links = extractSymbolLinks('');
  assert.equal(links.length, 0);
});

test('extractSymbolLinks - no links', () => {
  const mdText = `# Heading
Some paragraph text without any links.`;
  const links = extractSymbolLinks(mdText);
  assert.equal(links.length, 0);
});

test('validateSymbolLinks - empty array', () => {
  const violations = validateSymbolLinks([], repoRoot);
  assert.equal(violations.length, 0);
});
