---
title: "RCA — G-Sensory FPS receipt contract gap"
doc_id: "RCA-G-SENSORY-FPS-RECEIPT-2026-10-05"
status: "accepted"
version: "1.0.0"
updated: "2026-10-05"
owner: "ATHER"
---

# RCA — G-Sensory FPS receipt contract gap

## Symptom

The repository contained a PresentMon/ETW FPS harness and arithmetic tests, but the
G-Sensory feature contract still described FPS impact as uninstrumented. A reviewer
could not distinguish a real acceptance receipt from a legacy or hand-written
`fps-baseline.json` by one canonical schema.

## Evidence

- `tests/perf/src/bin/perf_p7.rs` already calculated `fps_drop_pct` and emitted baseline,
  overlay, and skip JSON artifacts.
- The guarded baseline parser validated only a subset of fields, so an artifact with the
  old numeric envelope could reach the comparison path.
- `docs/features/FEAT-G-SENSORY.md` and the G-Series lineage contract did not describe the
  implemented PresentMon source, formula, receipt metadata, and strict `SKIP` boundary.
- The current machine has no `PresentMon.exe` and no running `dota2.exe`; therefore no live
  FPS acceptance result exists.

## Root Cause

The measurement implementation and its documentation evolved separately. Unit tests covered
the formula and a few parser fields, but there was no shared receipt envelope or strict parser
contract tying source, transport, formula, fallback, privacy, and verdict together.

## Why the issue escaped detection

The existing tests were green because they exercised arithmetic and a minimal baseline shape,
not the complete evidence contract. The harness could be described as present while the feature
spec still said “not instrumented”, and no real hardware receipt was committed to expose the
remaining acceptance gap.

## Proposed prevention

- Keep one versioned `gmaiden.p7-fps-receipt` envelope for measured and prerequisite-failure
  artifacts.
- Reject a baseline unless the receipt type, source, PresentMon/ETW metadata, operator
  confirmation, lineage formula, privacy boundary, and positive measurement are all valid.
- Treat missing prerequisites as `SKIP`/exit `77`; never convert them to PASS.
- Keep live FPS compliance `UNVERIFIED` until a real overlay-on receipt returns `verdict=pass`.
- Run the P7 boss-run with the same build, graphics settings, repeatable segment, and attached
  raw CSVs before release closeout.
