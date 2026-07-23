# RCA: CR-023/024/026/028 frontmatter rejected by CI

## Symptom

GitHub Actions run `29847790422` stopped at `Doc-graph gate` before Clippy, ESLint, Rust tests,
frontend tests, or the Tauri smoke build.

## Evidence

- The gate reported 22 strict errors, 14 checklist-covered and 8 uncovered.
- All 8 uncovered errors were exactly one `invalid-status` and one `missing-required-field` for
  each of CR-023, CR-024, CR-026, and CR-028.
- The four CRs used `status: beta` and `last_update`, while
  `tools/doc-graph/frontmatter-rules.mjs` pins the canonical status enum and requires `updated`.

## Root Cause

The CRs followed the repository agent-instruction metadata vocabulary, but the CI validator uses a
separate pinned v0.4.0 schema. The documents were committed without the compatibility fields and
canonical lifecycle value required by the executable gate.

## Why the issue escaped detection

The landing build, Blender inspection, browser QA, and scoped CodeDoc alignment do not execute the
repo-wide doc-graph gate. The gate first ran after the branch was pushed.

## Fix

Add `updated`, `approved_by`, and `approved_date`; map the owner-approved lifecycle to canonical
`accepted`; and patch-bump each document with a matching changelog row. The requirements and
implementation scope do not change.

## Proposed prevention

Run `node tools/doc-graph/ci-gate.mjs` before committing any new frontmatter document. Longer term,
consolidate the AGENTS metadata schema and the pinned doc-graph enum so authors do not need dual
compatibility fields.
