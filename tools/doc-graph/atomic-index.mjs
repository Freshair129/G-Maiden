#!/usr/bin/env node
/**
 * tools/doc-graph/atomic-index.mjs
 *
 * Atomic document index builder — creates a lightweight index of all docs
 * with their path, slug, title (first h1), metadata (status, version), headings,
 * and outbound links (wikilinks + symbol links).
 *
 * Reuses G1 extractors: slugmap, wikilinks, symlinks, metadata.
 *
 * Exports:
 *   - buildIndex(roots): build index for given doc roots
 *   - Returns array of {path, slug, title, status, version, headings[], outbound: {wikilinks[], symbolLinks[]}}
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, basename, resolve } from 'node:path';

import { buildSlugMap } from './slugmap.mjs';
import { extractWikilinks } from './wikilinks.mjs';
import { extractSymbolLinks } from './symlinks.mjs';
import { checkMetadata } from './metadata.mjs';

function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * Recursively find every *.md file under `dir`. Returns absolute paths, sorted.
 */
function walkMarkdownFiles(dir) {
  const out = [];
  function scan(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        out.push(full);
      }
    }
  }
  scan(dir);
  out.sort();
  return out;
}

/**
 * Extract the first h1 from markdown text.
 * @returns {string|null}
 */
function extractFirstH1(text) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = /^#\s+(.+)$/.exec(line.trim());
    if (m) {
      return m[1].trim();
    }
  }
  return null;
}

/**
 * Extract all headings from markdown text.
 * @returns {Array<{level: number, text: string}>}
 */
function extractHeadings(text) {
  const headings = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (m) {
      const level = m[1].length;
      const text = m[2].trim();
      headings.push({ level, text });
    }
  }
  return headings;
}

/**
 * Extract status and version from frontmatter.
 * @returns {{status: string|null, version: string|null}}
 */
function extractFrontmatterFields(text) {
  const lines = text.split(/\r?\n/);
  if (!/^---[ \t]*$/.test(lines[0])) {
    return { status: null, version: null };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^---[ \t]*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { status: null, version: null };
  }

  let status = null;
  let version = null;

  for (const line of lines.slice(1, end)) {
    if (status === null) {
      const m = /^status\s*:\s*(.*)$/i.exec(line);
      if (m) {
        status = m[1].trim().replace(/^["']|["']$/g, '');
      }
    }
    if (version === null) {
      const m = /^version\s*:\s*(.*)$/i.exec(line);
      if (m) {
        version = m[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  }

  return { status, version };
}

/**
 * Build an index of atomic documents.
 *
 * @param {string|string[]} roots - One or more root paths to scan (e.g., 'docs', '.govibe/.brain')
 * @returns {Array<{path, slug, title, status, version, headings, outbound}>}
 */
export function buildIndex(roots) {
  const rootArray = Array.isArray(roots) ? roots : [roots];
  const entries = [];
  const seenPaths = new Set();

  // Build a unified slug map across all roots
  const allFiles = [];
  const slugMapPerRoot = new Map();

  for (const root of rootArray) {
    const files = walkMarkdownFiles(root);
    allFiles.push(...files);
    slugMapPerRoot.set(root, buildSlugMap(root));
  }

  // Create a composite slug map for link resolution
  const compositeSlugMap = {};
  for (const [root, slugMap] of slugMapPerRoot) {
    for (const [slug, relPath] of slugMap) {
      if (!(slug in compositeSlugMap)) {
        compositeSlugMap[slug] = relPath;
      }
    }
  }

  // Process each file
  for (const fullPath of allFiles) {
    if (seenPaths.has(fullPath)) continue;
    seenPaths.add(fullPath);

    // Find which root this file belongs to
    let belongsToRoot = null;
    let repoRoot = null;
    for (const root of rootArray) {
      if (fullPath.startsWith(root)) {
        belongsToRoot = root;
        // For docs, repo root is parent; for .govibe/.brain, it's G-Maiden root
        if (root.endsWith('docs')) {
          repoRoot = dirname(root);
        } else {
          repoRoot = dirname(dirname(belongsToRoot));
        }
        break;
      }
    }
    if (!belongsToRoot) continue;

    let raw;
    try {
      raw = readFileSync(fullPath, 'utf8');
    } catch {
      continue;
    }

    const text = stripBom(raw);

    // Compute slug (using same logic as slugmap.mjs)
    const fileName = basename(fullPath);
    let slug;
    if (fileName === 'README.md') {
      const fileDir = dirname(fullPath);
      const relDir = relative(belongsToRoot, fileDir);
      if (relDir === '.') {
        slug = `${basename(belongsToRoot)}/README`;
      } else {
        slug = `${basename(fileDir)}/README`;
      }
    } else {
      slug = fileName.slice(0, -3);
    }

    // Extract metadata
    const { status, version } = extractFrontmatterFields(text);
    const title = extractFirstH1(text);
    const headings = extractHeadings(text);

    // Extract outbound links
    const { links: wikilinks } = extractWikilinks(text);
    const symlinks = extractSymbolLinks(text);

    // Compute path as repo-relative posix
    const repoRel = repoRoot ? toPosix(relative(repoRoot, fullPath)) : toPosix(relative(belongsToRoot, fullPath));

    entries.push({
      path: repoRel,
      slug,
      title,
      status,
      version,
      headings,
      outbound: {
        wikilinks: wikilinks.map((w) => ({ slug: w.slug, label: w.label, line: w.line })),
        symbolLinks: symlinks.map((s) => ({ target: s.target, line: s.line })),
      },
    });
  }

  // Sort by path for deterministic output
  entries.sort((a, b) => a.path.localeCompare(b.path));

  return entries;
}

export default { buildIndex };
