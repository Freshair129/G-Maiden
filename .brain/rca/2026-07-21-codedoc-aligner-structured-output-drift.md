---
title: "RCA: CodeDoc Aligner structured-output drift with Mellum Thinking responses"
date: "2026-07-21"
status: "confirmed"
scope: "codedoc-aligner local review gate"
---

# RCA — CodeDoc Aligner structured-output drift

## Symptom

`chunk_and_align.py` frequently reports `INDETERMINATE` after Mellum is warmed, because one or more
chunk pairs cannot be parsed as the expected JSON findings array.

## Evidence

- `--warm-only` completes in approximately 0.1–0.4 seconds and the Ollama process reports the
  Mellum model resident in VRAM; HDD cold-load is not the active failure mode.
- `chunk_and_align.py` sends plain `/api/generate` requests and reads only `res_data['response']`.
- Reproduction against the installed Thinking model showed `response: ""` while the generated
  content was returned in `thinking`, or a request stopped at length before a final response.
- A live smoke request with `think: false` and an array JSON Schema returned a schema-valid `[]`
  with no thinking payload.
- `docs/architecture/spec-orchestra-codedoc-agent.md` FR-4 requires structured JSON output, while
  the current request/parser boundary does not enforce it.

## Root cause

Mellum is a Thinking model and can separate reasoning from final output. The Aligner neither disables
thinking nor requests a JSON Schema; it then discards the `thinking` field and parses only the empty
or prose `response` with a permissive regex. This makes a valid analysis indistinguishable from an
empty/truncated/unstructured response.

## Why it escaped detection

The warm-up change verified model availability and latency but did not test the full Ollama response
envelope, `done_reason`, or schema-valid output. Existing checks lack mocked responses for Thinking,
truncation, and malformed JSON.

## Prevention

Implement CR-025 before relying on the Aligner as an automated pass gate. Until then, `INDETERMINATE`
means review not completed; it must not be reported as aligned.
