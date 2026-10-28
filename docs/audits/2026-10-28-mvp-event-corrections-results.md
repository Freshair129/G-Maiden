---
title: "G-Maiden — MVP event corrections results"
doc_id: "RESULTS-MVP-EVENT-CORRECTIONS-20261028"
status: active
version: "0.2.0"
updated: "2026-10-28"
owner: "G-Maiden"
related_docs: ["PLAN-MVP-EVENT-CORRECTIONS-20261028", "AUDIT-FEATURE-LOGIC-20261027", "mvp-decisions"]
---

# MVP event corrections results

Current MVP RAM ceiling is900,000,000bytes aggregate full Working Set, owner-approved in [[mvp-decisions]] v0.5.0. This is a budget change, not a memory-acceptance result. CPU/latency/FPS/privacy/provider admission and all-process accounting remain unchanged. The former800MB candidate's startup835MB reading and0-sample interrupted run remain historical evidence.

## Corrected behavior

| Finding | Implementation | Evidence boundary |
| --- | --- | --- |
| F09 | Persona, kill banner and auto-advice keep independent previous-tick baselines; every new tick reseeds after session/lifecycle boundaries. Kill deltas count once across settings updates and duplicate ticks. | Mounted multi-tick tests, including identical-value epoch/draft→live transitions. No live-match assertion. |
| F10 | Missing heroes never identify a victim. Single-kill confirmed backend identity is retained; missing/ambiguous/batched identity uses generic text. | Mounted persona/banner positive and negative tests. No new hero inference. |
| F20 | Negative pregame time cannot fire match_start. Horn crossing near0 fires once; midmatch attach/reconnect does not replay it. | Pure actual-source detector tests; session epochs reset dedup independently. |
| F21 | Cumulative death count resets streak and multikill even when dead/respawn ticks were missed. Kills and deaths in one update do not establish their order or a new streak. | Detector regressions plus mounted overlay counter tests. |
| F22 | First blood requires exactly one new local kill and an unambiguous total-score0→1. Batched/unchanged/ambiguous scores cannot claim it. | Deterministic detector positives and negatives. |

## Verification ledger

- Original regressions: detector4failed/12passed; aggregate-budget2failed/3passed; frontend22failed/10passed. Green: detector16/16, accounting5/5 and mounted/budget/frontend34/34 after review corrections.
- Scoped fresh review found two blockers: obsolete850MB over-budget test and missing tick dependencies at session boundaries. Governor fixture RED1→GREEN; mounted boundary tests RED2→GREEN. Both were corrected and reviewer confirmed closure.
- Full native verification was stopped while source was not yet frozen after review; the interrupted attempt is not a failed product test or a passing gate. The final frozen source passed the full checks below.
- The legacy perf_p7 tool remains a host-only diagnostic: decimal900MB lower bound; host≤900M returnsSKIP, host>900M returnsFAIL. It cannot establish aggregate RAM acceptance.

Evidence: `D:/G-Maiden/src-tauri/target/mvp-events-900-20261028`. Actual-source standalone Rust harnesses preserve production detector/accounting logic with type-only context; they are distinct from full Cargo verification. No provider traffic, fake live GSI, Store activation, signed release, commit or push.

## Final integration and local candidate

- Full Cargo: **518passed/0failed/7ignored**. Clippy all targets with `-D warnings`: exit0.
- Full desktop: **456passed/50files**, TypeScript and ESLint exit0. Legacy perf RAM classifier actual-source tests5/5; full separate perf crate was not built.
- Documentation gate passed215tests, encoding/ledger/orphan checks and14existing checklist-covered findings/0uncovered; generated artifacts refreshed with these documents.
- Unsigned Tauri no-bundle smoke build exit0. Actual app lib/bin compiler commands prove opt-level3 with package-only debug assertions and overflow checks retained. No production release policy or app version changed.
- Frozen application source fingerprint271files remained unchanged through the build. Binary SHA256 `DC390A81F05C24C638AC064224132BF850D600901EFA0DAE59607378D6E4F27D`.
- Opened `D:/G-Maiden/src-tauri/target/p1-mvp900-events-20261028-062615/g-maiden.exe`, PID13012. Startup verified exact PID/path/hash, owned loopback port3000, `/health` service/port, trusted Control/Overlay roots, shared browser PID25952 and native Overlay readiness ACK. This does not prove a live Dota connection or visual correctness.
- Original Nakhom `pack_mrijgajn` remains active:15WAV/13events/29files. Optional VRZO21WAV/15events and HoN Nakhom12WAV/12events remain installed. All pack files and9canonical Signal files match their sources bySHA256; no ANN voice substitution.

Receipts: `final-native-0.log`, `final-native-1.log`, `final-front-0.log` through `final-front-2.log`, `ram900-optimized-native-build.log`, `ram900-final-build-profile-proof.json`, `ram900-final-delivery-proof.json`, `startup-receipt.json` and `ram900-event-source-fingerprint.json` in the evidence directory above.

## Remaining work

The other13P2 findings from the original audit remain queued or require reconciliation with overlapping P1 corrections; this batch does not close all25findings. In particular, audio provenance/admission, memory-forget/session logs, single-flight advice, buyback episode fencing, combat-slot eligibility, account/OAuth isolation, identity-derived stale data and offline pack preview require their own bounded fixes/review. F11/F24 overlap earlier P1 work and must be verified before duplicate changes.

No Computer Use was resumed after the prior Escape. Live match, audible onset/overlap, FPS, long-run RAM/CPU and the complete OS/device acceptance matrix remain unverified.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-28 | Record900MB budget, five event corrections, RED/GREEN and scoped review; full build pending. |
| 0.2.0 | 2026-10-28 | Record full518Rust/456desktop validation, local build/startup and unchanged voice-pack proofs; live/resource acceptance remains open. |
