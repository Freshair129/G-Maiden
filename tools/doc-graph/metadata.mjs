#!/usr/bin/env node
/**
 * doc-graph metadata validator — classifies a markdown doc's header metadata and
 * checks the frontmatter/version <-> "## Changelog" invariant.
 *
 * Rules (source: docs/README.md §"มาตรฐาน metadata หัวเอกสาร"):
 *   - docs/audits/** and docs/rca/** are point-in-time history -> kind 'exempt'
 *     regardless of content (checked first, path-based).
 *   - YAML frontmatter fenced by `---` at byte 0 (after an optional UTF-8 BOM):
 *     kind 'frontmatter'. When it carries a `version:` field, that value must equal
 *     the Version cell of the LAST data row of the trailing '## Changelog' table:
 *       * no changelog table            -> violation { reason: 'missing-changelog' }
 *       * version != last changelog cell -> violation { reason: 'version-changelog-mismatch' }
 *   - Legacy blockquote header (a line starting '> ' that contains '**เวอร์ชัน:**'
 *     or 'version') -> kind 'legacy-header', no violation.
 *   - Otherwise -> kind 'none'.
 *
 * Pure + dependency-free so it is unit-testable in isolation (node --test).
 */

const EXEMPT_RE = /(^|\/)docs\/(audits|rca)\//i;

function normalizeRel(relPath) {
  return String(relPath ?? "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function unquote(v) {
  const m = /^(["'])(.*)\1$/.exec(v);
  return m ? m[2] : v;
}

function splitRow(row) {
  let s = row.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isSeparatorRow(row) {
  const cells = splitRow(row);
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

/**
 * @returns {{ version: string|null } | null} null when there is no valid, closed
 *   frontmatter fence at byte 0.
 */
function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (!/^---[ \t]*$/.test(lines[0])) return null; // opening fence must be first line
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^---[ \t]*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end === -1) return null; // unterminated fence -> not frontmatter
  let version = null;
  for (const line of lines.slice(1, end)) {
    const m = /^version\s*:\s*(.*)$/i.exec(line);
    if (m) {
      version = unquote(m[1].trim());
      break;
    }
  }
  return { version };
}

/**
 * Version cell of the LAST data row of the trailing '## Changelog' table.
 * @returns {string|null} null when there is no usable changelog table.
 */
function lastChangelogVersion(text) {
  const lines = text.split(/\r?\n/);
  let hIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Changelog\s*$/i.test(lines[i].trim())) hIdx = i; // keep the last
  }
  if (hIdx === -1) return null;

  let i = hIdx + 1;
  while (i < lines.length && lines[i].trim() === "") i++; // skip blanks before table
  const rows = [];
  while (i < lines.length && lines[i].trim().startsWith("|")) {
    rows.push(lines[i].trim());
    i++;
  }
  // header + separator + >=1 data row are all pipe rows; drop separators, first
  // remaining row is the header, the rest are data rows.
  const dataRows = rows.filter((r) => !isSeparatorRow(r));
  if (dataRows.length < 2) return null; // header only, no data
  const cells = splitRow(dataRows[dataRows.length - 1]);
  return cells.length ? cells[0] : null;
}

function hasLegacyHeader(text) {
  for (const line of text.split(/\r?\n/)) {
    const t = line.replace(/^\s+/, "");
    if (/^>\s/.test(t) && (t.includes("**เวอร์ชัน:**") || /version/i.test(t))) {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} mdText  full markdown text (BOM tolerated)
 * @param {string} relPath repo-relative path (used only for the exempt rule)
 * @returns {{ kind: 'frontmatter'|'legacy-header'|'none'|'exempt', violations: Array<{reason: string}> }}
 */
export function checkMetadata(mdText, relPath) {
  const violations = [];

  if (EXEMPT_RE.test(normalizeRel(relPath))) {
    return { kind: "exempt", violations };
  }

  const text = stripBom(String(mdText ?? ""));

  const fm = parseFrontmatter(text);
  if (fm) {
    if (fm.version != null) {
      const changelog = lastChangelogVersion(text);
      if (changelog == null) {
        violations.push({ reason: "missing-changelog" });
      } else if (changelog !== fm.version) {
        violations.push({
          reason: "version-changelog-mismatch",
          frontmatter: fm.version,
          changelog,
        });
      }
    }
    return { kind: "frontmatter", violations };
  }

  if (hasLegacyHeader(text)) {
    return { kind: "legacy-header", violations };
  }

  return { kind: "none", violations };
}

export default checkMetadata;
