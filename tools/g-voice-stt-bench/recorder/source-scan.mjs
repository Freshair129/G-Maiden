import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

function forbiddenPatterns() {
  const spell = (...parts) => parts.join('');
  const words = [
    spell('fe', 'tch'), spell('xml', 'h', 'ttp', 'request'), spell('web', 'so', 'cket'),
    spell('event', 'source'), spell('send', 'beacon'), spell('no', 'de:', 'h', 'ttp'),
    spell('no', 'de:', 'h', 'ttps'), spell('no', 'de:', 'ne', 't'),
    spell('h', 'ttp'), spell('h', 'ttps'),
  ];
  return words.map((word) => ({ word, pattern: new RegExp(`\\b${word}\\b`, 'iu') }));
}

function sourceFiles(root, current = root) {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const path = join(current, entry.name);
    if (entry.isDirectory()) return sourceFiles(root, path);
    if (!entry.isFile() || entry.name.endsWith('.test.mjs')) return [];
    return /\.(?:mjs|html|css|json)$/u.test(entry.name) ? [path] : [];
  });
}

export function scanRecorderSources(root) {
  const files = sourceFiles(root).map((path) => relative(root, path));
  const violations = [];
  for (const file of files) {
    const path = join(root, file);
    const source = readFileSync(path, 'utf8');
    for (const forbidden of forbiddenPatterns()) {
      if (forbidden.pattern.test(source)) violations.push({ file: relative(root, path), token: forbidden.word });
    }
  }
  return { files, violations };
}
