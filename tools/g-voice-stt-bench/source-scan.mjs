import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function blockedPatterns() {
  const words = [
    ['h', 'ttp'].join(''),
    ['h', 'ttps'].join(''),
    ['n', 'et'].join(''),
    ['d', 'gram'].join(''),
    ['u', 'ndici'].join(''),
    ['re', 'quests'].join(''),
    ['url', 'lib'].join(''),
    ['so', 'cket'].join(''),
    ['huggingface', '_hub'].join(''),
    ['snapshot', '_download'].join(''),
    ['hf_hub', '_download'].join(''),
  ];
  const call = ['fe', 'tch'].join('');
  return [
    ...words.map((word) => ({ word, pattern: new RegExp(`\\b${word}\\b`, 'iu') })),
    { word: `${call}(`, pattern: new RegExp(`\\b${call}\\s*\\(`, 'iu') },
  ];
}

function sourceFiles(root, current = root) {
  const entries = readdirSync(current, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(current, entry.name);
    if (entry.isDirectory()) return sourceFiles(root, path);
    if (!entry.isFile() || entry.name.endsWith('.test.mjs')) return [];
    return entry.name.endsWith('.mjs') || entry.name.endsWith('.ps1') || entry.name.endsWith('.py') ? [path] : [];
  });
}

export function scanHarnessSources(root) {
  const violations = [];
  for (const path of sourceFiles(root)) {
    const source = readFileSync(path, 'utf8');
    for (const blocked of blockedPatterns()) {
      if (blocked.pattern.test(source)) {
        violations.push({ file: relative(root, path), token: blocked.word });
      }
    }
  }
  return { violations };
}
