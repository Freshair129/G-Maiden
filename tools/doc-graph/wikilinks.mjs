#!/usr/bin/env node

/**
 * wikilinks.mjs — Markdown wikilink extraction and validation.
 *
 * Exports:
 *   - extractWikilinks(mdText): extract [[slug]] and [[slug|label]] patterns,
 *     skipping code fences and inline code. Returns {links, wildcards}.
 *   - validateWikilinks(links, slugMap): validate extracted links against a slug map.
 *     Returns violations array.
 */

import { createReadStream } from 'node:fs';
import { basename, dirname } from 'node:path';

/**
 * Extract wikilinks from markdown text.
 *
 * Parses [[slug]] and [[slug|label]] patterns, ignoring those inside:
 * - Triple-backtick code fences (``` ... ```)
 * - Inline code spans (` ... `)
 *
 * Wildcard slugs (containing '*') are skipped but reported.
 *
 * @param {string} mdText - Markdown text to parse
 * @returns {{links: Array<{slug, label, line}>, wildcards: Array<{slug, label, line}>}}
 */
export function extractWikilinks(mdText) {
  const lines = mdText.split('\n');
  const links = [];
  const wildcards = [];

  // Track if we're inside a code fence
  let inCodeFence = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Check for code fence markers (triple backticks)
    if (line.trim().startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue; // Skip the fence line itself
    }

    // Skip processing if inside a code fence
    if (inCodeFence) {
      continue;
    }

    // Process the line for wikilinks, respecting inline code (single backticks)
    // We need to be careful not to match [[...]] inside inline code
    let processedLine = '';
    let inInlineCode = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '`' && (i === 0 || line[i - 1] !== '\\')) {
        inInlineCode = !inInlineCode;
        processedLine += char;
      } else if (!inInlineCode) {
        processedLine += char;
      } else {
        // Inside inline code, keep the character but mark it as non-extractable
        // We'll use a placeholder
        processedLine += '\0';
      }
    }

    // Now extract wikilinks from the processed line
    // Match [[slug]] and [[slug|label]]
    const wikiLinkPattern = /\[\[([^\[\]|]+)(?:\|([^\[\]]*?))?\]\]/g;
    let match;

    while ((match = wikiLinkPattern.exec(processedLine)) !== null) {
      // Skip if the match contains null characters (was in inline code)
      if (match[0].includes('\0')) {
        continue;
      }

      const slug = match[1].trim();
      const label = match[2] ? match[2].trim() : null;

      // Check if it's a wildcard slug (contains '*')
      if (slug.includes('*')) {
        wildcards.push({ slug, label, line: lineNum });
      } else {
        links.push({ slug, label, line: lineNum });
      }
    }
  }

  return { links, wildcards };
}

/**
 * Validate extracted wikilinks against a slug map.
 *
 * Checks for:
 * - 'unresolved': slug not found in slugMap
 *
 * CORRECTED RULE (G15-T1, 2026-07-19): this function used to also emit a
 * 'collision' violation whenever the *same valid slug* appeared more than
 * once in a single document's `links` array (e.g. `[[docs/README]]` cited
 * from two different paragraphs). That is a false-positive class, not a
 * defect: linking to the same doc twice is normal prose, not ambiguity. It
 * was flagging 58/58 of the repo's real 'collision' violations with zero
 * true duplicates among them (see docs/rca or G15-T1 task notes).
 *
 * True slug *ambiguity* — two distinct non-README files claiming the same
 * basename slug — is a structurally different question ("does this slug
 * resolve to more than one file on disk?") that this function cannot answer
 * from a single document's links array; it is answered once, correctly, by
 * walking the whole docs/ tree (see `findDuplicateSlugGroups` in scan.mjs,
 * which emits the 'duplicate-slug' reason, and `collisions()` in
 * slugmap.mjs, which composes the same claims-table check). Do not
 * reintroduce a per-document repeated-link check as a violation here.
 *
 * @param {Array<{slug, label, line}>} links - Extracted links from extractWikilinks
 * @param {Object} slugMap - Map of valid slugs (keys are slug strings)
 * @returns {Array<{slug, line, reason}>} Array of violations
 */
export function validateWikilinks(links, slugMap) {
  const violations = [];

  for (const link of links) {
    // Check for unresolved
    if (!slugMap.hasOwnProperty(link.slug)) {
      violations.push({
        slug: link.slug,
        line: link.line,
        reason: 'unresolved'
      });
    }
  }

  return violations;
}
