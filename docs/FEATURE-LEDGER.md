<!-- GENERATED — do not hand-edit; edit docs/feature-ledger.manifest.yaml and re-run tools/doc-graph/ledger.mjs -->

# FEATURE-LEDGER

> **GENERATED — do not hand-edit; edit docs/feature-ledger.manifest.yaml and re-run tools/doc-graph/ledger.mjs**  
> Source manifest: `docs/feature-ledger.manifest.yaml` · generated `2026-07-19T22:37:29.265Z` · `--run-tests`=false · rows=54

One row per feature / FR / NFR. **Computed** status is derived structurally from evidence on disk (never from a claim); **Claimed** is the manifest row's `claimed_status`; **Drift** flags where a claim outruns the evidence; **Evidence gaps** lists exactly what is missing to advance.

## Summary

### Rows by kind

| Kind | Rows |
| --- | --- |
| feature | 48 |
| nfr | 6 |

### Rows by computed status

| Computed status | Rows |
| --- | --- |
| doc-only | 13 |
| in-code | 41 |

### Drift

| Drift | Rows |
| --- | --- |
| status-inflation | 32 |
| status-understated | 0 |
| aligned | 16 |
| unclaimed | 6 |

> ⚠️ **32 blocking violation(s)** (status-inflation and/or dangling refs) — the generator exits 1. Either add the missing evidence, fix the ref, or lower the claim in the manifest.

## Violations

| Row | Type | Blocking | Detail |
| --- | --- | --- | --- |
| 1.1-g-sentry | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.1-g-signal | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.1-g-master | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.1-g-sensory | status-inflation | yes | claimed=code+tests-present exceeds computed=doc-only |
| 1.1-g-log | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.2-dxgi-capture | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.2-minimap-cv | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.3-announcer-packs | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.3-cognitive-backends | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.3-g-revive | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.4-gsi-server | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.4-item-networth | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.4-gsi-config | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.4-identity-steam | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.4-oauth-callback | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.4-secret-store | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.4-gpu-telemetry | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.4-claude-quota | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.4-calibration | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.4-utterance-ledger | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 1.4-hotkeys-updater | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 2.1-dashboard | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 2.1-voice | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 2.1-account | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 2.1-settings | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 2.2-live-wiring | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 2.2-accounts-gid | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 2.2-maiden-line | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 2.2-onair-console | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 2.2-phase-axis | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 2.2-inapp-updater | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |
| 2.2-overlay-hud | status-inflation | yes | claimed=code+tests-present exceeds computed=in-code |

## Ledger

| ID | Title | Kind | Phase | Computed | Claimed | Drift | Evidence gaps | Source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.1-g-sentry | G-Sentry — fog-of-war monitor (enemies missing from vision) | feature | P2 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.1-g-motion | G-Motion — heatmap / last-seen positions / gank-route prediction | feature | P3 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction |
| 1.1-g-signal | G-Signal — real-time gank warning, voice interrupt (hard-latency path) | feature | P3 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.1-g-master | G-Master — strategic/financial advisor (skill/item build vs enemy) | feature | P5 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.1-g-sensory | G-Sensory — overlay render + capture + hardware optimization | feature | P6 | doc-only | code+tests-present | status-inflation | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| 1.1-g-log | G-Log — feedback loop, local decision/outcome logging | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.2-dxgi-capture | DXGI desktop-duplication capture | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.2-wgc-capture | WGC capture (rollback path, --features wgc only) | feature | P5 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction |
| 1.2-minimap-cv | Minimap CV detector (ONNX) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.2-draft-cv | Draft-CV (pick-screen roster reader) | feature | P3 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction |
| 1.2-scoreboard-ocr | Scoreboard OCR (enemy Net Worth) | feature | P3 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction |
| 1.3-announcer-packs | Announcer packs (fire -> banner -> resolve -> TTS) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.3-damage-model | G-Master self-burst / damage model | feature | P3 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction |
| 1.3-cognitive-backends | Cognitive backends (cloud / local) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.3-g-revive | G-Revive (buyback advice) | feature | P5 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.4-gsi-server | GSI server (:3000) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.4-item-networth | Item / net-worth derivation | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.4-gsi-config | GSI config detect/install | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.4-identity-steam | Identity / Steam link | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.4-oauth-callback | OAuth callback (login) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.4-secret-store | Secret store (DPAPI) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.4-gpu-telemetry | GPU telemetry governor | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.4-claude-quota | Claude quota stats | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.4-calibration | Calibration (QA evidence) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.4-utterance-ledger | Utterance ledger emit (CR-011) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 1.4-hotkeys-updater | Global hotkeys / updater / window routing | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 2.1-dashboard | Dashboard (nav page) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 2.1-live | Live (nav page: [สด \| บิลด์]) | feature | P5 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction |
| 2.1-voice | Voice (nav page: คลังของฉัน / ไอเทม / ตัวแก้ไข) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 2.1-gstore | G-Store (nav page: [ร้านค้า \| กระเป๋า \| คลัง \| บันทึก]) | feature | P5 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction |
| 2.1-insights | Insights (nav page: [ภาพรวม \| ประวัติ]) | feature | P5 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction |
| 2.1-account | Account (nav page: บัญชี / กระเป๋า / ประวัติธุรกรรม) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 2.1-settings | Settings (nav page: iOS split view) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 2.2-live-wiring | Live wiring -> Tauri events | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 2.2-accounts-gid | Accounts / GID | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 2.2-economy-gstore | Economy / G-Store | feature | P5 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction |
| 2.2-maiden-line | Maiden Line command palette (Ctrl+K) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 2.2-onair-console | ON AIR utterance console | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 2.2-phase-axis | Phase axis (standby -> prep -> live -> debrief) | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 2.2-inapp-updater | In-app updater | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 2.2-overlay-hud | Overlay Combat HUD + announcer banner | feature | P6 | in-code | code+tests-present | status-inflation | no tests mapped, review record missing | bootstrap-extraction |
| 3-g-voice | G-Voice — two-way voice (PTT -> STT -> Cloud Brain -> TTS) | feature | P4 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| 3-g-memory | G-Memory — persistent cross-match player memory | feature | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| 3-g-coach | G-Coach — post-match deep review, top-3 improvement points | feature | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| 3-g-mind | G-Mind — cognitive model router / LLM switcher | feature | P4 | in-code | in-code | aligned | no tests mapped, review record missing | bootstrap-extraction |
| 3-g-persona | G-Persona — tone & verbosity presets | feature | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| 3-g-stream | G-Stream — streamer co-host mode | feature | P6 | doc-only | doc-only | aligned | primary doc status not accepted/stable, no code mapped | bootstrap-extraction |
| 3-gemini-engine | Gemini cloud engine (original design target, superseded) | feature | P1 | doc-only | doc-only | aligned | no doc mapped, no code mapped | bootstrap-extraction |
| 4-g-signal-latency | G-Signal end-to-end latency (target 250ms, never exceed 300ms) | nfr | P6 | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction |
| 4-background-cpu | Background CPU usage <= 2.5% on a mid-range chipset | nfr | P6 | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction |
| 4-ram-budget | RAM budget <= 400MB with all modules active | nfr | P6 | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction |
| 4-overlay-fps | Overlay FPS impact <= 3% drop; must not obscure minimap/skill bar/stats | nfr | P6 | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction |
| 4-resilience | Resilience — G-Sentry + G-Signal keep running on local SLM on cloud/network loss | nfr | P6 | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction |
| 4-privacy | Privacy — G-Log/live match state/CV detections stay local-only, CV never leaves the machine | nfr | P6 | doc-only | — | unclaimed | no doc mapped, no code mapped | bootstrap-extraction |
