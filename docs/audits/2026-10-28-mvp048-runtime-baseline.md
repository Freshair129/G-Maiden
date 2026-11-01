---
title: "G-Maiden — Post-audit native resource baseline"
doc_id: "MVP048-RUNTIME-BASELINE-20261028"
status: active
version: "0.4.0"
updated: "2026-10-29"
owner: "G-Maiden"
related_docs: ["mvp-decisions", "mvp-backlog", "RESULTS-AUDIT-COMPLETION-20261028"]
---

# Post-audit runtime baseline

The owner requested continuing after PR #92 merged. The next bounded verification is an owned-process resource baseline while the existing Dota and G-Maiden processes are running. This does not block unrelated MVP work on further RAM reduction and does not close MVP-048 by itself.

## Original planned probe — NOT_RUN

1. Verify the running candidate's exact PID, process creation identity, executable SHA-256, local pack state and source relationship to integrated `main` `25b82b6e4933688f63b7e6f668b080762a34229a`. Preserve the running application and all pack/settings choices. Verify sampler source/binary against their recorded hashes.
2. Reuse the previously reviewed native metadata sampler for 601 readings at one-second cadence, after the existing two-minute startup warm-up. No build, package installation, local inference/review, capture, UI automation, game input, process trimming, GC, model unloading or synthetic GSI is performed during measurement. Only the exact app Job and verified descendants are read; Dota process memory is excluded from probe scope.
3. Preserve every unavailable/membership-transition sample. Derive current 900,000,000-byte full Working Set and 10%-normalized-CPU comparisons from the newly recorded raw readings, never from a prior run. The legacy sampler filenames and 400 MB summary labels are historical implementation identifiers; its early-stop option is disabled. Its old-budget verdict is not used or relabeled as current acceptance.
4. Report actual resource completeness, duration, process coverage, peaks and unavailable/over-budget counts. No raw match IDs, hero roster, player logs, gameplay-event counters, screenshots, voice files or detailed user-process records enter this document or the repository; detailed receipts remain local.

Evidence directory: `D:/G-Maiden/src-tauri/target/mvp048-runtime-baseline-20261028`.

## Safer diagnostic after policy rejection

Automatic approval review rejected launching the existing native sampler with the reason `blocked by policy`; no detailed reason was supplied. The rejected command did not execute, no preflight/sampler-owner receipt was created and the native probe did not start. Do not retry that native action through a wrapper or another launch path.

Instead, use ordinary Windows process metadata for a short observed-descendant diagnostic and locally aggregate current-build event logs. No native handle inventory/duplication, process-memory content access, job-handle probing or UI interaction is used. Ordinary descendant metadata cannot prove exact Job membership or account for every short-lived child; therefore its CPU is diagnostic and its memory aggregate is not a whole-app acceptance result. Preserve missing/changed identities explicitly. Keep log contents, event counters, identifiers and detailed process receipts local; publish methodology, resource results and coverage limitations only.

This fallback does not close F07/MVP-048. It provides current runtime evidence while keeping the blocked native gate explicitly NOT_RUN and leaving the complete matrix open.

## Acceptance interpretation

Current contract remains aggregate full Working Set ≤900,000,000 decimal bytes and every one-second CPU sample ≤10%, normalized by observed logical CPU capacity. No child or used external provider/model may be silently excluded.

The original native proposal would have queried the app Job and descendants, but it did not run. The executed standard-metadata fallback observes descendants only; exact Job membership and short-lived children remain unverified. Neither approach exercises external providers, STT, physical audio or a prescribed gameplay sequence in this diagnostic. Dota running alone does not establish fresh live GSI, foreground gameplay, active CV or a Voice+Signal phase. These coverage fields remain unknown/not exercised unless independently established. The limited observations are not whole-app/all-modules MVP acceptance.

The canonical matrix still requires two-minute warm-up, three ten-minute runs for each idle/live-CV/Voice+Signal phase, the required OS/mode cells, used-provider accounting, acoustic latency and paired FPS trials. Unavailable/incomplete data never count as passing. No source/runtime behavior or acceptance threshold is changed by this verification.

## Results

Standard metadata collected 61 observations over 59.945 seconds from 8 observed descendants on 12 logical CPUs. Observed aggregate full Working Set was 290.071–291.693 decimal MB with no unavailable reading; diagnostic CPU peaked at 1.173% across 60 intervals. Endpoint descendant sets matched. Exact Job membership, short-lived children, used external providers and prescribed phases remain unverified: **whole-app acceptance INDETERMINATE**, native probe **NOT_RUN**. These are new limited observations, not a reclassification of an earlier resource run.

The local completed-session diagnostic compared ANN requests, native admissions, rejections, unmapped events and banner emissions without exposing raw records. Concrete event counts and source-file identities remain in the local evidence directory. Emission/admission counters do not prove rendered pixels or audible completion; the rejection reason is not present in those existing records. Completed-session records do not establish a currently fresh feed.

The active selection at observation was VRZO, whose manifest has no death/respawn/HP/mana/level-up mapping; corresponding unmapped silence is expected under selected-pack-only playback. Selection was not changed. All 15 original Nakhom WAV files still matched their preserved source hashes. Raw logs, detailed process metadata and source-file identities remain local.

Source inspection also identified a distinct MVP-011 UI issue: the standby readiness rundown uses enabled settings to print “ready” for Signal/ANN despite absent health evidence. Follow-up is scoped in [[2026-10-28-mvp011-readiness-semantics-plan]]; this does not change the resource verdict.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-28 | Plan owner-authorized passive post-audit resource baseline while preserving the 900 MB contract and original voice assets. |
| 0.2.0 | 2026-10-28 | Record native-launch policy rejection and use standard metadata/anonymous local event diagnostics with explicit coverage limitations. |
| 0.3.0 | 2026-10-28 | Record limited process and anonymous completed-session diagnostics, preserved original assets and the separate readiness-semantic follow-up. |
| 0.4.0 | 2026-10-29 | Clarify before PR delivery that Job membership was proposed but never observed, and resolve the readiness follow-up link; the executed fallback collected ordinary descendant metadata only. |
