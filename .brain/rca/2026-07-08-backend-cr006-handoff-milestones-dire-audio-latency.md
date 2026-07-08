# RCA - CR-006 backend handoff completion

## Symptom

- Level-up announcer and persona lines fired on the wrong levels and missed skip-level crossings.
- Dire-side matches could pick the wrong enemy minimap ring color, making CV reads unreliable.
- Cosmetic announcer audio could contend with critical `danger` / `gank` / `revision` speech.
- Release publish safety depended on a tag without a full verify gate.
- The latency harness measured compute slices only, not the in-process path from GSI parse to signal/audio enqueue intent.

## Evidence

- `src-tauri/src/announcer.rs` and `src/src/App.tsx` had milestone logic drifting from the requested contract and only checked the destination level.
- `src-tauri/src/gsi.rs`, `src-tauri/src/runtime.rs`, `src-tauri/src/cv/mod.rs`, and `src-tauri/src/cv/prefilter.rs` now show that team side must flow from GSI into CV ring selection.
- `src-tauri/src/audio.rs`, `src-tauri/src/capture.rs`, and `src-tauri/src/tts.rs` share one speech surface and therefore need explicit backend arbitration.
- `.github/workflows/release.yml` is the release gate of record, so verify steps must block publish there.
- `src-tauri/src/capture.rs` previously labeled its harness as compute-only.

## Root Cause

1. Milestone logic was implemented as "current level is a milestone" instead of "a milestone was crossed."
2. Enemy ring color selection depended on an implicit single-side assumption instead of local player team state.
3. Audio preemption rules were encoded by caller order, not by an explicit priority contract.
4. Release safety and latency verification were treated as adjacent infrastructure concerns instead of product behavior on the critical path.

## Why The Issue Escaped Detection

- Direct-hit level tests did not cover `11 -> 13` or similar skip-level transitions.
- CV tests originally covered only one enemy ring color.
- Single-slot audio prevented overlap, but not the more subtle "wrong event wins" race.
- The release workflow and latency harness both looked plausibly complete until checked against the exact backend handoff requirements.

## Proposed Prevention

- Keep milestone checks expressed as crossed ranges and lock them with direct and skip-level tests.
- Route `player.team_name` into runtime state and test both Dire-red and Radiant-green enemy ring paths.
- Keep backend speech arbitration explicit: `Critical > Normal > Cosmetic`.
- Treat release gating and latency harness coverage as part of the product contract, not optional CI polish.
