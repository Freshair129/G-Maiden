---
title: "CR-040 Architecture Decision Addendum — Capture Consent and QA Gates"
doc_id: "CR040-ARCH-DECISION-20261102"
status: accepted
version: "0.1.0"
updated: "2026-11-02"
owner: "G-Maiden"
---

# CR-040 architecture decision addendum

**Authority:** Owner direction in [issue #109](https://github.com/Freshair129/G-Maiden/issues/109), with the CR040-ARCH gate findings. This addendum governs capture settings, per-session activation, output receipts, and the order of source and runtime gates. It does not claim implementation or Windows/OBS/Dota acceptance.

## Settings and safe defaults

Settings describe what the user wants; they do not arm capture.

- Replay highlights and full-match recording are separate selectable Settings modes. Both default off; the media session is **unarmed** on launch and after session changes.
- Event categories are selected only from the fixed, typed local GSI highlight allowlist in #111/#116. Default selection is empty. Arbitrary event text and raw GameTick fields are never accepted. Every event must pass the producer's local-player verification, active session fence, freshness, dedupe, and monotonic receipt-time checks. A category without verified local attribution remains unavailable.
- The user can select an existing OBS scene/source scope. Settings display the actual OBS scene and source inventory, including the selected audio tracks. The app does not create, enable, disable, rename, reorder, switch, or otherwise mutate OBS scenes or sources. A selected scene must already be the active OBS program scene before arming.
- Only a verifiable Dota game-capture/window-capture scope is eligible. Display/desktop capture, webcam/video-capture sources, and unknown or unverifiable source types are rejected. Microphone capture is off by default; it requires a separate explicit selection and fresh session consent. No implicit desktop, webcam, or microphone capture is allowed.
- The session-end post-roll policy is selectable: `wait`, `partial`, or `discard`. `discard` is the safe default. `wait` holds only the current session's pending window until its post-roll target or a bounded failure; it never admits events from the next session. `partial` saves only footage available at session end and must be labeled partial with its known bounds. `discard` drops the pending window without saving.

## Per-session activation and invalidation

Capture requires a fresh, explicit user action for each media session after OBS is authenticated and its inventory is available. The consent screen shows the active program scene, selected video/source scope, audio tracks and microphone state, selected event categories, enabled capture modes, and post-roll policy. Stored Settings, OBS already running, GSI activity, sign-in, or a previous session's consent do not arm capture.

Consent is bound to the current local match/session epoch, OBS connection epoch, scene identity, source/audio inventory fingerprint, selected categories, capture modes, and policy. A scene/source/audio-track change, OBS reconnect/restart, or change to any consented setting is a hard invalidation: immediately disarm and stop app-started capture, mark unfinalized save intents explicitly unsaved, clear pending post-roll/save state, and require fresh consent. A new session starting is also a hard invalidation with the same stop/clear/unsaved behavior; never carry pending work or consent into that epoch. Never switch to a replacement scene/source silently. If inventory is incomplete or cannot establish the allowed scope, stay unavailable.

Normal match end is a separate lifecycle event, not by itself a hard invalidation: stop admitting events from the ended epoch, then apply its selected post-roll policy only to already-pending windows from that epoch. A bounded `wait` may finish only that old epoch's post-roll; `partial` may save only available footage marked partial; `discard` drops the pending window. Do not admit events from a next epoch. Once the policy resolves, close and disarm that media session; a later session requires fresh consent. If another hard invalidation occurs or a new session starts before finalization, stop outputs, discard the unfinalized intent as explicitly unsaved, and require fresh consent.

GSI remains the event source. Stamp accepted event observations at local receipt with a monotonic clock and a local event sequence; do not use Dota `clock_time`, wall-clock time, raw match IDs, or SteamIDs as media identity. Settings choose a subset of the allowlist; they do not change event verification rules.

## Replay and full-match output contracts

Replay highlights use OBS WebSocket v5 on literal loopback with required challenge-response authentication. `SaveReplayBuffer` saves the current rolling buffer, not an exact event interval. Its request acknowledgement means only that OBS accepted the command. A clip is saved only after the correlated `ReplayBufferSaved` event supplies `savedReplayPath` and the local path/file check succeeds. Because that event has no request ID, permit one outstanding replay save at a time; timeout or disconnect after acknowledgement is ambiguous and must not trigger a blind retry. Desired trim bounds remain metadata until a monotonic-to-media-time mapping is verified; do not claim exact pre/post trim from the event path alone.

Full-match recording is an independent mode with its own explicit start, stop, status, and completion contract. Completion requires an explicit `StopRecord` lifecycle and validated finalized output path; a start acknowledgement is not completion. The current replay-only #110 adapter contract does **not** implement full-match recording, `StartRecord`, `StopRecord`, or its completion receipt. Do not call it implemented, active, or saved. A separate reviewed adapter scope and fixtures are required before integration can claim this mode. Full-match recording remains off by default.

## Degraded and session-end behavior

OBS offline, authentication disabled/failed, incompatible protocol, missing replay buffer, missing/ineligible source inventory, scene/source change, stale session, queue overflow, disk-full, disconnected save, missing receipt/path, or file validation failure produces an explicit unavailable/error/partial result and no false saved state. GSI, DXGI CV, and G-Signal continue independently. No capture, event metadata, media, or paths leave the device through cloud, relay, analytics, or G-Log.

At normal match end, freeze admission for the ended epoch and apply `wait` (bounded old-epoch post-roll only), `partial` (available footage, explicitly labeled partial), or `discard` to its existing pending windows. No new-epoch events may enter those windows. When that policy resolves, close/disarm the old media session; a later session needs fresh consent. A source/settings/OBS connection invalidation or a new session starting instead hard-stops app-started outputs, clears unfinalized save intents as explicitly unsaved, and requires fresh consent; no receipt may retroactively finalize a cleared intent. If the media clock cannot establish the requested window, report partial/unknown or discard according to policy; never fabricate a precise clip interval. These are target lifecycle semantics, not evidence that replay or full-match recording is implemented.

## Ownership and gates

- A/#110 remains the replay-only OBS WebSocket adapter in new `src-tauri/src/obs_media/` files; its contract does not cover full-match recording. The full-match option may appear as a selectable setting, but runtime must show it unavailable until a separate adapter contract and implementation exist.
- B/#116 owns only the source-only planner files. C/#112 remains a read-only OBS Virtual Camera compatibility/performance spike; DXGI stays the MVP CV provider. D/#113 owns new components under `src/src/highlights/components/` and must expose the independent settings, consent, source inventory, and receipt states without editing shared UI files.
- Independent source/fixture review runs only after A/B/C/D. A wiring/docs/CI integration candidate follows that review and remains unmerged. Independent Windows OBS/Dota/NFR runtime QA runs against that exact candidate afterward. A separate owner-controlled readiness/merge gate follows both QA stages.
- The owner gate remains blocked if full-match recording is still `NOT_IMPLEMENTED`, or if source/privacy/performance/runtime evidence is absent. It does not authorize release or deployment. Post-launch native media engine #115 remains deferred and outside this DAG.

## References

- [CR-040 parent scope and acceptance](https://github.com/Freshair129/G-Maiden/issues/109)
- [OBS WebSocket v5 protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.json) — replay-save event/path and record stop/output-path contracts
- [OBS WebSocket v5 authentication handshake](https://github.com/obsproject/obs-websocket/blob/master/docs/docs/partials/introduction.md)

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-02 | Record owner-directed capture settings, per-session consent, replay/full-record boundaries, post-roll policy, and sequenced QA gates. |
