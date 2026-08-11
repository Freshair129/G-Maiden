#!/usr/bin/env node
/**
 * tools/doc-graph/semantic_ir.mjs
 *
 * Modular Semantic Search & Information Retrieval (IR) client for G-Maiden docs.
 * Supports:
 *   1. Supabase (pgvector RPC match_documents)
 *   2. Ollama (Local bge-m3 embeddings + local vector cache docs/DOC-EMBEDDINGS.json)
 *   3. File System (Fallback to substring FTS in fts.mjs)
 *
 * Uses environment variables:
 *   - SEMANTIC_IR_BACKEND: 'supabase' | 'ollama' | 'file'
 *   - SUPABASE_URL & SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *   - OLLAMA_URL (defaults to http://localhost:11434)
 *   - OLLAMA_MODEL (defaults to bge-m3)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { search as ftsSearch } from './fts.mjs';

// Configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'bge-m3';
const BACKEND_PREFERENCE = process.env.SEMANTIC_IR_BACKEND || 'auto';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const EMBEDDINGS_CACHE_FILE = join(REPO_ROOT, 'docs', '_generated', 'DOC-EMBEDDINGS.json');

// --- Vector Math ---

export function dotProduct(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function magnitude(a) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * a[i];
  }
  return Math.sqrt(sum);
}

export function cosineSimilarity(a, b) {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

// --- Helper Utilities ---

function getSha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

/** Recursively find every *.md file under `root`. Missing dirs -> []. */
async function walkMarkdownFiles(root) {
  const { readdir } = await import('node:fs/promises');
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        out.push(full);
      }
    }
  }
  await walk(root);
  return out;
}

function chunkDocument(content) {
  const lines = content.split(/\r\n|\r|\n/);
  const chunks = [];
  let currentHeader = 'Introduction';
  let currentHeaderLine = 1;
  let currentText = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const match = /^(#{1,6})\s+(.+)$/.exec(lineText);
    if (match) {
      if (currentText.length > 0) {
        chunks.push({
          title: currentHeader,
          line: currentHeaderLine,
          content: currentText.join('\n').trim(),
        });
      }
      currentHeader = match[2].trim();
      currentHeaderLine = i + 1;
      currentText = [];
    } else {
      currentText.push(lineText);
    }
  }

  if (currentText.length > 0) {
    chunks.push({
      title: currentHeader,
      line: currentHeaderLine,
      content: currentText.join('\n').trim(),
    });
  }

  return chunks;
}

// --- Ollama Embedding client ---

async function fetchOllamaEmbedding(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: text,
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embedding call failed: ${res.statusText}`);
  }
  const json = await res.json();
  if (!json.embedding || !Array.isArray(json.embedding)) {
    throw new Error('Ollama returned invalid embedding payload');
  }
  return json.embedding;
}

// --- Supabase pgvector client ---

async function querySupabaseSemantic(embedding, limit) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error('Supabase environment variables not configured');
  }

  const res = await fetch(`${url}/rest/v1/rpc/match_documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': key,
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: limit,
    }),
  });

  if (!res.ok) {
    throw new Error(`Supabase query failed: ${res.statusText}`);
  }
  return res.json();
}

// --- Main Search Router ---

export async function semanticSearch(roots, query, opts = {}) {
  const limit = opts.limit ?? 10;
  const backend = opts.backend || BACKEND_PREFERENCE;

  if (backend === 'file') {
    return ftsSearch(roots, query, opts);
  }

  // 1. Try Supabase pgvector if requested or auto-detecting
  if (backend === 'supabase' || (backend === 'auto' && process.env.SUPABASE_URL)) {
    try {
      console.warn('[Semantic IR] Attempting Supabase pgvector backend...');
      const queryEmbedding = await fetchOllamaEmbedding(query);
      const matches = await querySupabaseSemantic(queryEmbedding, limit);
      return matches.map((m) => ({
        path: join(REPO_ROOT, m.doc_slug),
        line: m.line || 1,
        score: m.similarity || 0,
        title: m.title || basename(m.doc_slug),
        snippet: m.content || '',
      }));
    } catch (err) {
      console.warn(`[Semantic IR] Supabase pgvector backend failed: ${err.message}. Falling back...`);
      if (backend === 'supabase') {
        throw err;
      }
    }
  }

  // 2. Try Ollama Local Embeddings if requested or auto-detecting
  if (backend === 'ollama' || backend === 'auto') {
    try {
      // Pre-flight check if Ollama is reachable
      const checkRes = await fetch(`${OLLAMA_URL}/api/tags`).catch(() => null);
      if (!checkRes || !checkRes.ok) {
        throw new Error('Ollama endpoint is unreachable');
      }

      console.warn('[Semantic IR] Using Ollama Local Embeddings backend...');
      const queryEmbedding = await fetchOllamaEmbedding(query);

      // Load or build the embeddings cache
      let cache = {};
      if (existsSync(EMBEDDINGS_CACHE_FILE)) {
        try {
          cache = JSON.parse(await readFile(EMBEDDINGS_CACHE_FILE, 'utf8'));
        } catch {
          // ignore malformed cache
        }
      }

      const files = [];
      for (const root of roots) {
        files.push(...(await walkMarkdownFiles(root)));
      }

      let cacheDirty = false;
      const allChunks = [];

      for (const file of files) {
        let content;
        try {
          content = await readFile(file, 'utf8');
        } catch {
          continue;
        }

        const sha = getSha256(content);
        const relPath = relative(REPO_ROOT, file);

        if (!cache[relPath] || cache[relPath].sha256 !== sha) {
          console.warn(`[Semantic IR] Generating embeddings for ${relPath}...`);
          const docChunks = chunkDocument(content);
          const chunksWithEmbeddings = [];

          for (const c of docChunks) {
            if (!c.content.trim()) continue;
            try {
              const embedding = await fetchOllamaEmbedding(c.content);
              chunksWithEmbeddings.push({ ...c, embedding });
            } catch (err) {
              console.warn(`[Semantic IR] Failed embedding chunk in ${relPath}: ${err.message}`);
            }
          }

          cache[relPath] = {
            sha256: sha,
            chunks: chunksWithEmbeddings,
          };
          cacheDirty = true;
        }

        allChunks.push(
          ...cache[relPath].chunks.map((c) => ({
            ...c,
            path: file,
          }))
        );
      }

      if (cacheDirty) {
        // docs/_generated/ is gitignored (the cache is a 70MB+ regenerable blob), so it
        // does not exist in a fresh clone and writeFile would ENOENT on the first run.
        await mkdir(dirname(EMBEDDINGS_CACHE_FILE), { recursive: true });
        await writeFile(EMBEDDINGS_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
      }

      // Calculate similarity
      const results = allChunks
        .map((c) => {
          const sim = cosineSimilarity(queryEmbedding, c.embedding);
          return {
            path: c.path,
            line: c.line,
            score: sim,
            title: c.title,
            snippet: c.content,
          };
        })
        .filter((r) => r.score >= 0.3) // threshold
        .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

      return results.slice(0, limit);
    } catch (err) {
      console.warn(`[Semantic IR] Ollama Local Embeddings backend failed: ${err.message}. Falling back...`);
      if (backend === 'ollama') {
        throw err;
      }
    }
  }

  // 3. Ultimate Fallback to File System Substring FTS
  console.warn('[Semantic IR] Falling back to Local File System Substring FTS...');
  return ftsSearch(roots, query, opts);
}

// --- CLI Runner ---

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const query = args.join(' ').trim();
  if (!query) {
    console.error('Usage: node tools/doc-graph/semantic_ir.mjs "<query>"');
    process.exitCode = 1;
    return;
  }

  const docsDir = join(REPO_ROOT, 'docs');
  const brainDir = join(REPO_ROOT, '.govibe', '.brain');

  const hits = await semanticSearch([docsDir, brainDir], query, { limit: 10 });
  if (hits.length === 0) {
    console.log('No results.');
    return;
  }
  for (const hit of hits) {
    const relPath = relative(REPO_ROOT, hit.path).replace(/\\/g, '/');
    console.log(`${relPath}:${hit.line} [score: ${hit.score.toFixed(2)}] ${hit.title}\n  ${hit.snippet.slice(0, 150)}...\n`);
  }
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main();
}
