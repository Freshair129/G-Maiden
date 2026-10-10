# RCA - G-Log replay fit was not reaching the next match

## Symptom

- `replay_fit` could rank G-Motion parameter candidates, but the result stopped at
  console output.
- `CaptureState` and the legacy WGC capture path always constructed
  `Motion::new()`, so every match used the shipped defaults.
- The G-Series lineage contract therefore described a replay tool without a
  runtime consumer, leaving the G-Log feedback loop open.

## Evidence

- Before this change, `tests/perf/src/bin/replay_fit.rs` printed FULL and APPROX
  candidate rows but had no persistence flag or writer.
- Before this change, `src-tauri/src/capture.rs` and
  `src-tauri/src/capture_wgc.rs` called `Motion::new()` with no tuning-profile
  lookup.
- `docs/features/G-SERIES-DATA-LINEAGE.md` and `docs/features/FEAT-G-LOG.md`
  explicitly recorded that `TuningDelta` injection was not implemented.
- The new `src-tauri/src/tuning.rs` tests cover FULL-only evidence, minimum match
  count, F1 improvement, parameter bounds, temp-file cleanup, backup rollback,
  and default fallback. The replay-fit producer test covers candidate selection.

## Root Cause

The replay analysis and the live G-Motion constructor had no approved data
contract between them. The code implemented candidate scoring, but not the
versioned local artifact, acceptance gates, durable temp-file persistence, or next-match
consumer. This was a missing producer/consumer boundary, not a defect in the
G-Motion probability formula.

## Why The Issue Escaped Detection

- Replay tests verified ranking and metric calculations, but did not assert that a
  result could be persisted and loaded by the next capture initialization.
- The runtime tests exercised default `Motion` construction and the capture loop,
  but had no tuning-profile fixture.
- Documentation described the intended feedback loop at a higher level without a
  concrete path, schema, fallback, or explicit invocation boundary.

## Proposed Prevention

- Keep `TuningDelta` versioned and local-only; accept only FULL evidence with at
  least three matches, a measurable F1 improvement, and bounded parameters.
- Require an explicit `--write-tuning` invocation; load a profile only at match
  initialization/boundary, never tune during a live match, and never allow APPROX
  evidence to change runtime behavior.
- Write through a complete temporary file and retain `.json.bak`; load primary → backup →
  shipped defaults, all fail-closed.
- Keep producer, persistence, and next-match consumer tests in the same Rust gate,
  and maintain the field/source/formula/fallback contract in the G-Series lineage
  SSOT.
