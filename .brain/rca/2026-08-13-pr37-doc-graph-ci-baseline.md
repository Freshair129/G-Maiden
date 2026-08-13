---
title: "RCA: PR #37 doc-graph CI baseline failure"
doc_id: "2026-08-13-pr37-doc-graph-ci-baseline"
version: "0.1.0"
updated: "2026-08-13"
owner: "ATHER"
status: "accepted"
approved_by: "Boss"
approved_date: "2026-08-13"
---

# RCA: PR #37 doc-graph CI baseline failure

## Symptom

PR #37 failed both `ci` and `pr-gate-agent` on the initial branch commit.

## Evidence

The GitHub Actions `ci` log for run `31606068481` reported nine uncovered
strict doc-graph violations and a blocking dangling ledger reference to
`src/src/overlay/LayoutEditor.tsx`. The `pr-gate-agent` unit tests passed 8/8;
its failure was the expected consequence of waiting for the failed `ci` check.
The PR diff itself changed only the overlay timing comment.

## Root Cause

The repository baseline retained stale frontmatter in CR-014 and the GID
pipeline spec, plus a feature-ledger reference to the LayoutEditor that had
already moved to G-AnnStudio. The CI gate evaluates the complete repository
graph, so unrelated baseline metadata debt blocked a documentation-only PR.

## Why the issue escaped detection

The local publish verification inspected the PR diff and application tests but
did not run the repository's full `tools/doc-graph/ci-gate.mjs` entry point
before opening the PR.

## Prevention

Run `node tools/doc-graph/ci-gate.mjs` before opening or updating documentation
PRs, and treat stale generated graph/ledger references as part of the same
acceptance gate as code tests.

## Changelog

| Version | Date | Status | Summary |
| --- | --- | --- | --- |
| 0.1.0 | 2026-08-13 | accepted | Recorded the baseline metadata and ledger causes of PR #37 CI failure. |
