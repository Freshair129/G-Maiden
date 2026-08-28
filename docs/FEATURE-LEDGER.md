<!-- GENERATED — do not hand-edit; edit docs/feature-ledger.manifest.yaml and re-run tools/doc-graph/ledger.mjs -->

# FEATURE-LEDGER

> **GENERATED — do not hand-edit; edit docs/feature-ledger.manifest.yaml and re-run tools/doc-graph/ledger.mjs**  
> Source manifest: `docs/feature-ledger.manifest.yaml` · generated `2026-08-28T03:23:13.418Z` · `--run-tests`=false · rows=74

One row per feature / FR / NFR. **Computed** status is derived structurally from evidence on disk (never from a claim); **Claimed** is the manifest row's `claimed_status`; **Drift** flags where a claim outruns the evidence; **Evidence gaps** lists exactly what is missing to advance.

## Summary

### Rows by kind

| Kind | Rows |
| --- | --- |
| feature | 49 |
| fr | 19 |
| nfr | 6 |

### Rows by computed status

| Computed status | Rows |
| --- | --- |
| doc-only | 32 |
| in-code | 12 |
| code+needs-test-or-review | 16 |
| code+tests-present [(unrun)] | 14 |

### Drift

| Drift | Rows |
| --- | --- |
| status-inflation | 0 |
| status-understated | 0 |
| aligned | 68 |
| unclaimed | 6 |

## Features

| ID | Title | Phase | Computed | Claimed | Drift | Evidence gaps | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1-g-sentry | G-Sentry — fog-of-war monitor (enemies missing from vision) | P2 | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.1-g-motion | G-Motion — heatmap / last-seen positions / gank-route prediction | P3 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.1-g-signal | G-Signal — real-time gank warning, voice interrupt (hard-latency path) | P3 | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.1-g-master | G-Master — strategic/financial advisor (skill/item build vs enemy) | P5 | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.1-g-sensory | G-Sensory — overlay render + capture + hardware optimization | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 1.1-g-log | G-Log — feedback loop, local decision/outcome logging | P6 | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.2-dxgi-capture | DXGI desktop-duplication capture | P6 *(derived)* | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.2-wgc-capture | WGC capture (rollback path, --features wgc only) | P5 *(derived)* | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.2-minimap-cv | Minimap CV detector (ONNX) | P6 *(derived)* | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.2-draft-cv | Draft-CV (pick-screen roster reader) | P3 *(derived)* | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.2-scoreboard-ocr | Scoreboard OCR (enemy Net Worth) | P3 *(derived)* | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.3-announcer-packs | Announcer packs (fire -> banner -> resolve -> TTS) | P6 *(derived)* | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.3-damage-model | G-Master self-burst / damage model | P3 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.3-cognitive-backends | Cognitive backends (cloud / local) | P6 *(derived)* | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.3-g-revive | G-Revive (buyback advice) | P5 | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-gsi-server | GSI server (:3000) | P6 *(derived)* | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-item-networth | Item / net-worth derivation | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-gsi-config | GSI config detect/install | P6 *(derived)* | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-identity-steam | Identity / Steam link | P6 *(derived)* | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-oauth-callback | OAuth callback (login) | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | no tests mapped | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-secret-store | Secret store (DPAPI) | P6 *(derived)* | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-gpu-telemetry | GPU telemetry governor | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-claude-quota | Claude quota stats | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-calibration | Calibration (QA evidence) | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-utterance-ledger | Utterance ledger emit (CR-011) | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-hotkeys-updater | Global hotkeys / updater / window routing | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | no tests mapped | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-dashboard | Dashboard (nav page) | P6 *(derived)* | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-live | Live (nav page: [สด \| บิลด์]) | P5 *(derived)* | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-voice | Voice (nav page: คลังของฉัน / ไอเทม / ตัวแก้ไข) | P6 *(derived)* | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-gstore | G-Store (nav page: [ร้านค้า \| กระเป๋า \| คลัง \| บันทึก]) | P5 *(derived)* | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-insights | Insights (nav page: [ภาพรวม \| ประวัติ]) | P5 *(derived)* | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-account | Account (nav page: บัญชี / กระเป๋า / ประวัติธุรกรรม) | P6 *(derived)* | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-settings | Settings (nav page: iOS split view) | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | no tests mapped | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-live-wiring | Live wiring -> Tauri events | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-accounts-gid | Accounts / GID | P6 *(derived)* | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-iam-completion | GID IAM production completion | P6 *(derived)* | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | CR-034 Phase 2 local implementation, 2026-08-24 |
| 2.2-economy-gstore | Economy / G-Store | P5 *(derived)* | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-maiden-line | Maiden Line command palette (Ctrl+K) | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-onair-console | ON AIR utterance console | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-phase-axis | Phase axis (standby -> prep -> live -> debrief) | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-inapp-updater | In-app updater | P6 *(derived)* | code+needs-test-or-review | code+needs-test-or-review | aligned | no tests mapped | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-overlay-hud | Overlay Combat HUD + announcer banner | P6 *(derived)* | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 3-g-voice | G-Voice — two-way voice (PTT -> STT -> Cloud Brain -> TTS) | P4 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 3-g-memory | G-Memory — persistent cross-match player memory | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 3-g-coach | G-Coach — post-match deep review, top-3 improvement points | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 3-g-mind | G-Mind — cognitive model router / LLM switcher | P4 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 3-g-persona | G-Persona — tone & verbosity presets | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 3-g-stream | G-Stream — streamer co-host mode | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 3-gemini-engine | Gemini cloud engine (original design target, superseded) | P1 *(derived)* | doc-only | doc-only | aligned | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |

_Legend: *(derived)* — Phase is a bootstrap badge-heuristic guess, not a phase stated in a source document (`phase_source` is not `doc` in `docs/feature-ledger.manifest.yaml`, or is unset, or claims `doc` without a resolvable `refs.docs` document to back it). Treat as provisional until a human confirms the real roadmap phase._

## Functional Requirements

| ID | Title | Phase | Computed | Claimed | Drift | Evidence gaps | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fr-3.1 | SRS §3.1 G-Sentry (Fog of War Monitor) | P2 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-3.2 | SRS §3.2 G-Motion (Strategy & Heatmap Prediction) | P3 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-3.3 | SRS §3.3 G-Signal (Real-time Gank Warning with Voice Interrupt) | P3 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-3.4 | SRS §3.4 G-Master (Strategic & Financial Advisor) | P5 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-3.5 | SRS §3.5 G-Sensory (Overlay & Hardware Optimization) | P6 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-3.6 | SRS §3.6 G-Log (Feedback Loop Analysis) | P6 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-3.7 | SRS §3.7 G-Voice (Two-Way Voice Conversation) — Priority: P0 | P4 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-3.8 | SRS §3.8 G-Memory (Persistent Player Memory) — Priority: P0 | P6 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-3.9 | SRS §3.9 G-Coach (Post-Match Deep Review) — Priority: P1 | P6 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-3.10 | SRS §3.10 G-Mind (Cognitive Model Router) — Priority: P1 | P4 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-3.11 | SRS §3.11 G-Persona (Tone & Verbosity Presets) — Priority: P2 | P6 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-3.12 | SRS §3.12 G-Stream (Streamer Co-host Mode) — Priority: P2 | P6 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-4.1.1 | Dashboard uses premium-dark #08090c with an ice aluminium translucent frame | P6 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-4.1.2 | Every module is controlled through discrete modular panels | P6 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-4.1.3 | Global hotkeys for quick commands (e.g. Alt+M for an instant situation summary) | P6 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-4.2.1 | Dota 2 GSI engine connected via local HTTP POST on port 3000 | P6 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-4.2.2 | Cloud cognitive engine via Gemini API — SRS marks this explicitly as a Phase-4 target, not yet wired | P4 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-4.2.3 | TTS module: high-frequency responsive speech with a voice-actor-like tone | P6 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| fr-4.2.4 | STT module for G-Voice push-to-talk, supporting Thai and English | P4 *(derived)* | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |

_Legend: *(derived)* — Phase is a bootstrap badge-heuristic guess, not a phase stated in a source document (`phase_source` is not `doc` in `docs/feature-ledger.manifest.yaml`, or is unset, or claims `doc` without a resolvable `refs.docs` document to back it). Treat as provisional until a human confirms the real roadmap phase._

## Non-Functional Requirements

| ID | Title | Phase | Computed | Claimed | Drift | Evidence gaps | Source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4-g-signal-latency | G-Signal end-to-end latency (target 250ms, never exceed 300ms) | P6 *(derived)* | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 4-background-cpu | Background CPU usage <= 2.5% on a mid-range chipset | P6 *(derived)* | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 4-ram-budget | RAM budget <= 400MB with all modules active | P6 *(derived)* | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 4-overlay-fps | Overlay FPS impact <= 3% drop; must not obscure minimap/skill bar/stats | P6 *(derived)* | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 4-resilience | Resilience — G-Sentry + G-Signal keep running on local SLM on cloud/network loss | P6 *(derived)* | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 4-privacy | Privacy — G-Log/live match state/CV detections stay local-only, CV never leaves the machine | P6 *(derived)* | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |

_Legend: *(derived)* — Phase is a bootstrap badge-heuristic guess, not a phase stated in a source document (`phase_source` is not `doc` in `docs/feature-ledger.manifest.yaml`, or is unset, or claims `doc` without a resolvable `refs.docs` document to back it). Treat as provisional until a human confirms the real roadmap phase._
