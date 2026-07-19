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
 * Returns array of {target, anchorLine|null, line}
 *
 * @param {string} mdText - The markdown content to search
 * @returns {Array<{target: string, anchorLine: number|null, line: number}>}
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
