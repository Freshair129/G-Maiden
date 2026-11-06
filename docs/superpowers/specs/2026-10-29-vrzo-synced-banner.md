---
title: "VRZO banner synchronized with announcer"
doc_id: 2026-10-29-vrzo-synced-banner
status: active
version: "0.1.2"
updated: 2026-10-30
owner: G-Maiden
---

# VRZO banner synchronized with announcer

Owner authorized the v7 visual collection to follow the actual VRZO audio clip selected by G-Maiden, play in the overlay together, and open a local test build. This extends the recovered minimap candidate; Store distribution and release are not authorized.

A validated local asset catalog maps the exact selected clip filename and event to one of 21 bundled WebM variants. Other packs retain existing behavior. For VRZO, unknown clips, digest mismatch or unavailable lifecycle fail closed without a legacy banner; the selected audio retains its existing admission behavior. Original signed archives and source pack remain unchanged. Each visual is muted; rodio remains the only audio owner. Full composite video is used, never the effect-only stock. Asset identity and WAV hashes must match the provided catalog; unknown or invalid entries fail closed.

An audio-owned monotonic playback identity orders start, end and interruption. A bounded nonblocking notification channel delivers local lifecycle events off the critical audio thread. The overlay accepts only current playback/session/pack and ignores stale starts or stops. Rejected audio never produces a start; cancellation, pack/session change, expiry and window teardown remove the video; announcer preemption follows the bounded retirement below. Admission denotes source append, not acoustic DAC output; measure UI and acoustic delay separately. Preview is explicitly isolated from live session authority and must exercise selected variants without changing live event state.

Use a narrowly scoped local asset source with no player-data egress. Preserve existing audio admission, CV and 900,000,000-byte aggregate RAM ceiling. Never assert alpha or timing based solely on the export: actual Tauri/WebView2 VP9 alpha, mute/single audio, cleanup and resource impact need native evidence. Unsupported alpha is an explicit failure and asset owner request, not silent opaque shipping.

## Verification

Test 15 events and 21 mappings with WAV integrity, clip identity, rejected/late/duplicate/preempted/cancelled events, session and pack fencing, preview isolation, invalid assets and frontend cleanup. Run project Rust/Clippy, TypeScript/ESLint/Vitest, doc-graph and native local build. Separately report manual WebView2 and live match evidence.


## VRZO filesystem revision 3 transition contract (historical)

Owner-directed local candidate change,2026-10-30: ID manifest revision3 preserves every sound ID and all63 WAV bytes;21silent1280x560 VP9 alpha files now60fps/CRF32 with one lossless transparent final frame. Native width680px/max72vw. Natural completion permits a3.2s silent tail, including approximately0.7s eased fade; expiry still bounds it.

Same-scope announcer replacement starts the new selected event immediately at normal audio rate/gain. Previous visual plays2x with300ms opacity fade; previous voice receives a sample-accurate150ms fade. Bound to one active plus one outgoing visual/sink; a third arrival removes oldest outgoing. Preparation admission is3slots, at most12MiB PCM. Critical/non-announcer interruption, explicit cancellation, pack revision/session invalidation or live announcer disable hard-stops stale announcer sources. Audio owner validates scoped sources on its50ms control loop, outside the output callback. Draft match_start retains the active-session contract. New audio remains uniquely selected/verified; overlap is a bounded old-source retirement authorized by the owner.

Verified native video byte cache is24MiB/6entries, keyed by admitted revision/path/hash/file metadata. One worker coalesces the latest pending warmup, preloads FirstBlood/DoubleKill/firstKill on activation/startup, then predicts next multikill on relevant events. Pack cache rebuild invalidates snapshots and stale worker insertion. It does not preplay audio or run hidden animations, and byte warmup does not establish decoder readiness. Local-only G-BannerVisual receipts record browser frame/drop/first-frame counters; native playback, visual smoothness and900,000,000-byte resource acceptance must be measured separately. No SQL/release or player-data egress.

Current checks/asset/native evidence: ignored target/vrzo-smooth-20261030 and Studio workspace/vrzo-smooth-v3. Historical v8/v2 receipts remain historical; these local receipts do not establish release or native acceptance.


## VRZO filesystem revision 4 ready-frame contract

This runtime contract supersedes the revision3 video/runtime policy. Release and native acceptance remain separate. Revision4 keeps all IDs and63 WAV bytes;21 silent VP8 alpha videos are960x420/60fps, rendered directly from1280x560 Canvas sources. Apparent width remains680px/max72vw. Video ends with a fully transparent frame after its intended3.2s post-audio tail (including0.7s eased fade).

The Overlay owns at most3 video DOM nodes total: active, optional retiring, and remaining paused warm candidates. Native ID-only hints carry resolved pack generation, on startup/activation, predicted events and Control variant selection. Muted first-frame preparation pauses rather than looping hidden media; admitted playback reuses the prepared node. Scope change destroys stale candidates. Same-generation hints preserve useful paused nodes and evict only an unclaimed lower-priority candidate under capacity pressure. Byte-cache warmup alone is not decoder readiness. The ID protocol allows at most3 simultaneous verified reads and waits at most500ms for a permit, then checks the generation again; no arbitrary webview filesystem path is accepted.

Natural completion permits the queued current=0 lifecycle state while its audio generation and scope still match. Video ended clears normally; native/frontend hard caps allow up to4.2s after completion receipt (3.2s intended tail plus1s bounded decoding grace), under the original15s lifetime. Duplicate completion cannot extend the deadline. Cancellation, critical interruption, pack/session invalidation and expiry remain hard fences. Same-scope replacement retains the old visual2x/300ms opacity fade and old voice150ms fade; incoming image/audio start without waiting for old retirement, at normal rate. At most one active and one outgoing source remain.

Local visual receipts distinguish warmed/cold, wait count, first nontransparent presented frame (frame1 rather than transparent frame0), frame/drop deltas excluding preparation, full media duration and ended/cleared/error. Native acceptance must separately verify FirstBlood, DoubleKill, Rampage, quiet drops, complete fade and rapid differing-event insertion. Target ready first present<=100ms and quiet drops<=1% per clip. Source/asset tests do not establish these native gates or acoustic/whole-match/FPS acceptance. Aggregate RAM ceiling900000000bytes, original Nakhom, local-only data and filesystem-only persistence remain unchanged. Evidence: target/vrzo-ready-20261030 and Studio workspace/vrzo-smooth-v4; native results are recorded there without rewriting failed v3 evidence.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-29 | Record authorized clip-identity, lifecycle, local asset and verification contract. |
| 0.1.1 | 2026-10-30 | Record larger60fps ID visuals, predictive bounded cache and owner-authorized visual/audio retirement. |
| 0.1.2 | 2026-10-30 | Record revision4 paused decoder preparation, VP8 media and bounded natural-completion grace. |
