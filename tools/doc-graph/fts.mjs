#!/usr/bin/env node
/**
 * tools/doc-graph/fts.mjs
 *
 * Pure-Node full-text search over docs/**\/*.md + .govibe/.brain/**\/*.md.
 * No dependencies (no ripgrep, no index build step) — every search walks
 * the tree fresh, which is fine at this repo's doc-corpus size.
 *
 * Ported from G:/cognitive_system/packages/msp/src/cognitive/fts.ts
 * (§13 Hybrid Retrieval — layer 2 FTS, `ftsSearch()`). Original design:
 * case-insensitive substring match on title + body, token-overlap
 * (Jaccard-ish) score to break ties, top-`limit` hits (default 10).
 *
 * Changes made while porting:
 *   - Walks two repo roots (docs/, .govibe/.brain/) recursively instead of
 *     a flat `gks/<type>/*.md` layout.
 *   - Adds a first-match line number per hit, since this CLI's output
 *     format is `path:line score snippet` (the original TS caller only
 *     needed a path + snippet, no line).
 *   - Adds an exact-phrase bonus on top of the token-overlap fraction, so a
 *     document containing the query as one contiguous phrase always
 *     outranks a document that merely contains all the same tokens
 *     scattered apart (the original TS scored both identically).
 *   - Matching stays substring-based end to end (`String.includes`), never
 *     a `\b`-word-boundary regex — `\b` is an ASCII `\w` boundary in JS and
 *     silently fails to bound Thai script (Thai has no ASCII word chars
 *     and commonly no whitespace between words). Substring matching is
 *     script-agnostic, so a Thai query matches inside an unspaced Thai
 *     compound word exactly the way a Thai reader would expect.
 *
 * Usage (CLI):
 *   node tools/doc-graph/fts.mjs "<query>"
 * prints up to 10 hits, one per line, as: `<path>:<line> <score> <snippet>`
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

/**
 * Whitespace-split tokenizer. Deliberately dumb: for scripts that use
 * spaces (English, etc.) this yields the expected per-word tokens; for a
 * Thai query with no internal whitespace it degenerates to a single token
 * equal to the whole trimmed query — which is exactly what we want, since
 * matching is substring-based (see header) and never depends on token
 * boundaries lining up with word boundaries.
 */
export function tokenize(query) {
  const trimmed = String(query ?? '').trim().toLowerCase();
  if (!trimmed) return [];
  return trimmed.split(/\s+/).filter(Boolean);
}

/** Recursively find every *.md file under `root`. Missing dirs -> []. */
async function walkMarkdownFiles(root) {
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

function extractTitle(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm) return null;
  const m = /^title:\s*(.+)$/m.exec(fm[1]);
  return m ? m[1].trim() : null;
}

/** Same fragment-around-first-hit approach as the original TS `snippet()`. */
function buildSnippet(text, tokens) {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const lower = body.toLowerCase();
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i >= 0) {
      const start = Math.max(0, i - 60);
      const end = Math.min(body.length, i + 180);
      const fragment = body.slice(start, end).replace(/\s+/g, ' ').trim();
      return (start > 0 ? '…' : '') + fragment + (end < body.length ? '…' : '');
    }
  }
  return body.slice(0, 200).replace(/\s+/g, ' ').trim();
}

/** 1-indexed line of the first match; prefers the whole phrase when it hit. */
function firstMatchLine(lines, tokens, wholePhrase, phraseMatched) {
  if (phraseMatched) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(wholePhrase)) return i + 1;
    }
  }
  for (const t of tokens) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(t)) return i + 1;
    }
  }
  return 1;
}

/**
 * Search `roots` (an array of directories, walked recursively for *.md)
 * for `query`. Returns up to `opts.limit` (default 10) hits sorted by
 * score descending, tie-broken by path for deterministic output.
 */
export async function search(roots, query, opts = {}) {
  const limit = opts.limit ?? 10;
  const trimmed = String(query ?? '').trim();
  if (!trimmed) return [];

  const wholePhrase = trimmed.toLowerCase();
  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return [];

  const files = [];
  for (const root of roots) {
    files.push(...(await walkMarkdownFiles(root)));
  }

  const out = [];
  for (const file of files) {
    let raw;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const content = stripBom(raw);
    const lowerBody = content.toLowerCase();

    let matched = 0;
    for (const t of tokens) {
      if (lowerBody.includes(t)) matched++;
    }
    if (matched === 0) continue;

    // Exact-phrase bonus: only meaningful when there's more than one token
    // to scatter in the first place (a single-token query has no "scattered"
    // form to be outranked).
    const phraseMatched = tokens.length > 1 && lowerBody.includes(wholePhrase);
    const score = matched / tokens.length + (phraseMatched ? 1 : 0);

    const lines = content.split(/\r\n|\r|\n/);
    const line = firstMatchLine(lines, tokens, wholePhrase, phraseMatched);
    const title = extractTitle(content) ?? basename(file).replace(/\.md$/i, '');

    out.push({
      path: file,
      line,
      score,
      title,
      snippet: buildSnippet(content, tokens),
    });
  }

  out.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return out.slice(0, limit);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const query = args.join(' ').trim();
  if (!query) {
    console.error('Usage: node tools/doc-graph/fts.mjs "<query>"');
    process.exitCode = 1;
    return;
  }

  const here = fileURLToPath(new URL('.', import.meta.url));
  const repoRoot = resolve(here, '..', '..');
  const docsDir = join(repoRoot, 'docs');
  const brainDir = join(repoRoot, '.govibe', '.brain');

  const hits = await search([docsDir, brainDir], query, { limit: 10 });
  if (hits.length === 0) {
    console.log('No results.');
    return;
  }
  for (const hit of hits) {
    const relPath = toPosix(relative(repoRoot, hit.path));
    console.log(`${relPath}:${hit.line} ${hit.score.toFixed(2)} ${hit.snippet}`);
  }
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main();
}
