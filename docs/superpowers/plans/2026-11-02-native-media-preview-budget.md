---
title: "Native media minimap preview budget"
doc_id: "2026-11-02-native-media-preview-budget"
status: active
version: "0.1.2"
updated: "2026-11-02"
owner: "G-Maiden"
---
# Native Media Preview Budget Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep GANN native audio/video deadlines while temporarily limiting the G-Maiden minimap mirror to 5 FPS during admitted playback.

**Architecture:** A counted RAII lease spans actual native playback, including a visual tail after audio ends. The governor applies the cap to the existing preview heartbeat; the same child, DXGI device and CV pipeline continue. Releasing the final lease restores the underlying adaptive cadence. Preparation alone does not acquire a playback lease.

**Tech Stack:** Rust atomics/RAII, existing minimap worker protocol, DXGI, WASAPI/DirectComposition, Tauri.

**Spec:** Owner instruction in this chat on 2026-11-02: allow 5 FPS only during clips, keep DXGI/CV continuous, restore the original FPS afterward, and pass all five events before merge/tag/release. This is explicit approval of the behavior below.

## Design and Approaches

The owner selected a temporary preview CPU reserve over a GPU conversion prototype. No media, mapping, authored PTS/duration, CPU quota or CV cadence changes are authorized by this policy. The 5 FPS cap affects the companion's minimap mirror, not Dota's minimap. A normal clip, Stop, error and unwind release their lease; overlapping owners retain the cap until the final owner exits. Adaptive preview state is held through playback and its first post-playback sample so a sample containing clip work does not permanently overwrite the previous rate.

## Global Constraints

- Every event audio/video pair originates from a verified GANN.
- Whole-app CPU <=10% normalized per 1s sample; RAM <=900,000,000 bytes.
- Preserve DXGI/CV, safety priority, session/revision fences, Store/Party/Friends work and uncommitted changes.
- The owner revised MVP timing tolerance to approximately 400–500 ms in this chat; use a 500 ms maximum duration/timestamp deviation. Preserve complete frame coverage and GANN audio content; submissions alone are not displayed-frame proof. The earlier 17 ms target remains historical evidence, not the current MVP gate.
- The owner subsequently waived Match Start as an MVP blocker. Preserve its failed evidence and report its limitation separately; keep the four other events, continuous minimap behavior, audio content and resource gates mandatory.
- The 500ms allowance applies to announcer clip playback timing only. G-Signal acquisition-to-audible latency and all other MVP resource/privacy constraints are unchanged.
- No simulated GSI, gameplay interruption or external evidence upload.

## Review Focus

- Muted audio and visual tails still hold the lease until playback finishes.
- Stop/error/unwind restore the prior base cadence; preparation failure never leaves a cap.
- Overlap/replacement cannot restore early when another clip still owns playback.
- The worker accepts 5 FPS with a 200,000 us interval while retaining its process and DXGI device.
- Resource accounting and adaptive cadence still enforce their existing safety limits.

## Tasks

- [x] Add a failing protocol test for 5 FPS; implement the bounded command/interval contract.
- [x] Add counted playback leases and overlap/error/unwind tests in `gann_native_budget.rs`; expose state through `gann_native.rs` and acquire only after admission in `gann_native_windows.rs`.
- [x] Apply the cap in `governor.rs`; hold adaptive state in `minimap_admission.rs`; use the protocol interval in `minimap_preview_process.rs` without capture recreation.
- [ ] Run focused contracts, full cargo test/clippy, ESLint, tsc, Vitest, doc graph and native smoke build with bounded suites.
- [ ] Inspect fresh runtime identity before replacement; verify startup/ONNX/VRZO. Test all five events and repeat with independent desktop/endpoint evidence, CPU/RAM and real-game minimap/CV/worker continuity, including FPS restoration and Stop.
- [ ] Only after required acceptance, review/commit/push/PR, merge, exact-main CI, tag/release and signed old-version update acceptance through the established release workflow.

## Validation rulings

- The first real 5 FPS batch restored the requested cadence and retained CV observations, but four media timings failed. Worker transport repeatedly restarted under the existing 500 ms packet watchdog. Keep transport heartbeat independent of the 200 ms frame period; acknowledge bounded payload read progress without refreshing the image's 250 ms freshness fence.
- Transport keepalive is a private parent/child packet, never a displayed frame or affirmative sensor-health observation. Preserve lease/source validation and the existing watchdog limit.
- Read optional compositor statistics at most once per 4 ms rather than every render-loop iteration. Keep native Present cadence, audio clock, source media, PTS, duration and all resource limits unchanged; actual five-event timing remains the acceptance test.
- The next actual five-event batch, binary `066097b2394d36dba1185e4308f895d60f990535e8360d9bed401e57c61fb0a0`, confirmed all 2,022 frame indices using independent desktop pixels and OS composition records together. Match Start and Killing Spree met approximately one-refresh timing, but Monster Kill, First Blood and Double Kill exceeded the authored duration by 218–334 ms and recorded audio underruns. This is a failed batch; complete submissions do not establish correct playback timing.
- Actual canvas observations showed five 15 → 5 → 15 transitions with changing images. CV events continued, but two sensor-health withdrawals at image ages 553/527 ms prevent a claim of uninterrupted healthy sensing. A separate actual Stop test hid native output and restored 15 FPS. Resource-observed transition boundaries have up to one sampling interval of uncertainty.
- Focused Rust contracts passed 39 tests; the minimap frontend suite passed 19. The complete frontend suite passed 673 tests in a quiet repeat; retain the earlier concurrent-build failure. Native startup loaded ONNX and VRZO within the measured CPU/RAM limits. Full checks and timing acceptance remain separate requirements.
- The temporary preview reserve is insufficient for release. Preserve failed evidence locally and discuss the native scheduling architecture before another implementation attempt. No further architecture choice or release readiness is implied by this plan.
- GPU follow-up revealed a worker restart storm during a failed Match Start: early Pressure/transport packets prematurely ended the existing 5s initialization grace. Track completed capture-loop initialization separately. Pressure/transport cannot graduate startup; a real Frame/Waiting/Unavailable loop observation can, without asserting healthy sensing. Keep the 5s fixed startup bound, 500ms running transport watchdog and 250ms image freshness unchanged. Do not reset the startup deadline on every heartbeat.
- A fully validated/read frame that is too old to display still establishes a completed capture loop. Report initialization through a private non-pixel item; never publish its stale pixels or turn it into healthy sensing.

## Changelog

| Version | Date | Changes |
| --- | --- | --- |
| 0.1.0 | 2026-11-02 | Record owner-approved temporary preview reserve and validation plan. |
| 0.1.1 | 2026-11-02 | Record actual preview restoration, Stop, sensing and failed media timing evidence. |
| 0.1.2 | 2026-11-02 | Record owner 500ms MVP tolerance and cold-start heartbeat phase correction. |
