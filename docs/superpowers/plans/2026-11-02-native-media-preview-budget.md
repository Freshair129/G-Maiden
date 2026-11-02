---
title: "Native media minimap preview budget"
doc_id: "2026-11-02-native-media-preview-budget"
status: active
version: "0.1.5"
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

The owner first selected a temporary preview CPU reserve and later approved GPU color conversion in the separate GPU plan. No media, mapping, authored PTS/duration, CPU quota or CV cadence changes are authorized by this policy. The 5 FPS cap affects the companion's minimap mirror, not Dota's minimap. A normal clip, Stop, error and unwind release their lease; overlapping owners retain the cap until the final owner exits. Adaptive preview state is held through playback and its first post-playback sample so a sample containing clip work does not permanently overwrite the previous rate.

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
- [x] Run focused contracts, full cargo test/clippy, ESLint, tsc, Vitest, doc graph and native smoke build with bounded suites.
- [x] Inspect fresh runtime identity before replacement; verify startup/ONNX/VRZO. Test all five events with independent desktop/compositor/process-loopback evidence, CPU/RAM and a bounded real-game minimap/CV/worker continuity window, including FPS restoration and Stop.
- [ ] Verify idle pack deactivation/reactivation after the current match and recheck the earlier 60 FPS restoration/first-match CPU failure on the new candidate. Do not infer those scenarios from the passing 15 FPS baseline window.
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
- The current GPU binary passed four critical media tests on an active desktop and again during real Dota. All 1,570 frame indices had independent desktop/compositor coverage and exact process-only source audio; live duration deviation was at most 17.77 ms with no audio-underrun observations. Actual canvas cadence was approximately 5 FPS in all four capped windows, with four 15 -> 5 -> 15 restorations. Endpoint audio included Dota and was not treated as clean source-fidelity evidence. Match Start remains separately owner-waived.
- Steady-state preview workers subsequently restarted on the same lease/epoch/geometry at 505-560 ms without transport progress. Preserve this failure despite passing media and capped-window observations; it does not establish continuous preview acceptance.
- Reversible runtime priority diagnostics retained the shared CPU Job and all watchdog/freshness limits. BelowNormal over 60 s had a restart and a 2.38 s canvas gap; Normal over 90 s retained its worker, with a 236 ms maximum gap and no unhealthy sensor samples. A separate 180 s Normal trial retained its worker through four more passing media events within CPU/RAM limits, but had one sensor-health withdrawal at age 546 ms and later canvas gaps around 0.7 s. These are runtime-policy diagnostics, not acceptance of a newly compiled candidate or proof that priority explains every stall.
- The follow-up uses Normal worker priority inside the same Job and adds local numeric stage/control-heartbeat ages. Stage codes are 0 idle/pacing, 1 capture, 2 crop/packet preparation, 3 pipe write, 4 window/output checks and 5 DXGI initialization. Wall-clock stage age can locate a delay but cannot by itself distinguish a GPU wait from scheduler preemption. Keep the 500 ms transport watchdog, 250 ms image fence and fail-closed health behavior unchanged. New native build, startup and actual live continuity tests remain pending; no full pass or release readiness is claimed.
- The compiled Normal-priority candidate `0a618c53a72301744bdfc659472101eac0f68afe832439b6d1908b5f544d08c2` loaded ONNX/VRZO and passed the four mandatory real-game media checks: all 1,570 compositor frame indices, process-only source audio correlation approximately 1, maximum duration deviation 51.21 ms and isolated timestamp deviation 41.39 ms. It retained its preview worker and restored 15 -> 5 -> 15 four times. However, four sensor-health withdrawals (ages 507-1,017 ms), a 699.6 ms canvas gap, and a separate first-map CPU sample of 10.30% keep continuity/resource acceptance open. Later passing CPU samples do not invalidate that failure.
- A source-level regression reproduced premature crop-hash consumption: an inference rejected after the unchanged 200 ms deadline prevented a fresh identical acquisition from retrying. Candidate selection is now read-only; only a result passing the final deadline/resource gate consumes its hash. Successful identical crops remain deduplicated, failed results do not become semantic evidence, and safety/readiness thresholds are unchanged. Focused retry/pressure tests pass; native rebuild and actual runtime revalidation remain required.
- The transactional candidate `03f29c3f906532854928b6dfe2bf4fff7962c777cc73b0c73323f2a31cedb8c5` passed the native no-bundle build with all 554 tracked runtime inputs frozen. Rust passed 658 tests plus the package/decoder/Party suites; clippy passed. ONNX128/VRZO startup passed at 7.95% CPU and 695,840,768 bytes aggregate peak Working Set. Frontend input content is unchanged from the passing 673-test/ESLint/tsc run.
- The candidate's five real-Dota Event Tests had all 2,022 frame indices confirmed through independent desktop pixels and OS composition records together. Eight pixel samples were absent but covered by composition; no unknown or out-of-order indices remained. All process-only source waveform correlations were approximately 1, with no recorded discontinuities or underrun observations. Maximum duration deviation was 17.56 ms and maximum isolated compositor/audio timestamp deviation 11.73 ms. This is not physical-panel or microphone acoustic qualification.
- In the separate 180-second live window, all five actual canvas caps measured approximately 5 FPS and restored 15 FPS. The same worker remained present; 702 distinct capture IDs reached CV, 172 health samples had no withdrawal (maximum age 170 ms), and 2,327 canvas draws had a maximum 333.5 ms gap. Native CPU peaked at 8.50%, independent rolling intervals of at least one second at 8.63%, and aggregate Working Set at 549,650,432 bytes. These are bounded observations, not a whole-match/FPS-impact guarantee.
- Current-binary process-loopback mute and Stop were silent, replacement commands succeeded, and pack disable remained pinned both during playback and after Stop in the live match. The idle-oriented lifecycle script correctly encountered that live-match fence; retain its failed invocation separately instead of treating it as an application defect. A live-specific repeat passed, restored volume 30 and kept VRZO active. Idle deactivation/reactivation remains pending.
- The earlier 10.30% sample occurred after a 5 -> 60 FPS restoration on the preceding candidate, followed by adaptive reduction to 15 FPS. This temporal association does not establish its sole cause. The new 15 FPS-baseline passing batch does not retest that transition; it remains a release follow-up, alongside idle lifecycle and signed installed/upgrade checks.

## Changelog

| Version | Date | Changes |
| --- | --- | --- |
| 0.1.0 | 2026-11-02 | Record owner-approved temporary preview reserve and validation plan. |
| 0.1.1 | 2026-11-02 | Record actual preview restoration, Stop, sensing and failed media timing evidence. |
| 0.1.2 | 2026-11-02 | Record owner 500ms MVP tolerance and cold-start heartbeat phase correction. |
| 0.1.3 | 2026-11-02 | Record real-game media passes, steady-state preview failure and bounded priority/stage diagnostics. |
| 0.1.4 | 2026-11-02 | Record compiled priority validation limits and transactional crop admission retry fix. |
| 0.1.5 | 2026-11-02 | Record five-event native/runtime passes and preserve idle lifecycle/60 FPS transition follow-ups. |
