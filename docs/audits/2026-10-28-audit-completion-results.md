---
title: "G-Maiden — Audit completion results"
doc_id: "RESULTS-AUDIT-COMPLETION-20261028"
status: active
version: "0.3.0"
updated: "2026-10-28"
owner: "G-Maiden"
related_docs: ["PLAN-AUDIT-COMPLETION-20261028", "AUDIT-FEATURE-LOGIC-20261027", "RESULTS-MVP-EVENT-CORRECTIONS-20261028", "AUDIT-P1-REMEDIATION-RESULTS-20261027", "mvp-decisions"]
---

# Audit completion results

Owner requested completing the remaining audit while preserving the 900,000,000-byte aggregate Working Set ceiling and the original Nakhom pack. The original audit is a historical snapshot; its OPEN labels are not a current resolution ledger. All 25 findings are reconciled at source/test level. Device/live acceptance remains separate.

## Remaining13findings

| ID | Corrected or reconciled behavior | Regression evidence |
| --- | --- | --- |
| F02 | ANN resolves only the selected eligible pack, with ID/name/clip in one snapshot; native admission fences the same pack. Missing ANN stays silent in playback and preview. Banner and transcript use actual selected provenance. Store integrity/auth rules remain intact. | Old resolver fallback probe failed as expected; selected snapshot/switch and mounted missing-ANN preview regressions. |
| F08 | Forget cutoff uses a validated modern session start record, bound to filename identity/epoch; legacy timestamps retained, unknown/old/future rejected. Read only a bounded16KiB header rather than whole archived logs. | Data actual-source RED3→GREEN56; bounded reader2MiB-body and oversized-header negatives retained. |
| F11 | Existing P1 config generation already fences backend/model changes; additional delayed-response tests verify renderer invalidation and same-generation validation order. | Mounted backend/model delayed results and producer config races. |
| F12 | One physical provider flight globally, admission-based30s throttle, RAII release; obsolete config/session cannot publish/cache, clear a newer flight or consume its throttle. No lock across inference I/O. | Deterministic concurrent-request, failed-provider retry, namespace and lifecycle regressions with fake providers only. |
| F13 | Ledger phases are generated/requested/admitted; enqueue/drop/device/decode failures are not admission. Prerecorded advice records clip identity rather than unrelated generated text. Native append is inside short config/session/pack fences; metadata work runs separately. | Receipt/one-shot commit tests, phase builder and native command probes; audible completion is not claimed. |
| F14 | Buyback advice/narratives carry death_episode/request_id, checked against authoritative accepted ticks and newest request. Respawn/next death invalidates both producer and renderer. | Same-session death→respawn→death, repeated requests and delayed narratives, including actual command producer harness. |
| F15 | Owned inventory/NW remains complete; combat burst uses equipped typed loadout only, actives require explicit availability. Stash/backpack/unknown slots never become active damage. | Equipped/passive/active/cooldown/unknown-positive-negative tests; actual master consumer uses combat_items. |
| F16 | Profile/wallet/ownership requests and actions are fenced by user identity and request epochs; first render masks old-account state. No schema/provider/security-contract change. | Mounted deferred profile/save/GID/wallet/topup/Store responses and first-render account switch cases. |
| F17 | Ref-counted single OAuth callback consumer fans session updates to hooks; delayed initial session/native callback cannot restore signed-out credentials. | Mounted multi-hook callback, initial-session and sign-out race regressions. |
| F18 | Steam unlink/switch/relink invalidates outstanding OpenDota requests and clears derived identity statistics immediately. | Mounted A→B/unlink/relink and late-response tests. |
| F19 | Explicit announcer-preview event has native admission identity and expiry; no fake game state or GSI-online status. Delayed/expired/older preview work cannot override current display. Static advice voice preview is a fixed native command, separate from live speech. | Mounted offline/expiry/stale identity, fixed-preview and native producer scheduling tests. |
| F23 | SAPI spawn and rodio append share an output admission gate. Lower-priority audio cannot interrupt higher-priority SAPI; preemption is bounded and append rechecks admission after preparation. | Shared gate/receipt/priority regressions and scoped lock/deadline review. Acoustic overlap trials remain separate. |
| F24 | Earlier P1 feeder already validates service/selected port and HTTP acknowledgement; rejected posts preserve failure accounting. No duplicate feeder change. | Actual feeder source24/24 tests, including HTTP500,200, health identity and finite failure exit. |

## Reconciliation of earlier12findings

F01/F03/F04/F05/F06/F07/F25 were source-corrected in [[AUDIT-P1-REMEDIATION-RESULTS-20261027]]. F09/F10/F20/F21/F22 were source-corrected in [[RESULTS-MVP-EVENT-CORRECTIONS-20261028]]. Their regression suites remain part of the full integration run; no earlier source fix is silently redone or presented as new work. F07 sustained resource and F25 acoustic/FPS acceptance remain open evidence gates, independently of code closure.

## Verification and review

- Evidence: `D:/G-Maiden/src-tauri/target/audit-completion-20261028`; per-domain handoffs preserve exact sources, RED/GREEN and stated harness limits.
- Fresh scoped review found stale synthesized speech across matches, a check/append race and inaccurate prerecorded transcripts. These were repaired with original-epoch/native-commit fences and actual clip provenance. Delayed preview publication is anchored to native admission and the original deadline. Review confirmed source closure; producer-level probes supplement the mounted tests.
- Final frozen-source integration: `cargo test -j 1 --locked` passed **536 tests, 0 failed, 7 existing ignored**; test parallelism remains the default. `cargo clippy -j 1 --all-targets -- -D warnings` passed. Frontend TypeScript/ESLint passed; Vitest passed **477 tests across 54 files**. Feeder actual-source reconciliation passed **24/24**, and the actual feeder Cargo suite and Clippy also pass. The delivery fingerprint covers 276 application files, unchanged from the tested candidate. An accidental pnpm configuration placeholder outside that fingerprint is excluded from delivery.
- Documentation gate passed **215 tests**: encoding, ledger and orphan checks passed; all 14 existing strict findings are checklist-covered with 0 uncovered. Generated documentation graph/index artifacts were refreshed with this report.
- Tauri `--no-bundle` build passed. Actual compiler commands confirm optimized application library/binary, with application debug assertions and overflow checks retained through package-only local CLI overrides; source release policy and versions remain unchanged. This is an unsigned local candidate, not an updater release.
- Earlier attempts remain in evidence: the cold native compile/link reached its 900-second ceiling before tests started; a later run passed 535 tests with one legacy assertion still expecting forbidden ANN fallback. That assertion now explicitly requires unmapped ANN rejection while preserving explicit-default ANN and Signal fallback positives. A subsequent 536-pass run exposed one Clippy boolean-style error in a new test; the equivalent `is_none()` assertion was applied, then the full 536-test suite and Clippy passed. No timeout, test thread setting, assertion coverage, or lint gate was relaxed.
- Actual-source harnesses with fake process/provider/Tauri types are not native acoustic/live evidence. Existing real-SDK test-reset warnings are retained separately from the clean mounted isolation tests; no timeout was increased or check disabled.

## Local candidate and preserved audio

- Opened `D:/G-Maiden/src-tauri/target/p1-audit900-complete-20261028-074004/g-maiden.exe`, PID **36576**, at **2026-10-28 07:40:07 +07:00**. Only the previous candidate PID/path was stopped; Dota was not running at the switch.
- SHA-256: `36bff089a9d70299c96f1804222c3cce302f8182598713c5fead9f9666a92ea8`. Frontend asset: `CommandDeck-DF5UCbtV.js`.
- Startup receipt confirms candidate-owned `127.0.0.1:3000`, `/health` service/port identity, trusted control load and overlay-ready ACK, with shared browser PID **19144**. This does not assert GSI Online without a live game.
- Active pack remains original Nakhom `pack_mrijgajn`: **15 WAV / 13 mapped events**. Optional VRZO **21 WAV / 15 events**, HoN Nakhom **12 WAV / 12 events**, and all **9 Signal assets** remain present. Every staged asset hash matches its preserved source. `audit-delivery-proof.json` records the complete comparison.
- `verified-native-tests.log`, `verified-native-clippy.log`, `integration-front-*.log`, `audit-optimized-native-build.log`, `audit-build-profile-proof.json`, `startup-receipt.json` and `audit-source-fingerprint.json` contain the corresponding evidence.

## Preserved constraints and acceptance boundary

RAM ceiling stays 900M decimal bytes across all used PIDs; CPU/latency/FPS/privacy and provider admission remain unchanged. The implementation run performed no real provider requests, account schema/RLS/MFA/recovery setup, Store receipts/purchases, fake live GSI, UI automation, commit, push, tag or signed release. Original Nakhom remains active in the recorded candidate; optional VRZO and HoN packs remain selectable with hash-preserved assets.

## Owner-authorized PR delivery

After the recorded implementation/build result, the owner requested commit, push, a PR and merge when ready. Delivery uses `fix/audit-completion-900mb` against `main`. The combined diff includes the approved portrait-roster/CV safety foundation, seven P1 fixes, event corrections and the remaining audit changes because their shared runtime, audio, resource and frontend interfaces form the tested application. Generated doc artifacts and vendored updater licenses are included. Local voice assets, screenshots, raw logs, signing material, runtime evidence and an accidental pnpm 11 workspace placeholder are excluded. The placeholder was moved to the local evidence directory; frontend/build checks are repeated without it. This delivery authorization does not authorize a version bump, updater activation or release.

Source/test resolution of25findings does not prove live CV precision, audible onset/overlap, whole-match banner behavior, long-run resource/FPS or complete OS/device acceptance. Those gates remain explicitly unverified;900MB owner approval is not a passing measurement.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-28 | Reconcile all25findings, remaining13source fixes and bounded regression/review evidence; final gates pending. |
| 0.2.0 | 2026-10-28 | Record final Rust/Clippy/frontend passes, unsigned native build and opened candidate, startup and original/optional voice-pack integrity; keep live resource/acoustic/FPS acceptance open. |
| 0.3.0 | 2026-10-28 | Record owner-authorized PR delivery scope and exclusion of accidental pnpm configuration; preserve implementation evidence and live-acceptance boundaries. |
