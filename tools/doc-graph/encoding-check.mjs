#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const DEFAULT_TARGETS = [join(REPO_ROOT, 'docs')];
const TEXT_EXTENSIONS = new Set(['.md', '.jsonl']);

export const MOJIBAKE_MARKERS = [
  '\u00e0\u00b8',
  '\u00e0\u00b9',
  '\u00e2\u20ac',
  '\u00e2\u2020',
  '\u00f0\u0178',
  '\u00c3',
  '\u00c2',
];

function collectFiles(target, files = []) {
  if (statSync(target).isDirectory()) {
    for (const entry of readdirSync(target)) collectFiles(join(target, entry), files);
  } else if (TEXT_EXTENSIONS.has(extname(target).toLowerCase())) {
    files.push(target);
  }
  return files;
}

export function scanEncoding(targets = DEFAULT_TARGETS) {
  const findings = [];
  for (const file of targets.flatMap((target) => collectFiles(resolve(target)))) {
    const text = readFileSync(file, 'utf8');
    text.split(/\r?\n/u).forEach((line, index) => {
      for (const marker of MOJIBAKE_MARKERS) {
        if (line.includes(marker)) {
          findings.push({ file, line: index + 1, marker });
        }
      }
    });
  }
  return findings;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const targets = process.argv.slice(2);
  const findings = scanEncoding(targets.length > 0 ? targets : DEFAULT_TARGETS);
  for (const finding of findings) {
    const file = relative(REPO_ROOT, finding.file).replaceAll('\\', '/');
    const marker = JSON.stringify(finding.marker).slice(1, -1);
    console.error(`[encoding-check] ${file}:${finding.line} suspicious marker "${marker}"`);
  }
  console.log(`[encoding-check] ${findings.length === 0 ? 'PASS' : 'FAIL'} (${findings.length} finding(s))`);
  process.exit(findings.length === 0 ? 0 : 1);
}
