import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMetadata } from "./metadata.mjs";

// --- fixtures --------------------------------------------------------------

const FM_OK = `---
title: "Sample"
doc_id: "SAMPLE"
status: "draft"
version: "0.4.0"
---

# Sample

Body text.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | — | first |
| 0.4.0 | 2026-07-19 | latest |
`;

const FM_MISMATCH = `---
title: "Drifted"
version: "0.2.0"
---

# Drifted

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | — | first |
| 0.3.0 | 2026-07-19 | newer than frontmatter |
`;

const FM_NO_CHANGELOG = `---
title: "No changelog"
version: "1.0.0"
---

# No changelog

Just prose, no changelog table at all.
`;

const LEGACY_TH = `# Product plan

> **เวอร์ชัน:** 1.2.0 · อัปเดต 2026-07-19

Body of a first-generation product doc.
`;

const LEGACY_EN = `# Roadmap

> version 2.0.0 — living document

Body text.
`;

const NONE = `# Plain doc

No frontmatter, no blockquote version header. Just markdown.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | — | but no metadata header |
`;

const FM_WITH_BOM = "﻿" + FM_OK;

// --- kind classification ---------------------------------------------------

test("frontmatter kind, version matches last changelog row -> no violations", () => {
  const r = checkMetadata(FM_OK, "docs/features/FEAT-SAMPLE.md");
  assert.equal(r.kind, "frontmatter");
  assert.deepEqual(r.violations, []);
});

test("legacy-header kind (Thai blockquote), no violation", () => {
  const r = checkMetadata(LEGACY_TH, "docs/product/plan.md");
  assert.equal(r.kind, "legacy-header");
  assert.deepEqual(r.violations, []);
});

test("legacy-header kind (English 'version' blockquote), no violation", () => {
  const r = checkMetadata(LEGACY_EN, "docs/product/roadmap.md");
  assert.equal(r.kind, "legacy-header");
  assert.deepEqual(r.violations, []);
});

test("none kind when no frontmatter and no blockquote header", () => {
  const r = checkMetadata(NONE, "docs/guides/plain.md");
  assert.equal(r.kind, "none");
  assert.deepEqual(r.violations, []);
});

test("exempt kind for docs/audits/** regardless of content", () => {
  // Content would be a frontmatter mismatch, but audits are exempt by path.
  const r = checkMetadata(FM_MISMATCH, "docs/audits/2026-07-07-audit.md");
  assert.equal(r.kind, "exempt");
  assert.deepEqual(r.violations, []);
});

test("exempt kind for docs/rca/** and tolerates Windows backslash paths", () => {
  const r = checkMetadata(FM_NO_CHANGELOG, "docs\\rca\\2026-07-10-incident.md");
  assert.equal(r.kind, "exempt");
  assert.deepEqual(r.violations, []);
});

// --- violation reasons -----------------------------------------------------

test("violation: version-changelog-mismatch", () => {
  const r = checkMetadata(FM_MISMATCH, "docs/architecture/adr/ADR-99.md");
  assert.equal(r.kind, "frontmatter");
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].reason, "version-changelog-mismatch");
  assert.equal(r.violations[0].frontmatter, "0.2.0");
  assert.equal(r.violations[0].changelog, "0.3.0");
});

test("violation: missing-changelog when frontmatter has version but no table", () => {
  const r = checkMetadata(FM_NO_CHANGELOG, "docs/reference/thing.md");
  assert.equal(r.kind, "frontmatter");
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].reason, "missing-changelog");
});

// --- robustness ------------------------------------------------------------

test("frontmatter fence is still detected after a UTF-8 BOM", () => {
  const r = checkMetadata(FM_WITH_BOM, "docs/features/FEAT-SAMPLE.md");
  assert.equal(r.kind, "frontmatter");
  assert.deepEqual(r.violations, []);
});

test("CRLF line endings do not break frontmatter/changelog parsing", () => {
  const r = checkMetadata(FM_OK.replace(/\n/g, "\r\n"), "docs/features/FEAT-SAMPLE.md");
  assert.equal(r.kind, "frontmatter");
  assert.deepEqual(r.violations, []);
});
