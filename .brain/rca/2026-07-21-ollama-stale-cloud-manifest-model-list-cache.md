---
version: "0.1.0b"
title: "RCA: Ollama Model List Cache Warning from Stale Cloud Manifest"
doc_id: "2026-07-21-ollama-stale-cloud-manifest-model-list-cache"
created_at: "2026-07-21T21:30:00+07:00,ATHER"
last_update: "2026-07-21T21:30:00+07:00,ATHER"
owner: "Boss"
status: "beta"
superseded_by: null
attributes:
  doc_type: "root-cause-analysis"
  domain: "local-model-runtime"
  scope: "Ollama local model-list cache after blob offload"
  language: "th"
---

# RCA: Ollama Model List Cache Warning from Stale Cloud Manifest

## Symptom

`ollama list` exceeded 30 seconds once after the approved blob offload, while the local
`GET /api/tags` endpoint remained responsive.

## Evidence

- `/api/tags` returned HTTP 200 with 48 models after the offload.
- A later repeated `ollama list` run completed five times in 55–67 ms, so the long delay was not
  reproducible as a steady-state failure.
- All 109 symbolic-link blob pointers resolve to existing targets under
  `G:\.ollama_blobs_root`; no missing or wrong target was found.
- `server.log` contains repeated model-list cache hydrate/refresh warnings for
  `gemini-3-flash-preview:cloud`.
- Its manifest references config digest `sha256:045bfd...`, which is absent from the local blob
  store. Cache hydration nevertheless completed in about 301 ms with one failed entry.

## Root cause

A stale local manifest for `gemini-3-flash-preview:cloud` references a missing config blob. This
is a confirmed integrity defect. The available evidence does not prove it was the sole cause of the
single 30-second CLI delay; the delay is most consistent with a transient server/cache-refresh state
during the offload/restart window. Blob symlinks are ruled out as the direct cause.

## Why the issue escaped detection

The offload validation checked pointer targets and API availability but did not validate every
manifest-referenced config digest or repeat the CLI model-list command after cache hydration.

## Proposed prevention

1. Remove the dangling cloud-model manifest through `ollama rm` rather than deleting blobs manually.
2. Add a post-offload audit that checks every manifest digest resolves, then measures both
   `ollama list` and `/api/tags` after service stabilization.
3. Treat cloud-manifest integrity failures separately from blob symlink health in future reports.

## Remediation and verification

Remove only `gemini-3-flash-preview:cloud`, then verify its manifest is absent, `ollama list`
returns promptly, `/api/tags` excludes it, and all existing blob symbolic links still resolve.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-21 | beta | Recorded stale cloud manifest evidence and bounded remediation. | null | ATHER |
