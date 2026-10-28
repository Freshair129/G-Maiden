---
title: "G-Maiden — Remaining audit completion plan"
doc_id: "PLAN-AUDIT-COMPLETION-20261028"
status: accepted
version: "0.1.0"
updated: "2026-10-28"
owner: "G-Maiden"
related_docs: ["AUDIT-FEATURE-LOGIC-20261027", "mvp-decisions", "RESULTS-MVP-EVENT-CORRECTIONS-20261028", "AUDIT-P1-REMEDIATION-RESULTS-20261027"]
---

# Remaining audit completion

Owner explicitly requested completing the remaining audit and passing tests, preserving900,000,000-byte aggregate full Working Set and the original Nakhom ann-pack. Reconcile all25findings against current code; the remaining13P2 IDs are F02/F08/F11/F12/F13/F14/F15/F16/F17/F18/F19/F23/F24. Earlier source fixes and runtime-quality gates remain distinct.

## Tasks and ownership

1. **Account/identity isolation (A), F16/F17/F18:** auth/profile/wallet/StorePage/companion TypeScript only. Single callback consumer; invalidate old user/Steam requests before cleanup and on switch/unlink; clear derived data immediately. Mounted deferred-response/fanout tests. No schema, RLS, OAuth-provider, MFA/recovery, entitlement, purchase or production changes. This repairs existing request isolation under the existing Google identity contract.
2. **Advice/death isolation (B), F11/F12/F14:** master/runtime, lib.rs buyback functions, Overlay buyback handlers and types. Verify model/backend generation already covered byP1; add tests rather than duplicate changes. Bound concurrent inference admission with no lock held across provider I/O. Fence buyback results by death episode/request identity at producer and renderer; respawn/next death invalidate. No actual provider requests. B owns lib.rs/Overlay.tsx/types.ts until handoff; parent applies audio/preview integration afterward.
3. **Data eligibility (C), F08/F15/F24:** memory.rs/log metadata and items.rs/damage.rs; read-only reconcile feeder's existing health/ACK fixes. Forget cutoff applies to trusted session time, unknown names remain excluded; fresh session-style logs may resume while old logs stay forgotten. Combat burst includes eligible active inventory only; NW/ownership retains backpack/stash. Test fixtures, no user-log deletion.
4. **Audio provenance/admission (parent), F02/F13/F19/F23:** selected-pack-only ANN resolution with actual clip provenance; no unauthorized Store fallback or AI ANN substitution. Generated/requested/queued audio must not be reported as played. Publish voice/banner/ledger only after native playback admission and preserve session/config cancellation fences. Coordinate rodio and SAPI priority at actual audio admission without holding configuration locks across I/O. Offline pack preview uses its own expiry/identity path, never fake game state. Parent owns audio/tts/utterance/voice_api/gsi; integrates lib/Overlay after B releases them.
5. **Integration:** fresh scoped review, regressions for review findings, full Cargo/Clippy, ESLint/TypeScript/Vitest, feeder tests, doc graph and unsigned native no-bundle build. Stage/open latest local candidate, preserve original15WAV/13events plus optional VRZO/HoN packs by hashes. No fake live GSI, cloud/provider calls, UI automation, release/version/tag or unrelated-checkout edits.

## Rulings and verification

- Use D:/gm-overlay-editor-fullscreen onfix/missing-alert-evidence; retain all prior dirty changes. Evidence/ledger: D:/G-Maiden/src-tauri/target/audit-completion-20261028.
- Independent source domains run concurrently under dispatching-parallel-agents; shared lib/Overlay integration is sequential after B. All Cargo and package installation are serialized by parent. Agents use bounded targeted frontend/pure actual-source regressions; parent runs integrated suites after source freeze.
- Existing request-isolation repairs do not expand account/recovery/storage contracts or bypass Store eligibility. Human approval of this audit-fix task covers the existing bug fixes; no extra provider/security setup is inferred.
- A finding is source/test-resolved only with matching regression evidence. Do not call native/acoustic/FPS/RAM/live accuracy qualified from fixtures. Record remaining acceptance gates explicitly rather than labeling all product quality proven.
- No commit/push/merge in this batch; source and local build are reviewable before any later delivery request.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-28 | Owner-approved completion of remaining13audit findings with900MB/original-announcer preservation. |
