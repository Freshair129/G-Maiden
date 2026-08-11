#!/usr/bin/env node
/**
 * Test suite for semantic_ir.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import {
  dotProduct,
  magnitude,
  cosineSimilarity,
  semanticSearch,
} from './semantic_ir.mjs';

const fixtureRoot = join(tmpdir(), `g2-semantic-fixture-${process.pid}`);
const docsRoot = join(fixtureRoot, 'docs');

function setupFixture() {
  try {
    rmSync(fixtureRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
  mkdirSync(docsRoot, { recursive: true });

  writeFileSync(
    join(docsRoot, 'test-doc.md'),
    '# Test document\n\nThis is a simple document content to test semantic search and fallback chains.\n'
  );
}

function teardownFixture() {
  try {
    rmSync(fixtureRoot, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

test('Vector Math: dotProduct calculates correctly', () => {
  assert.strictEqual(dotProduct([1, 2, 3], [4, 5, 6]), 1 * 4 + 2 * 5 + 3 * 6);
  assert.strictEqual(dotProduct([0, 1], [1, 0]), 0);
});

test('Vector Math: magnitude calculates correctly', () => {
  assert.strictEqual(magnitude([3, 4]), 5);
  assert.strictEqual(magnitude([0, 0]), 0);
});

test('Vector Math: cosineSimilarity returns proper values', () => {
  assert.strictEqual(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.strictEqual(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.strictEqual(cosineSimilarity([1, 0], [-1, 0]), -1);
  assert.strictEqual(cosineSimilarity([0, 0], [1, 0]), 0);
});

test('Semantic Search: falls back to FTS file system search when requested', async () => {
  setupFixture();
  try {
    const hits = await semanticSearch([docsRoot], 'fallback chains', { backend: 'file' });
    assert.ok(hits.length >= 1, 'should find hits using file fallback');
    assert.strictEqual(basename(hits[0].path), 'test-doc.md');
  } finally {
    teardownFixture();
  }
});

test('Semantic Search: falls back to FTS file system search when Ollama/Supabase fail', async () => {
  setupFixture();
  // Override global fetch to fail, triggering ultimate fallback
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Connection refused');
  };

  try {
    const hits = await semanticSearch([docsRoot], 'fallback chains', { backend: 'auto' });
    assert.ok(hits.length >= 1, 'should fallback to FTS and find the result');
    assert.strictEqual(basename(hits[0].path), 'test-doc.md');
  } finally {
    globalThis.fetch = originalFetch;
    teardownFixture();
  }
});

test('Semantic Search: Ollama backend builds embeddings, computes similarity and saves cache', async () => {
  setupFixture();
  const originalFetch = globalThis.fetch;

  // Mock Ollama responses
  globalThis.fetch = async (url) => {
    if (url.includes('/api/tags')) {
      return { ok: true, json: async () => ({ models: [{ name: 'bge-m3' }] }) };
    }
    if (url.includes('/api/embeddings')) {
      // Return a dummy normalized embedding
      return { ok: true, json: async () => ({ embedding: [1.0, 0.0] }) };
    }
    throw new Error('Unexpected URL ' + url);
  };

  try {
    const hits = await semanticSearch([docsRoot], 'search query', { backend: 'ollama' });
    assert.ok(hits.length >= 1, 'should run semantic search through mock Ollama');
    assert.strictEqual(basename(hits[0].path), 'test-doc.md');
    assert.strictEqual(hits[0].score, 1, 'mocked similarity score should be 1');
  } finally {
    globalThis.fetch = originalFetch;
    teardownFixture();
  }
});
