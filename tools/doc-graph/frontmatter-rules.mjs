#!/usr/bin/env node
/**
 * doc-graph frontmatter rulebook validator — pinned v0.4.0.
 *
 * Rulebook source: docs/README.md §"มาตรฐาน metadata หัวเอกสาร (frontmatter)"
 * + its "Status enum" table, as of the `## Changelog` row `| 0.4.0 | ... |`
 * (status enum fully defined + approved_by/approved_date sign-off fields).
 * This file HARDCODES that rulebook rather than reading docs/README.md at
 * runtime, so it is deliberately pinned — if docs/README.md's schema section
 * changes (a new required field, a renamed enum value, etc.) this file will
 * silently drift out of sync with the documented standard. Any PR touching
 * docs/README.md's "มาตรฐาน metadata หัวเอกสาร" section MUST also update the
 * rules below in the same change, bump the "v0.4.0" marker in this comment,
 * and that drift must fail loudly in review (grep both files for "v0.4.0").
 *
 * Rules (frontmatter docs only — see "Out of scope" below):
 *   - Exempt: docs/audits/** and docs/rca/** — no violations, ever (reused
 *     verbatim from G1 metadata.mjs's checkMetadata(), which applies the same
 *     path-based exemption before looking at content).
 *   - Required fields: title, doc_id, status, version, updated, owner.
 *     Missing/empty -> error 'missing-required-field' (one per field).
 *   - status must be one of (lowercase): draft | active | accepted | stable |
 *     superseded | historical.
 *       * value that case-insensitively matches one of the six but is NOT
 *         already lowercase (legacy capitalized status, e.g. "Accepted") ->
 *         WARNING 'legacy-status-case' (not blocking).
 *       * value that matches none of the six even case-insensitively ->
 *         error 'invalid-status'.
 *   - status accepted|stable without BOTH approved_by and approved_date set
 *     -> error 'missing-approval'.
 *   - doc_id must equal the file's slug per G1 slugmap rules (basename minus
 *     '.md', or '<parentDirName>/README' for a README.md) -> error
 *     'doc-id-slug-mismatch'.
 *   - version must equal the Version cell of the last '## Changelog' row ->
 *     REUSED verbatim from G1 metadata.mjs's checkMetadata() (do not
 *     re-implement changelog-table parsing here); its violation reasons
 *     ('missing-changelog', 'version-changelog-mismatch') are passed through
 *     as errors.
 *
 * Out of scope: docs without a closed frontmatter fence at byte 0 (kind
 * 'legacy-header' | 'none', per metadata.mjs's classification) are not
 * frontmatter docs, so none of the field/enum/approval/doc_id rules above
 * apply to them — metadata.mjs / scan.mjs already flag 'no-metadata'
 * informationally for the 'none' case.
 *
 * Pure + dependency-free (only imports G1's metadata.mjs) so it is
 * unit-testable in isolation (node --test).
 */

import { checkMetadata } from './metadata.mjs';

/** Pinned v0.4.0 status enum — lowercase canonical values only. */
export const STATUS_ENUM = Object.freeze(['draft', 'active', 'accepted', 'stable', 'superseded', 'historical']);

/** Pinned v0.4.0: statuses that require approved_by + approved_date. */
const REQUIRES_APPROVAL = new Set(['accepted', 'stable']);

/** Pinned v0.4.0 required frontmatter fields for every non-exempt doc. */
export const REQUIRED_FIELDS = Object.freeze(['title', 'doc_id', 'status', 'version', 'updated', 'owner']);

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function unquote(v) {
  const m = /^(["'])(.*)\1$/.exec(v);
  return m ? m[2] : v;
}

/**
 * Extract the top-level scalar `key: value` fields of a leading YAML
 * frontmatter block (fenced by `---` at byte 0, tolerant of a UTF-8 BOM
 * already stripped by the caller). Only simple single-line `key: value`
 * pairs are captured — that covers every field the v0.4.0 rulebook checks
 * (title/doc_id/status/version/updated/owner/approved_by/approved_date);
 * list fields like `related_docs` are intentionally left as their raw
 * string form since no rule inspects them.
 *
 * Mirrors metadata.mjs's private parseFrontmatter() fence-detection (that
 * helper isn't exported and only extracts `version`), generalized to every
 * field this validator needs.
 *
 * @returns {Record<string,string>|null} null when there is no closed
 *   frontmatter fence at byte 0.
 *
 * Exported for reuse by ledger.mjs (G3): the 'designed' rung of the status
 * ladder reads the primary doc's frontmatter `status` — same parser, no
 * duplicate frontmatter parsing.
 */
export function parseFrontmatterFields(text) {
  const lines = text.split(/\r?\n/);
  if (!/^---[ \t]*$/.test(lines[0])) return null;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^---[ \t]*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end === -1) return null;

  const fields = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    let val = m[2].trim();
    // Drop a trailing '# comment' the same way the sample block in
    // docs/README.md writes them (e.g. `status: "draft"  # enum ด้านล่าง`).
    val = val.replace(/\s+#.*$/, '').trim();
    fields[m[1]] = unquote(val);
  }
  return fields;
}

/**
 * Mirrors slugmap.mjs's private computeSlug() for a single file (not
 * exported by slugmap.mjs; scan.mjs re-implements the same thing locally
 * for the same reason — see its slugFor() doc comment). Slug rules:
 *   - README.md            -> '<parentDirName>/README'
 *   - anything else        -> basename without '.md'
 * @param {string} relPath repo-relative path, e.g. 'docs/features/FEAT-X.md'
 */
function slugForRelPath(relPath) {
  const p = String(relPath ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = p.split('/').filter(Boolean);
  const filename = parts[parts.length - 1] ?? p;
  if (/^README\.md$/i.test(filename)) {
    const parentDir = parts.length >= 2 ? parts[parts.length - 2] : filename.slice(0, -3);
    return `${parentDir}/README`;
  }
  return filename.replace(/\.md$/i, '');
}

/**
 * @typedef {object} ParsedDoc
 * @property {string} text  full raw markdown text of the doc (BOM tolerated)
 */

/**
 * Validate one doc's frontmatter against the pinned v0.4.0 rulebook.
 *
 * @param {ParsedDoc|string} parsedDoc either `{ text }` or the raw markdown
 *   text itself
 * @param {string} relPath repo-relative path (also used for the exemption
 *   check and the doc_id<->slug check)
 * @returns {{ kind: 'frontmatter'|'legacy-header'|'none'|'exempt',
 *   violations: Array<{ reason: string, severity: 'error'|'warning', [k: string]: unknown }> }}
 */
export function validateFrontmatter(parsedDoc, relPath) {
  const rawText = typeof parsedDoc === 'string' ? parsedDoc : (parsedDoc && parsedDoc.text) || '';
  const text = stripBom(String(rawText));

  // Reuse G1: exemption (docs/audits/**, docs/rca/**) + frontmatter/legacy/none
  // classification + the version<->changelog-table check.
  const meta = checkMetadata(text, relPath);
  if (meta.kind !== 'frontmatter') {
    return { kind: meta.kind, violations: [] };
  }

  const violations = [];
  for (const v of meta.violations) {
    const { reason, ...extra } = v;
    violations.push({ reason, severity: 'error', ...extra });
  }

  const fields = parseFrontmatterFields(text) || {};

  for (const field of REQUIRED_FIELDS) {
    const val = fields[field];
    if (val === undefined || val === '') {
      violations.push({ reason: 'missing-required-field', severity: 'error', field });
    }
  }

  const rawStatus = fields.status;
  if (rawStatus) {
    const lower = rawStatus.toLowerCase();
    if (!STATUS_ENUM.includes(lower)) {
      violations.push({ reason: 'invalid-status', severity: 'error', status: rawStatus });
    } else {
      if (rawStatus !== lower) {
        violations.push({ reason: 'legacy-status-case', severity: 'warning', status: rawStatus });
      }
      if (REQUIRES_APPROVAL.has(lower)) {
        const hasApprovedBy = !!fields.approved_by;
        const hasApprovedDate = !!fields.approved_date;
        if (!hasApprovedBy || !hasApprovedDate) {
          violations.push({ reason: 'missing-approval', severity: 'error', status: rawStatus });
        }
      }
    }
  }

  if (fields.doc_id !== undefined && fields.doc_id !== '') {
    const expectedSlug = slugForRelPath(relPath);
    if (fields.doc_id !== expectedSlug) {
      violations.push({
        reason: 'doc-id-slug-mismatch',
        severity: 'error',
        docId: fields.doc_id,
        expectedSlug,
      });
    }
  }

  return { kind: 'frontmatter', violations };
}

export default validateFrontmatter;
