---
title: GANN-only event media implementation
doc_id: 2026-10-31-gann-only-events
status: active
version: 0.1.0
updated: 2026-10-31
owner: G-Maiden
---

# GANN-only Event Media Implementation Plan

**Goal:** Every announcer event in Maiden and Studio resolves its audio/video pair from a verified GANN package, including creation, installation, preview and native triggering.

**Architecture:** Studio bakes authored source into indexed original/mixed WAV and silent WebM pairs. A shared filesystem installer preserves the container and atomically admits a verified cache. Maiden resolves immutable event pairs from that cache; missing/invalid mappings are silent and logged. Event detection, priority, session fences and resource limits remain native Rust.

**Tech Stack:** existing Rust/Tauri, serde/ring/zip, ffmpeg, React/TypeScript.

**Spec:** User instruction of 2026-10-31 following the audit in this chat. It explicitly retires old announcer media routes; prior requirements to retain those routes are superseded for this change.

## Global Constraints

- Work only in the existing isolated gm-gann-container-pr / gs-gann-container-pr worktrees. Preserve primary dirty checkouts and running apps.
- No publishing, version churn, commits, Store authorization changes or account-data changes.
- GANN is the only event media authority, including debug builds. No default/flat/catalog/TTS or generated event-card fallback.
- Keep non-event dynamic advice separate; keep safety detection and cached playback Rust-only.
- Preserve the 900,000,000-byte app budget, admission priority and pack/session/revision cancellation fences.
- Archive import does not activate. Studio activation must check actual loopback health and explicit success.

## Review Focus

- Missing or corrupt mixed audio/video must never play unrelated/default media.
- Duplicate event/variant IDs and incomplete runtime metadata must fail admission consistently in both apps.
- Failed install or same-ID conflicting content must preserve the current installed package and active pointer.
- Switching/unmapping/muting during playback must cancel the correct generation without stale visuals.
- Studio event testing must exercise the emitted GANN rather than source clips or a separate renderer.

## Tasks

- [x] Shared crate: behavioral RED/GREEN CLI install tests; atomic install, playback-schema/media validation, conflict/tamper checks; mirror identical source in both repos.
- [x] Maiden: RED/GREEN reject embedded-media visual fallback and legacy/default selection; pair-only cache, unified lifecycle, GANN-only inventory/event commands and safety media; remove legacy resources/routes.
- [x] Studio: RED/GREEN build/read/install behavior; production authoring CLI creates actual paired media, install through shared crate, verify activation; Event Test reads the same GANN.
- [x] Integration: create a pack using production Studio authoring, install it, trigger actual native GSI event handling and check selected hashes, audio admission, ID visual lifecycle, unmapped/tamper/conflict behavior.
- [x] Verification: complete bounded Rust tests/clippy, frontend ESLint/tsc/Vitest, doc graph, frontend and unsigned no-bundle native builds; independent diff review. Distinguish native injected-GSI evidence from a live Dota match and acoustic/resource qualification.

## Execution ledger

- Existing linked worktrees verified; primary checkouts have unrelated dirty work and are untouched.
- User's full corrective instruction authorizes the audited removal; proceed with implementation and verification without a second design-approval round.
- Parallel lanes own separate repos; root owns the shared package crate, integration fixtures and this plan.
- Previous Git-Bash Vitest wrapper returned incomplete output; direct absolute Node through a bounded Python subprocess runs normally. Keep previous incomplete results distinct.

- Shared package gate: eleven tests and all-target clippy passed; extreme WAV rate, nonvideo/truncated/audible WebM, conflicts and cache tampering covered. Genuine small WebM fixtures replace the former magic-only sample.
- Studio production CLI created the six-event real-source fixture and a PNG-sequence fixture; invalid label leaves no final archive. Production filesystem install verified all nineteen indexed payloads without activation.
- Independent review caught wrong-instance activation, raw-audio event preview bypasses, double selection, stale playback promises, cache publication race and deletion of HP eligibility. Fix these before final native evidence.
- HP eligibility moved from deleted Overlay effects into native pure Rust. Four behavioral tests RED then GREEN cover threshold25, hysteresis, throttle, voice/owner/session gates and belief revision; native settings handoff test also RED then GREEN.


- Retired all 21 bundled static VRZO WebMs (199,215,606 bytes); the actual frontend output contains no old static WebM/banner tree. Primary checkout assets are unchanged.
- Maiden frontend: 62 files / 543 tests, TypeScript, ESLint and production build passed. Full native Rust qualification is tracked separately from the interim direct harness result (600 passed, one editorial-schema assertion failed, nine ignored).
- Studio final candidate: 96 frontend tests, TypeScript and Vite passed; native three tests, all-target clippy with warnings denied and unsigned no-bundle build passed after the final shared admission guard. No configured Studio ESLint gate exists.
- Windows harness loader and duplicate-manifest failures were diagnosed with standalone Common Controls probes; retain the generated test manifest and Tauri's existing binary manifest without duplicating RT_MANIFEST.

- Final Maiden code gate: 601 Rust tests passed / nine ignored; the explicitly supplied real Studio GANN import/reload test passed separately. Clippy passed with warnings denied. The existing `G_SUITE_DIR` test setting binds the selected Studio worktree and compares the entire schema JSON; no keys are excluded.
- Final native no-bundle build passed using CLI 2.12.0 (isolated tooling, matching the declared dependency); source hashes remained unchanged. The native candidate is in the validation root, separate from the original app.
- First native full-flow attempt created and installed all 19 GANN payloads with matching hashes and no implicit activation, then stopped at an existing process's registered global hotkey. A separate window-station attempt was denied by Windows. Original PID 4884 and live GSI configuration were preserved; user authorization to close/restart the original app is pending. Activation/GSI media acceptance is not yet passed.

- After user authorization, native injected GSI passed all six gameplay transitions and a Critical HP trigger with distinct original/mixed audio hashes; both unmapped cases were silent, and the original executable was restarted as PID 28560. See `D:/gm-gann-only-validation/native-result.json`. Live-match and acoustic/resource acceptance remain separate.

## Changelog

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-10-31 | Record authorized GANN-only implementation and verification scope. |
