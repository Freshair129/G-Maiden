#!/usr/bin/env node

/**
 * tools/doc-graph/symlinks.mjs
 * Symbol link validator for G-Maiden doc-graph.
 * Extracts and validates markdown links to local files (file:///g:/G-Maiden/...).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Extract symbol links from markdown text.
 * Finds markdown links [text](url) where url starts with file:///g:/G-Maiden/ or file:///G:/
 * Returns array of {target, anchorLine|null, line, label}
 *
 * @param {string} mdText - The markdown content to search
 * @returns {Array<{target: string, anchorLine: number|null, line: number, label: string}>}
 */
export function extractSymbolLinks(mdText) {
  const links = [];
  const lines = mdText.split('\n');

  // Regex to match markdown links: [text](url)
  const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineText = lines[lineIdx];
    let match;

    // Reset regex state for each line
    linkRegex.lastIndex = 0;

    while ((match = linkRegex.exec(lineText)) !== null) {
      const label = match[1];
      const url = match[2];

      // Check if URL starts with file:///g:/G-Maiden/ or file:///G:/
      // Pattern: file:///[drive]:/G-Maiden/path/to/file[#L<n>]
      const fileUrlMatch = url.match(/^file:\/\/\/[gG]:[/\\]G-Maiden[/\\](.*?)(?:#L(\d+))?$/);
      if (!fileUrlMatch) continue;

      let filePath = fileUrlMatch[1];
      const anchorStr = fileUrlMatch[2];

      // URL-decode the path
      try {
        filePath = decodeURIComponent(filePath);
      } catch (e) {
        // If decoding fails, skip this link
        continue;
      }

      // Normalize path separators to forward slashes for consistency
      filePath = filePath.replace(/\\/g, '/');

      const anchorLine = anchorStr ? parseInt(anchorStr, 10) : null;

      links.push({
        target: filePath,
        anchorLine,
        line: lineIdx + 1, // Line numbers are 1-based
        label,
      });
    }
  }

  return links;
}

/**
 * Validate symbol links against the repository.
 * Checks that files exist and anchors are within bounds.
 *
 * @param {Array<{target: string, anchorLine: number|null, line: number}>} links - Links to validate
 * @param {string} repoRoot - Root path of the repository (G:/G-Maiden)
 * @returns {Array<{target: string, line: number, reason: 'missing-file'|'bad-anchor'}>}
 */
export function validateSymbolLinks(links, repoRoot) {
  const violations = [];

  for (const link of links) {
    const fullPath = path.join(repoRoot, link.target);

    // Check if file/directory exists
    let exists = false;
    let isDirectory = false;

    try {
      const stat = fs.statSync(fullPath);
      exists = true;
      isDirectory = stat.isDirectory();
    } catch (e) {
      // File doesn't exist
      violations.push({
        target: link.target,
        line: link.line,
        reason: 'missing-file',
      });
      continue;
    }

    // If it's a directory, it's valid (no anchor checks needed)
    if (isDirectory) continue;

    // If there's an anchor, validate it
    if (link.anchorLine !== null) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // Strip BOM if present
        const text = content.replace(/^﻿/, '');
        const lineCount = text.split('\n').length;

        // Check if anchor is in valid range (1 <= n <= lineCount)
        if (link.anchorLine < 1 || link.anchorLine > lineCount) {
          violations.push({
            target: link.target,
            line: link.line,
            reason: 'bad-anchor',
          });
        }
      } catch (e) {
        // If we can't read the file to check line count, treat as missing-file
        // (already added above if file doesn't exist, so skip)
      }
    }
  }

  return violations;
}

/**
 * Anchor-integrity checker (G2-T7, born from the G1.5 T7 incident: a repair
 * script pinned App.tsx anchors to plausible in-bounds lines whose symbols
 * had moved out of the facade -- the bounds-only rule in validateSymbolLinks
 * above passed them; only a T3 adversarial review caught it). This closes
 * that gap: bounds-in-range is not enough, the anchored line must actually
 * still contain the symbol the link claims to point at.
 *
 * Only checks links that (a) carry a #L<n> anchor and (b) have a backticked
 * label naming a symbol, not just the file -- i.e. the label, once stripped
 * of its surrounding backticks, is not simply the target's basename.
 * Filename-labeled links (backticked label === basename, e.g. `` `scan.mjs` ``)
 * and anchorless links are exempt, as is any link whose label isn't
 * backtick-quoted at all (plain prose text never names a symbol).
 *
 * The symbol token is derived from the label: strip a trailing '()' (method/
 * function call syntax), then take the last '::' or '.' segment (so
 * `Foo::bar()` -> 'bar', `obj.method()` -> 'method', `plainName` -> 'plainName').
 * That token must appear as a substring somewhere in lines [n-2, n+2]
 * (1-based, clamped to the file's actual line range) of the target file, else
 * a 'anchor-symbol-mismatch' violation is emitted.
 *
 * Mirrors validateSymbolLinks' shape: no `file` field here (the caller,
 * scan.mjs, already knows repoRel and attaches `file` when merging into the
 * aggregate violations list).
 *
 * @param {Array<{target: string, anchorLine: number|null, line: number, label?: string}>} links
 * @param {string} repoRoot - Root path of the repository (G:/G-Maiden)
 * @returns {Array<{line: number, reason: 'anchor-symbol-mismatch', target: string, anchor: number, symbol: string}>}
 */
export function validateAnchorIntegrity(links, repoRoot) {
  const violations = [];

  for (const link of links) {
    // Anchorless links are exempt -- nothing to verify.
    if (link.anchorLine === null || link.anchorLine === undefined) continue;

    const label = typeof link.label === 'string' ? link.label : '';
    const backtickMatch = label.match(/^`(.+)`$/);
    // Not a backticked symbol label (plain prose, or no label) -- exempt.
    if (!backtickMatch) continue;

    const inner = backtickMatch[1];
    const targetBasename = path.basename(link.target);
    // Filename-labeled link (names the file, not a symbol) -- exempt.
    if (inner === targetBasename) continue;

    const symbolBody = inner.replace(/\(\)$/, '');
    const segments = symbolBody.split(/::|\./);
    const symbol = segments[segments.length - 1];
    if (!symbol) continue;

    const fullPath = path.join(repoRoot, link.target);
    let fileLines;
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const text = content.replace(/^﻿/, ''); // strip BOM if present
      fileLines = text.split('\n');
    } catch (e) {
      // Unreadable/missing target -- already reported as 'missing-file' by
      // validateSymbolLinks; nothing more to check here.
      continue;
    }

    const anchor = link.anchorLine;
    const start = Math.max(1, anchor - 2);
    const end = Math.min(fileLines.length, anchor + 2);

    let found = false;
    for (let ln = start; ln <= end; ln++) {
      const lineText = fileLines[ln - 1];
      if (lineText !== undefined && lineText.includes(symbol)) {
        found = true;
        break;
      }
    }

    if (!found) {
      violations.push({
        line: link.line,
        reason: 'anchor-symbol-mismatch',
        target: link.target,
        anchor,
        symbol,
      });
    }
  }

  return violations;
}
