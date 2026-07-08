# RCA — Dire Blindness, Audio Priority, Make-it-gated

## Symptom

- Gank detection could go blind in Dire-side matches, leaving the player falsely "safe"
- Cosmetic announcer/persona audio could stomp critical `gank` / `revision` warnings
- Release automation could publish signed artifacts without a full verify lane tied to the tagged SHA

## Evidence

- `src-tauri/src/cv/mod.rs` used a single Dire-red ring constant for enemy prefiltering
- `src-tauri/src/cv/prefilter.rs` consumed that single ring colour for all matches
- `src-tauri/src/gsi.rs` did not propagate `player.team_name` into runtime state for CV
- `src-tauri/src/audio.rs` had a single-slot sink with no priority arbitration
- `src-tauri/src/main.rs` / `src-tauri/src/gsi.rs` / `src-tauri/src/capture.rs` could all enqueue speech on the same output path
- `.github/workflows/release.yml` on the loaded worktree had a release-only path with no blocking verify job

## Root Cause

1. CV correctness depended on an implicit assumption that enemy minimap blips were always Dire-red.
2. Audio correctness depended on "last writer wins" behavior instead of explicit speech-class priority.
3. Release safety depended on tag-triggered build/publish without a required verified lineage step.

## Why The Issue Escaped Detection

- Most tests covered local logic, not side-dependent CV color selection across Radiant/Dire.
- The audio system enforced single-slot playback but not priority semantics, so the race only appeared when cosmetic and critical events overlapped.
- Release workflow behavior was treated as infrastructure glue rather than a tested product gate.

## Proposed Prevention

- Derive enemy minimap ring colour from `player.team_name` and keep a testable runtime contract for CV color selection.
- Encode audio priorities (`Critical > Normal > Cosmetic`) in the backend instead of relying on caller order.
- Require `verify` before `release`, and assert the tagged SHA matches the commit being published.
- Keep stub latency harnesses labeled `SKIP` until they are wired to real replay/module paths.
