export function legalBody(document: string): string {
  return document
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .split(/\r?\n## CHANGELOG\r?\n/, 1)[0]
    .trim()
}
