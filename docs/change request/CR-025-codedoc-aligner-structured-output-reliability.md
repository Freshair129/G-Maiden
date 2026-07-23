---
version: "0.2.0b"
title: "CR-025: CodeDoc Aligner Structured Output Reliability"
doc_id: "CR-025-codedoc-aligner-structured-output-reliability"
created_at: "2026-07-21T20:05:00+07:00,ATHER"
last_update: "2026-07-21T20:20:00+07:00,ATHER"
owner: "Boss"
status: "active"
updated: "2026-07-21"
superseded_by: null
attributes:
  doc_type: "change-request"
  domain: "developer-tooling"
  scope: "CodeDoc Aligner Mellum/Ollama structured-output boundary"
  language: "th"
  related_docs:
    - ".agents/skills/codedoc-aligner/SKILL.md"
    - "docs/architecture/spec-orchestra-codedoc-agent.md"
    - ".brain/rca/2026-07-21-codedoc-aligner-structured-output-drift.md"
---

# CR-025 — CodeDoc Aligner Structured Output Reliability

## Decision requested

Approve a C-2/MEDIUM repair to the local CodeDoc Aligner so its result is a validated structured
finding array or an explicit review failure — never an accidental interpretation of Mellum Thinking,
truncation, or prose as aligned.

## Root-cause basis

The confirmed RCA is
`.brain/rca/2026-07-21-codedoc-aligner-structured-output-drift.md`. The warm model is healthy;
the defect is the Ollama response contract and parser boundary.

## Scope

1. Send stage-one Ollama requests with `think: false` and a strict findings-array JSON Schema.
2. Return a bounded response envelope including `response`, thinking-presence, `done_reason`, and
   `eval_count`; do not treat reasoning text as a final finding response.
3. Replace regex extraction with `json.loads` plus schema validation. Only `[]` or a valid list of
   findings may proceed to rollup.
4. Return exit `2` for empty, malformed, schema-invalid, or `done_reason: length` results. Preserve
   the existing semantics: exit `0` means valid no-conflict review; exit `1` means valid conflicts.
5. Add mocked Ollama tests for valid empty array, valid finding, thinking-only/empty final response,
   truncation, prose, and schema-invalid object; add one warmed live smoke check.
6. Retain the existing 1800-second timeout and 12-hour warm keep-alive. This CR does not change
   model location, install another model, add network telemetry, or upload source/document data.

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-01 | A valid `[]` final response with thinking disabled returns exit `0`. |
| AC-02 | A valid schema-compliant finding returns exit `1`. |
| AC-03 | Thinking-only, empty, prose, invalid-schema, and length-truncated responses return exit `2`, never `0`. |
| AC-04 | Unit tests cover every AC-01–AC-03 response case without contacting Ollama. |
| AC-05 | A warmed live smoke request returns a schema-valid response and logs bounded diagnostic metadata only. |
| AC-06 | No raw code or documentation chunk is persisted in diagnostics by default. |

## Risk and boundaries

| Area | Complexity | Risk |
| --- | --- | --- |
| Local review-gate protocol, parser, diagnostics, tests | C-2 | Medium |

This is internal developer tooling. It cannot alter G-Maiden game runtime, landing behaviour, GID,
Supabase, user data, analytics, model installation, or external network destinations.

## Implementation evidence

- Stage-one requests now send `think: false` and the strict findings-array JSON Schema.
- The response envelope rejects `done_reason: length` and an empty final response, including an
  empty final response with Thinking content present. It never parses Thinking text as a finding.
- `test_chunk_and_align.py` has five mocked response tests covering valid empty/finding, Thinking
  only, truncation, prose, and schema-invalid payloads; all passed on 2026-07-21.
- A warmed live smoke review of the cinematic-base script against CR-023 completed all four chunk
  pairs and returned the valid aligned result rather than `INDETERMINATE`.

## Rollback

Revert only the Aligner request/parser/test changes if the local Ollama version lacks `think` or
schema support. The fallback state remains explicit `INDETERMINATE`, never a passing result.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.2.0b | 2026-07-21 | beta | Approved and implemented Thinking-safe structured response handling, fail-closed envelope validation, mocked tests, and a successful warmed live smoke review. | null | ATHER |
| 0.1.0b | 2026-07-21 | candidate | Proposed a schema-enforced, Thinking-safe response contract and deterministic parser repair from confirmed RCA evidence. | null | ATHER |
