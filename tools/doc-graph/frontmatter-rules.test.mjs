import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateFrontmatter } from './frontmatter-rules.mjs';

// --- fixtures ----------------------------------------------------------------
// REL/BASE_OK satisfy every v0.4.0 rule at once, so each rule's test only
// mutates the one thing it's checking.

const REL = 'docs/features/FEAT-SAMPLE.md'; // slug (per G1 slugmap rules) = 'FEAT-SAMPLE'

const BASE_OK = `---
title: "Sample Feature"
doc_id: "FEAT-SAMPLE"
status: "draft"
version: "0.1.0"
updated: "2026-07-19"
owner: "Boss"
---

# Sample Feature

Body text.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-19 | first |
`;

function withField(text, field, value) {
  // Replace an existing "field: ..." line, or drop the field entirely if
  // value is null.
  const re = new RegExp(`^${field}:.*$`, 'm');
  if (value === null) {
    return text.replace(new RegExp(`^${field}:.*\\n`, 'm'), '');
  }
  return text.replace(re, `${field}: ${value}`);
}

// --- rule: required fields ----------------------------------------------------

test('required fields: passing when all six are present', () => {
  const r = validateFrontmatter(BASE_OK, REL);
  assert.equal(r.kind, 'frontmatter');
  assert.deepEqual(r.violations, []);
});

test('required fields: missing "owner" -> error missing-required-field', () => {
  const text = withField(BASE_OK, 'owner', null);
  const r = validateFrontmatter(text, REL);
  assert.equal(r.kind, 'frontmatter');
  assert.equal(r.violations.length, 1);
  assert.deepEqual(r.violations[0], { reason: 'missing-required-field', severity: 'error', field: 'owner' });
});

// --- rule: status enum, lowercase-only (legacy capitalized = warning) --------

test('status enum: lowercase "draft" -> no legacy-status-case warning', () => {
  const r = validateFrontmatter(BASE_OK, REL);
  assert.equal(r.violations.some((v) => v.reason === 'legacy-status-case'), false);
});

test('status enum: capitalized legacy "Draft" -> warning legacy-status-case', () => {
  const text = withField(BASE_OK, 'status', '"Draft"');
  const r = validateFrontmatter(text, REL);
  assert.equal(r.violations.length, 1);
  assert.deepEqual(r.violations[0], { reason: 'legacy-status-case', severity: 'warning', status: 'Draft' });
});

test('status enum: value outside the enum entirely -> error invalid-status', () => {
  const text = withField(BASE_OK, 'status', '"weird"');
  const r = validateFrontmatter(text, REL);
  assert.equal(r.violations.length, 1);
  assert.deepEqual(r.violations[0], { reason: 'invalid-status', severity: 'error', status: 'weird' });
});

// --- rule: accepted|stable requires approved_by + approved_date -------------

const ADR_REL = 'docs/architecture/ADR-99.md'; // slug = 'ADR-99'
const ADR_BASE = `---
title: "Some decision"
doc_id: "ADR-99"
status: "accepted"
version: "1.0.0"
updated: "2026-07-19"
owner: "Boss"
---

# Some decision

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-07-19 | accepted |
`;

test('missing-approval: "accepted" without approved_by/approved_date -> error', () => {
  const r = validateFrontmatter(ADR_BASE, ADR_REL);
  assert.equal(r.violations.length, 1);
  assert.deepEqual(r.violations[0], { reason: 'missing-approval', severity: 'error', status: 'accepted' });
});

test('missing-approval: "accepted" WITH approved_by + approved_date -> passes', () => {
  const text = ADR_BASE.replace(
    'owner: "Boss"\n---',
    'owner: "Boss"\napproved_by: "Boss"\napproved_date: "2026-07-19"\n---'
  );
  const r = validateFrontmatter(text, ADR_REL);
  assert.deepEqual(r.violations, []);
});

// --- rule: doc_id must equal the file's slug ---------------------------------

test('doc-id-slug-mismatch: doc_id matching the computed slug -> passes', () => {
  const r = validateFrontmatter(BASE_OK, REL);
  assert.equal(r.violations.some((v) => v.reason === 'doc-id-slug-mismatch'), false);
});

test('doc-id-slug-mismatch: doc_id NOT matching the computed slug -> error', () => {
  const text = withField(BASE_OK, 'doc_id', '"WRONG-SLUG"');
  const r = validateFrontmatter(text, REL);
  assert.equal(r.violations.length, 1);
  assert.deepEqual(r.violations[0], {
    reason: 'doc-id-slug-mismatch',
    severity: 'error',
    docId: 'WRONG-SLUG',
    expectedSlug: 'FEAT-SAMPLE',
  });
});

test('doc-id-slug-mismatch: README.md slug rule is "<parentDir>/README"', () => {
  const readmeRel = 'docs/product/README.md';
  const readmeOk = `---
title: "Product docs index"
doc_id: "product/README"
status: "active"
version: "0.1.0"
updated: "2026-07-19"
owner: "Boss"
---

# Product docs

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-19 | first |
`;
  const passing = validateFrontmatter(readmeOk, readmeRel);
  assert.deepEqual(passing.violations, []);

  const failing = validateFrontmatter(readmeOk.replace('doc_id: "product/README"', 'doc_id: "product"'), readmeRel);
  assert.equal(failing.violations.length, 1);
  assert.equal(failing.violations[0].reason, 'doc-id-slug-mismatch');
  assert.equal(failing.violations[0].expectedSlug, 'product/README');
});

// --- rule: version must equal the last Changelog row (reused from metadata.mjs) --

test('version-changelog-mismatch: version equals last Changelog row -> passes', () => {
  const r = validateFrontmatter(BASE_OK, REL);
  assert.equal(r.violations.some((v) => v.reason === 'version-changelog-mismatch'), false);
});

test('version-changelog-mismatch: version drifted from the last Changelog row -> error', () => {
  const text = `---
title: "Drifted"
doc_id: "FEAT-SAMPLE"
status: "draft"
version: "0.2.0"
updated: "2026-07-19"
owner: "Boss"
---

# Drifted

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | — | first |
| 0.3.0 | 2026-07-19 | newer than frontmatter |
`;
  const r = validateFrontmatter(text, REL);
  assert.equal(r.violations.length, 1);
  assert.deepEqual(r.violations[0], {
    reason: 'version-changelog-mismatch',
    severity: 'error',
    frontmatter: '0.2.0',
    changelog: '0.3.0',
  });
});

test('missing-changelog: version set but no "## Changelog" table at all -> error', () => {
  const text = `---
title: "No changelog"
doc_id: "FEAT-SAMPLE"
status: "draft"
version: "1.0.0"
updated: "2026-07-19"
owner: "Boss"
---

# No changelog

Just prose, no changelog table.
`;
  const r = validateFrontmatter(text, REL);
  assert.equal(r.violations.length, 1);
  assert.deepEqual(r.violations[0], { reason: 'missing-changelog', severity: 'error' });
});

// --- rule: docs/audits/** and docs/rca/** are exempt from everything --------

test('exempt: docs/audits/** short-circuits every rule, even a badly broken doc', () => {
  const broken = `---
version: "9.9.9"
status: "ACCEPTED"
---
# Broken on purpose — missing every required field, bad case, no approval.
`;
  const r = validateFrontmatter(broken, 'docs/audits/2026-07-07-audit.md');
  assert.equal(r.kind, 'exempt');
  assert.deepEqual(r.violations, []);
});

test('exempt: docs/rca/** short-circuits every rule, tolerates Windows backslash paths', () => {
  const broken = `---
version: "9.9.9"
status: "weird"
---
# Broken on purpose.
`;
  const r = validateFrontmatter(broken, 'docs\\rca\\2026-07-10-incident.md');
  assert.equal(r.kind, 'exempt');
  assert.deepEqual(r.violations, []);
});

// --- out of scope: docs without a closed frontmatter fence -------------------

test('kind passthrough: legacy blockquote header -> no frontmatter rules applied', () => {
  const legacy = `# Product plan

> **เวอร์ชัน:** 1.2.0 · อัปเดต 2026-07-19

Body of a first-generation product doc.
`;
  const r = validateFrontmatter(legacy, 'docs/product/plan.md');
  assert.equal(r.kind, 'legacy-header');
  assert.deepEqual(r.violations, []);
});

test('kind passthrough: no frontmatter and no legacy header -> kind none, no violations', () => {
  const none = `# Plain doc

No frontmatter, no blockquote version header.
`;
  const r = validateFrontmatter(none, 'docs/guides/plain.md');
  assert.equal(r.kind, 'none');
  assert.deepEqual(r.violations, []);
});

// --- robustness: Windows realities -------------------------------------------

test('UTF-8 BOM before the opening fence does not break parsing', () => {
  const withBom = '﻿' + BASE_OK;
  const r = validateFrontmatter(withBom, REL);
  assert.equal(r.kind, 'frontmatter');
  assert.deepEqual(r.violations, []);
});

test('CRLF line endings do not break frontmatter or changelog parsing', () => {
  const crlf = BASE_OK.replace(/\n/g, '\r\n');
  const r = validateFrontmatter(crlf, REL);
  assert.equal(r.kind, 'frontmatter');
  assert.deepEqual(r.violations, []);
});

test('parsedDoc accepts either a raw string or a { text } object identically', () => {
  const asString = validateFrontmatter(BASE_OK, REL);
  const asObject = validateFrontmatter({ text: BASE_OK }, REL);
  assert.deepEqual(asString, asObject);
});
