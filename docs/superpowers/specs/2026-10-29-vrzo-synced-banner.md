---
title: "VRZO banner synchronized with announcer"
doc_id: 2026-10-29-vrzo-synced-banner
status: active
version: 0.1.0
updated: 2026-10-29
owner: G-Maiden
---

# VRZO banner synchronized with announcer

Owner authorized the v7 visual collection to follow the actual VRZO audio clip selected by G-Maiden, play in the overlay together, and open a local test build. This extends the recovered minimap candidate; Store distribution and release are not authorized.

A validated local asset catalog maps the exact selected clip filename and event to one of 21 bundled WebM variants. Other packs retain existing behavior. For VRZO, unknown clips, digest mismatch or unavailable lifecycle fail closed without a legacy banner; the selected audio retains its existing admission behavior. Original signed archives and source pack remain unchanged. Each visual is muted; rodio remains the only audio owner. Full composite video is used, never the effect-only stock. Asset identity and WAV hashes must match the provided catalog; unknown or invalid entries fail closed.

An audio-owned monotonic playback identity orders start, end and interruption. A bounded nonblocking notification channel delivers local lifecycle events off the critical audio thread. The overlay accepts only current playback/session/pack and ignores stale starts or stops. Rejected audio never produces a start; cancellation, priority preemption, pack/session change, expiry and window teardown remove the video. Admission denotes source append, not acoustic DAC output; measure UI and acoustic delay separately. Preview is explicitly isolated from live session authority and must exercise selected variants without changing live event state.

Use a narrowly scoped local asset source with no player-data egress. Preserve existing audio admission, CV and 900,000,000-byte aggregate RAM ceiling. Never assert alpha or timing based solely on the export: actual Tauri/WebView2 VP9 alpha, mute/single audio, cleanup and resource impact need native evidence. Unsupported alpha is an explicit failure and asset owner request, not silent opaque shipping.

## Verification

Test 15 events and 21 mappings with WAV integrity, clip identity, rejected/late/duplicate/preempted/cancelled events, session and pack fencing, preview isolation, invalid assets and frontend cleanup. Run project Rust/Clippy, TypeScript/ESLint/Vitest, doc-graph and native local build. Separately report manual WebView2 and live match evidence.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-29 | Record authorized clip-identity, lifecycle, local asset and verification contract. |
