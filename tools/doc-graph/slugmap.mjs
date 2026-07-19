#!/usr/bin/env node
/**
 * Slug Map Builder for G-Maiden Documentation
 *
 * Recursively scans docs/**\/*.md and builds a Map<slug, relPath>.
 * Handles README disambiguation, spaces in paths, and UTF-8 BOM.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';

/**
 * Build a slug map from a documentation directory.
 *
 * Slug rules:
 * - Normal file: basename without .md (e.g., 'foo.md' -> 'foo')
 * - README.md: '<parentDirName>/README'
 * - Special: docs/README.md -> 'docs/README'
 *
 * @param {string} docsDir - Root documentation directory
 * @returns {Map<string, string>} Map of slug to relative path
 */
export function buildSlugMap(docsDir) {
  const slugMap = new Map();
  const claims = new Map(); // slug -> [relPath, ...] — every claimant, duplicates included

  function scanDir(currentPath, baseDir) {
    try {
      const entries = readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);
        const relPath = relative(baseDir, fullPath);

        if (entry.isDirectory()) {
          scanDir(fullPath, baseDir);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          const slug = computeSlug(entry.name, fullPath, baseDir);
          // Track EVERY claimant per slug — a Map alone silently drops
          // duplicates, which made collision detection structurally
          // impossible (bug exposed by the T7 review cycle, 2026-07-19).
          if (!claims.has(slug)) claims.set(slug, []);
          claims.get(slug).push(relPath);
          slugMap.set(slug, relPath);
        }
      }
    } catch (err) {
      // Silently skip directories that cannot be read
      // (permission errors, etc.)
    }
  }

  scanDir(docsDir, docsDir);
  // Expose the full claims table for collision detection — the Map's keys
  // are unique by construction, so duplicates only survive here.
  slugMap.claims = claims;
  return slugMap;
}

/**
 * Compute the slug for a markdown file.
 *
 * @param {string} filename - The file name (e.g., 'README.md' or 'foo.md')
 * @param {string} fullPath - The full file path
 * @param {string} baseDir - The base documentation directory
 * @returns {string} The slug
 */
function computeSlug(filename, fullPath, baseDir) {
  const isReadme = filename === 'README.md';

  if (isReadme) {
    const fileDir = dirname(fullPath);
    const relDir = relative(baseDir, fileDir);

    if (relDir === '.') {
      // README at the root: use the base directory name + /README
      const baseName = basename(baseDir);
      return `${baseName}/README`;
    } else {
      // README in a nested dir: <parentDirName>/README
      const parentDir = basename(fileDir);
      return `${parentDir}/README`;
    }
  } else {
    // Normal file: basename without .md
    return filename.slice(0, -3);
  }
}

/**
 * Report duplicate slugs (collision detection).
 *
 * A collision occurs when two non-README files share the same basename,
 * or when the slug computation results in duplicates.
 *
 * @param {Map<string, string>} slugMap - The slug map
 * @returns {Array<object>} Array of violation objects
 */
export function collisions(slugMap) {
  const violations = [];
  // Prefer the claims table attached by buildSlugMap — a Map's keys are
  // unique, so iterating the Map itself can NEVER see a duplicate (the
  // original implementation was structurally dead; found 2026-07-19).
  const slugCounts = slugMap.claims instanceof Map ? slugMap.claims : new Map();

  if (slugCounts.size === 0) {
    for (const [slug, relPath] of slugMap) {
      if (!slugCounts.has(slug)) {
        slugCounts.set(slug, []);
      }
      slugCounts.get(slug).push(relPath);
    }
  }

  // Report collisions
  for (const [slug, paths] of slugCounts) {
    if (paths.length > 1) {
      violations.push({
        slug,
        type: 'duplicate-slug',
        paths,
        message: `Duplicate slug "${slug}" found in: ${paths.join(', ')}`
      });
    }
  }

  return violations;
}

export default { buildSlugMap, collisions };
