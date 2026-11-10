---
title: "GANN variant selection without consecutive repeats"
doc_id: "2026-11-03-gann-variant-selection"
status: draft
version: "0.1.1"
updated: "2026-11-03"
owner: "G-Maiden"
---
# GANN Variant Selection Implementation Plan

**Goal:** Choose a verified GANN audio/video pair at random for each non-critical GSI announcer event without repeating the last pair actually started for that event when alternatives exist.

**Architecture:** Keep selection history scoped to the active package revision and event, update it only at admitted native playback, and keep preview and failed preparations outside the history. Recheck the selected candidate at serialized audio admission; handle concurrent stale selections without treating unplayed media as history. The archive registry remains the only media source.

**Tech Stack:** Rust, verified GANN cache, existing playback admission and lifecycle.

**Spec:** Owner-approved design in `D:/gm-gann-only-validation/event-mapping-design-20261102.md` and conversation choice on 2026-11-03.

## Constraints and verification

- Choose audio and its registered video as one immutable pair; unmapped events stay silent. Do not change kill detection or resurrect inactive mappings.
- Single variant may repeat; distinct event keys and changed package revisions have independent history. Preview and rejected preparations do not commit history.
- Concurrent selection and pack/session changes cannot admit a repeat or stale pair. Capture the cancellation fence at GSI dispatch, before the blocking-pool task and before waiting for another request, and carry that original fence through audio admission, so Stop or critical preemption cannot revive old work. Wait only in the existing bounded blocking worker, never in GSI or the audio thread.
- Critical G-Signal/HP cached media uses a separate safety path and is not changed by this slice. Multi-variant rotation for that path requires separately verified prewarmed alternatives and safety review; do not claim it is implemented here.
- First add failing deterministic tests for selection, admission/rejection, preview, revision reset and concurrent stale candidates. Implement minimally and test GANN multi-pair import and runtime routing.
- Verify native behavior without benchmarking; the owner deferred performance work and capped baseline measurement at three runs total.

## Tasks

- [x] Define and test bounded event/revision state and a deterministic candidate selector.
- [ ] Integrate candidate choice and committed playback history across real event admission, preserving preview and critical paths.
- [ ] Validate multi-variant verified GANN pairs, lifecycle/race cases, tests and native behavior. Keep unverified real-match cases explicit.
- [ ] Review, update documentation and run required checks before delivery.

## Changelog

| Version | Date | Changes |
| --- | --- | --- |
| 0.1.0 | 2026-11-03 | Record owner-approved variant behavior and verification boundaries. |
| 0.1.1 | 2026-11-03 | Preserve the original cancellation generation from GSI dispatch through admission. |
