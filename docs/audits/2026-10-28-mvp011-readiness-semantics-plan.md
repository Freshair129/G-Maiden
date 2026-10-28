---
title: "G-Maiden — MVP-011 readiness semantics correction"
doc_id: "PLAN-MVP011-READINESS-SEMANTICS-20261028"
status: accepted
version: "0.6.0"
updated: "2026-10-29"
owner: "G-Maiden"
related_docs: ["mvp-backlog", "mvp-decisions", "MVP048-RUNTIME-BASELINE-20261028"]
---

# MVP-011: settings are not health evidence

The owner requested continuing after the audit integration. Existing MVP-011 requires unknown health to stay unknown. `ReadinessRundown` currently turns `signalEnabled` and `annEnabled` into a ready check and “พร้อม”; selecting a pack or raising volume similarly appears as a readiness pass. Its parent supplies `gsiOnline` without the separate freshness axis. The existing `runtimeReadiness.ts` correctly keeps audio unknown without a health producer, but this rundown bypasses that distinction.

## Bounded correction

1. Write mounted regressions first: enabled audio without health evidence must not claim ready or receive a ready check; selected pack and volume are configuration only; disabled/muted remain explicit user choices; stale/unknown GSI cannot pass, fresh active GSI can. Preserve the preview callback.
2. Separate runtime-ready, configured/enabled, disabled and unknown rows. Only fresh active GSI has current readiness evidence in this component. Keep configuration values visible; invalid volume remains unknown rather than appearing muted/ready. Explain that capture/audio health is still unconfirmed. Pass freshness from the existing companion data and apply the same freshness requirement in the existing pure readiness helper. No new health producer, settings field, API, IPC, feature flag, dependency or synthetic runtime evidence.
3. Run targeted RED→GREEN, frontend full tests, TypeScript/ESLint, frontend build and doc graph. Review the narrow diff. Rust/runtime/audio/model/profile/pack state is untouched, so no application restart or heavy native rebuild during the player's session.

Evidence: `D:/G-Maiden/src-tauri/target/mvp048-runtime-baseline-20261028/readiness`.

This is a narrow correction of the existing accepted MVP-011 contract, not closure of MVP-011-B, device/audio confirmation, capture coverage, overlay rendering, full runtime acceptance or MVP-048. Preserve the 900,000,000-byte ceiling and original voice assets; do not change the currently selected pack.

## Verification result — 2026-10-28 frontend checkpoint

- Canonical serialized RED reproduced 13 assertion failures with 5 existing/positive cases passing; no production code had been changed. Final targeted GREEN passed all 18 cases. An additional inline-state clarification was reproduced as 1 failure/17 passes before the final GREEN; the initial duplicate-run transcript is retained locally and is not the canonical RED evidence.
- Final full frontend suite: **491 passed / 55 files**. TypeScript and ESLint passed. Production frontend build passed with `CommandDeck-Ce0dctCf.js`; no dependency or version change.
- Read-only scoped review found no blocking issue in semantics, callers, existing seat geometry or source-level accessibility. The clarification is inline in existing rows, with no extra vertical panel, effect, polling, listener or IPC.
- Rust and feeder source are unchanged from integrated `25b82b6e`; their PR #92 checks are baseline evidence, not newly claimed native validation of this UI revision. The running application was not replaced, and this frontend build is not a newly embedded native artifact or visual/device acceptance.
- Raw event counters/process receipts stay local. Native sampler launch was rejected by automatic approval review; ordinary metadata measurements remain diagnostic only, as recorded in [[2026-10-28-mvp048-runtime-baseline]].

MVP-011 remains open for its real health producers and native/visual/audio acceptance. This correction removes false readiness claims without claiming those missing prerequisites passed.

## Local native delivery follow-up

The owner requested fixing the remaining handoff on 2026-10-29. G-Maiden is no longer running at preflight, while Dota remains open. Complete fresh frontend/native checks, then embed the verified frontend in an unsigned optimized no-bundle candidate, retaining application debug assertions/overflow checks. All Cargo work is serialized. Stage verified original Nakhom assets plus optional VRZO/HoN packs and preserve the 900,000,000-byte contract. Resolve the explicit original-default versus last-observed VRZO selection without modifying old cache contents. Open only the new G-Maiden candidate, verify its process/path/hash, listener ownership and trusted window startup; never stop Dota or run the previously rejected native resource sampler. Native startup proof is distinct from rendered-layout, acoustic, sustained resource and full MVP acceptance. No version bump, tag, signed release or updater activation.

Evidence for this delivery: `D:/G-Maiden/src-tauri/target/mvp011-native-delivery-20261029`.

### Delivered candidate — 2026-10-29

- Fresh checks passed: Rust **536 passed / 0 failed / 7 existing ignored**, all doc-tests completed; Clippy all targets with `-D warnings`; frontend **491 tests / 55 files**, TypeScript and ESLint. Local native no-bundle build passed in 267.754 seconds, within its 900-second ceiling. Source fingerprint covers 265 selected application/config files and remained unchanged through the build.
- Actual library/binary compiler commands confirm opt-level 3 and retained application debug assertions/overflow checks. The staged native binary contains the verified `CommandDeck-Ce0dctCf.js` asset name; asset SHA-256 is `f9230c495a6eef3f7ed97cfa187f558f45d92d83aed78fc956a2010c163a038e`.
- Candidate: `D:/G-Maiden/src-tauri/target/mvp011-readiness-20261029-7acd3864/g-maiden.exe`; SHA-256 `dd95677c5f2c519dea4cd57c6f30537db35cea54d2b05fd493bba40a2c6b7bc5`. Source is integrated base `25b82b6e` plus the reviewed readiness working-tree correction; it is not falsely identified as an unmodified main/release artifact.
- Opened only the new application with minimized window style requested. At the startup check it remained alive after 93.86 seconds. Its owned listener returned the expected service/port on `127.0.0.1:3000`; trusted control load and overlay-ready ACK were confirmed with a shared browser process. These prove startup/listener/bootstrap, not current GSI freshness, rendered layout, speaker output or whole-match behavior.
- Original Nakhom `pack_mrijgajn` was active at initial startup under the earlier instruction; the later explicit VRZO choice below supersedes that initial default. Original **15 WAV / 13 events**, VRZO **21 / 15**, HoN Nakhom **12 / 12** and all **9 Signal files** passed staged asset hash comparisons. No AI ANN substitution or Store receipt was added.
- Dota was not stopped or controlled. No UI automation, native resource sampler, capture/acoustic/FPS measurement, version bump, signed release or updater activation occurred. The 900,000,000-byte ceiling remains unchanged; sustained all-modules resource acceptance is still open.

Evidence: `build-proof.json`, `source-fingerprint.json`, per-check result/log files, `candidate.json` and `startup-receipt.json` in the delivery directory. The earlier read-only review had no blocking findings; this handoff changed documentation/staging only, not the reviewed source.

### Explicit pack-selection follow-up

The owner subsequently replied to the asynchronous preference question: keep VRZO according to the latest selection. Activated the existing `pack_vrzo_20261028` through the application's existing guarded loopback activation endpoint after verifying listener ownership and service identity. The successful response and persisted active-pack file confirmed the choice; that handler also refreshes native clip selection. The current candidate and staging default now use VRZO. Original Nakhom and HoN remain available; no assets were replaced, entitlement bypassed, audio test fired or application/game restarted. The initial startup receipt remains historical; `vrzo-selection-receipt.json` records the later explicit choice.

### Owner-authorized PR delivery

The owner requested commit, push, a PR and merge when ready for this readiness batch while retaining VRZO as the default. The PR contains the reviewed readiness correction/tests, this bounded evidence documentation, Changelog and regenerated graph/index artifacts. Voice assets, persisted selection/cache, private receipts and raw logs stay outside Git. The current local candidate's VRZO choice is verified before and after delivery; it is not replaced by a hardcoded pack choice or uploaded to the repository. Existing native/acoustic/resource acceptance gates remain open, and this authorization does not publish a release or change the application version.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-28 | Correct enabled/configured versus verified-ready semantics under the existing MVP-011 contract. |
| 0.2.0 | 2026-10-28 | Record serialized RED/GREEN, 491-test frontend verification, bounded scoped review and preserved runtime/device acceptance gates. |
| 0.3.0 | 2026-10-29 | Complete the owner-requested local native handoff with fresh checks, preserved voice assets and explicit startup-versus-acceptance boundaries. |
| 0.4.0 | 2026-10-29 | Record passed fresh gates, embedded frontend/native hashes, opened original-voice candidate and bounded startup proof; retain full runtime acceptance gates. |
| 0.5.0 | 2026-10-29 | Apply the owner's later explicit VRZO default through existing guarded activation; preserve initial startup evidence and all optional voice assets. |
| 0.6.0 | 2026-10-29 | Record owner-authorized readiness PR delivery with VRZO preserved and resolve the baseline documentation link before publication. |
