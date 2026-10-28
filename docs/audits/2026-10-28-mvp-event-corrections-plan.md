---
title: "G-Maiden — MVP event corrections and 900 MB budget"
doc_id: "PLAN-MVP-EVENT-CORRECTIONS-20261028"
status: accepted
version: "0.1.0"
updated: "2026-10-28"
owner: "G-Maiden"
related_docs: ["mvp-decisions", "AUDIT-FEATURE-LOGIC-20261027", "AUDIT-P1-REMEDIATION-RESULTS-20261027"]
---

# MVP event corrections

Owner instruction: “900mb ก็ได้สำหรับ mvp ทำส่วนอื่นต่อ”. Raise the MVP aggregate full Working Set ceiling to900,000,000bytes; preserve all-process accounting, CPU/latency/FPS/privacy/provider admission. Stop the400MB optimization lane. Neither the800MB startup835MB reading nor an interrupted0-sample run establishes900MB acceptance.

## Scope and sequence

1. Align accepted MVP decision, active requirements, Rust governor and frontend budget to900 decimalMB. Test exact900M and900M+1, unknown readings, child/shared-provider inclusion and unchanged CPU thresholds.
2. F09/F10: give persona, kill banner and auto-advice independent transition baselines. A single tick must reach each consumer once, without duplicate effects from settings/re-renders. Never derive a victim from missing heroes. Reset baselines on session/freshness boundaries; count observed kill deltas, reset streak on cumulative deaths, and use generic wording without a confirmed victim.
3. F20/F21/F22: start ANN at the opening horn, not negative pregame; do not replay start on same-session reconnect. Cumulative deaths reset streak/multikill even when death/respawn occurred between updates; ambiguous ordering of kills/deaths cannot establish a new streak. First blood requires an unambiguous0→1 total-score transition and exactly one local kill.
4. Run failing mounted/frontend and actual-source pure Rust regressions before implementation; then full Rust tests/Clippy, ESLint/TypeScript/Vitest, doc gate and local unsigned Tauri smoke build. Preserve original15-WAV Nakhom pack and optional VRZO/HoN packs by hashes. No fake live GSI, provider calls, Store bypass, release/tag/version bump or primary-checkout edits.

## Rulings and boundaries

- Reuse D:/gm-overlay-editor-fullscreen, branchfix/missing-alert-evidence; preserve other dirty work. New evidence lives in D:/G-Maiden/src-tauri/target/mvp-events-900-20261028.
- This batch closes only the listed source defects with bounded regressions. Other P2s remain queued; F11 and F24 overlap earlier P1 work and require reconciliation rather than duplicate implementation. Account/auth changes remain outside this batch.
- Respect the previous Escape interruption: no Computer Use in this batch. A local build may be opened through the already-authorized native launch path; UI/live-match/audio/FPS acceptance remains unverified.
- No commit/push/PR in this batch unless separately requested; current broad working tree is not a reviewable isolated delivery yet.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-28 | Owner-approved900MB MVP ceiling and next five event/overlay audit corrections. |
