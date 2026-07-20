<!-- GENERATED — do not hand-edit; edit docs/feature-ledger.manifest.yaml and re-run tools/doc-graph/ledger.mjs -->

# FEATURE-LEDGER

> **GENERATED — do not hand-edit; edit docs/feature-ledger.manifest.yaml and re-run tools/doc-graph/ledger.mjs**  
> Source manifest: `docs/feature-ledger.manifest.yaml` · generated `2026-07-20T02:40:59.917Z` · `--run-tests`=false · rows=66

One row per feature / FR / NFR. **Computed** status is derived structurally from evidence on disk (never from a claim); **Claimed** is the manifest row's `claimed_status`; **Drift** flags where a claim outruns the evidence; **Evidence gaps** lists exactly what is missing to advance.

## Summary

### Rows by kind

| Kind | Rows |
| --- | --- |
| feature | 48 |
| fr | 12 |
| nfr | 6 |

### Rows by computed status

| Computed status | Rows |
| --- | --- |
| doc-only | 19 |
| in-code | 14 |
| code+needs-test-or-review | 18 |
| code+tests-present [(unrun)] | 15 |

### Drift

| Drift | Rows |
| --- | --- |
| status-inflation | 0 |
| status-understated | 0 |
| aligned | 60 |
| unclaimed | 6 |

## Ledger

> † = `phase_target` is a bootstrap badge-heuristic (`phase_source: heuristic` in the manifest), not a sourced roadmap phase — treat as provisional until confirmed.

### Features

| ID | Title | Kind | Phase | Computed | Claimed | Drift | Evidence gaps | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1-g-sentry | G-Sentry — fog-of-war monitor (enemies missing from vision) | feature | P2 | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.1-g-motion | G-Motion — heatmap / last-seen positions / gank-route prediction | feature | P3 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.1-g-signal | G-Signal — real-time gank warning, voice interrupt (hard-latency path) | feature | P3 | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.1-g-master | G-Master — strategic/financial advisor (skill/item build vs enemy) | feature | P5 | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.1-g-sensory | G-Sensory — overlay render + capture + hardware optimization | feature | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 1.1-g-log | G-Log — feedback loop, local decision/outcome logging | feature | P6 | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.2-dxgi-capture | DXGI desktop-duplication capture | feature | P6† | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.2-wgc-capture | WGC capture (rollback path, --features wgc only) | feature | P5† | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.2-minimap-cv | Minimap CV detector (ONNX) | feature | P6† | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.2-draft-cv | Draft-CV (pick-screen roster reader) | feature | P3† | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.2-scoreboard-ocr | Scoreboard OCR (enemy Net Worth) | feature | P3† | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.3-announcer-packs | Announcer packs (fire -> banner -> resolve -> TTS) | feature | P6† | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.3-damage-model | G-Master self-burst / damage model | feature | P3 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.3-cognitive-backends | Cognitive backends (cloud / local) | feature | P6† | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.3-g-revive | G-Revive (buyback advice) | feature | P5 | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-gsi-server | GSI server (:3000) | feature | P6† | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-item-networth | Item / net-worth derivation | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-gsi-config | GSI config detect/install | feature | P6† | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-identity-steam | Identity / Steam link | feature | P6† | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-oauth-callback | OAuth callback (login) | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | no tests mapped | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-secret-store | Secret store (DPAPI) | feature | P6† | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-gpu-telemetry | GPU telemetry governor | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-claude-quota | Claude quota stats | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-calibration | Calibration (QA evidence) | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-utterance-ledger | Utterance ledger emit (CR-011) | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 1.4-hotkeys-updater | Global hotkeys / updater / window routing | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | no tests mapped | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-dashboard | Dashboard (nav page) | feature | P6† | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-live | Live (nav page: [สด \| บิลด์]) | feature | P5† | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-voice | Voice (nav page: คลังของฉัน / ไอเทม / ตัวแก้ไข) | feature | P6† | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-gstore | G-Store (nav page: [ร้านค้า \| กระเป๋า \| คลัง \| บันทึก]) | feature | P5† | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-insights | Insights (nav page: [ภาพรวม \| ประวัติ]) | feature | P5† | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-account | Account (nav page: บัญชี / กระเป๋า / ประวัติธุรกรรม) | feature | P6† | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 2.1-settings | Settings (nav page: iOS split view) | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | no tests mapped | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-live-wiring | Live wiring -> Tauri events | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-accounts-gid | Accounts / GID | feature | P6† | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-economy-gstore | Economy / G-Store | feature | P5† | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-maiden-line | Maiden Line command palette (Ctrl+K) | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-onair-console | ON AIR utterance console | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-phase-axis | Phase axis (standby -> prep -> live -> debrief) | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-inapp-updater | In-app updater | feature | P6† | code+needs-test-or-review | code+needs-test-or-review | aligned | no tests mapped | bootstrap-extraction, pruned 2026-07-20 |
| 2.2-overlay-hud | Overlay Combat HUD + announcer banner | feature | P6† | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | bootstrap-extraction, pruned 2026-07-20 |
| 3-g-voice | G-Voice — two-way voice (PTT -> STT -> Cloud Brain -> TTS) | feature | P4 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 3-g-memory | G-Memory — persistent cross-match player memory | feature | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 3-g-coach | G-Coach — post-match deep review, top-3 improvement points | feature | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 3-g-mind | G-Mind — cognitive model router / LLM switcher | feature | P4 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction, pruned 2026-07-20 |
| 3-g-persona | G-Persona — tone & verbosity presets | feature | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 3-g-stream | G-Stream — streamer co-host mode | feature | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 3-gemini-engine | Gemini cloud engine (original design target, superseded) | feature | P1† | doc-only | doc-only | aligned | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |

### Functional requirements (FR)

| ID | Title | Kind | Phase | Computed | Claimed | Drift | Evidence gaps | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fr-3.1 | SRS §3.1 G-Sentry (Fog of War Monitor) | fr | P2 | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | fr-backfill 2026-07-20 (mirrors 1.1-g-sentry evidence) |
| fr-3.2 | SRS §3.2 G-Motion (Strategy & Heatmap Prediction) | fr | P3 | in-code | in-code | aligned | no tests mapped, review record missing | fr-backfill 2026-07-20 (mirrors 1.1-g-motion evidence) |
| fr-3.3 | SRS §3.3 G-Signal (Real-time Gank Warning with Voice Interrupt) | fr | P3 | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | fr-backfill 2026-07-20 (mirrors 1.1-g-signal evidence) |
| fr-3.4 | SRS §3.4 G-Master (Strategic & Financial Advisor) | fr | P5 | code+tests-present (unrun) | code+tests-present | aligned | tests not run (--run-tests) | fr-backfill 2026-07-20 (mirrors 1.1-g-master evidence) |
| fr-3.5 | SRS §3.5 G-Sensory (Overlay & Hardware Optimization) | fr | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | fr-backfill 2026-07-20 (mirrors 1.1-g-sensory evidence) |
| fr-3.6 | SRS §3.6 G-Log (Feedback Loop Analysis) | fr | P6 | code+needs-test-or-review | code+needs-test-or-review | aligned | review record missing | fr-backfill 2026-07-20 (mirrors 1.1-g-log evidence) |
| fr-3.7 | SRS §3.7 G-Voice (Two-Way Voice Conversation) — Priority: P0 | fr | P4 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | fr-backfill 2026-07-20 (mirrors 3-g-voice evidence) |
| fr-3.8 | SRS §3.8 G-Memory (Persistent Player Memory) — Priority: P0 | fr | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | fr-backfill 2026-07-20 (mirrors 3-g-memory evidence) |
| fr-3.9 | SRS §3.9 G-Coach (Post-Match Deep Review) — Priority: P1 | fr | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | fr-backfill 2026-07-20 (mirrors 3-g-coach evidence) |
| fr-3.10 | SRS §3.10 G-Mind (Cognitive Model Router) — Priority: P1 | fr | P4 | in-code | in-code | aligned | no tests mapped, review record missing | fr-backfill 2026-07-20 (mirrors 3-g-mind evidence) |
| fr-3.11 | SRS §3.11 G-Persona (Tone & Verbosity Presets) — Priority: P2 | fr | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | fr-backfill 2026-07-20 (mirrors 3-g-persona evidence) |
| fr-3.12 | SRS §3.12 G-Stream (Streamer Co-host Mode) — Priority: P2 | fr | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | fr-backfill 2026-07-20 (mirrors 3-g-stream evidence) |

### Non-functional requirements (NFR)

| ID | Title | Kind | Phase | Computed | Claimed | Drift | Evidence gaps | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4-g-signal-latency | G-Signal end-to-end latency (target 250ms, never exceed 300ms) | nfr | P6 | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 4-background-cpu | Background CPU usage <= 2.5% on a mid-range chipset | nfr | P6 | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 4-ram-budget | RAM budget <= 400MB with all modules active | nfr | P6 | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 4-overlay-fps | Overlay FPS impact <= 3% drop; must not obscure minimap/skill bar/stats | nfr | P6 | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 4-resilience | Resilience — G-Sentry + G-Signal keep running on local SLM on cloud/network loss | nfr | P6 | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
| 4-privacy | Privacy — G-Log/live match state/CV detections stay local-only, CV never leaves the machine | nfr | P6 | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction, pruned 2026-07-20 |
