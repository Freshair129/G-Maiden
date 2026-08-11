# PROJECT_FEATURE_MAP

> **Single-page map of every G-Maiden feature → module → implementing file(s) → status.**
> Snapshot at **v0.13.0** (2026-07-19). Status is judged from the **actual code**, not from
> comments/specs. This is a derived/maintained doc — when it disagrees with the code, the
> code wins; update this file.

**Scope:** the shipped player-facing companion app (Tauri v2 + React/Vite + Rust). The
in-repo `orchestration/` project (**G-Orchestra**, `g-maiden-orchestrator` v0.1.0) is a
separate dev-tool product and is **out of scope** here. The announcer event-contract SSOT
lives in the sibling **G-Suite** repo (`G:/G-Suite/schemas/gmaiden-events.json`); the
authoritative in-repo mirror is [`voice_api.rs`](file:///g:/G-Maiden/src-tauri/src/voice_api.rs) (`EVENTS`).

### Status legend

| Badge | Meaning |
| --- | --- |
| 🟢 **SHIPPED** | Wired into the runtime and functional (renders/emits real data). |
| 🟡 **PARTIAL** | Works but limited, mock-fed, or blocked by an external dependency. |
| 🟠 **STUB** | Scaffold compiled but not wired / dead code / placeholder empty-state. |
| ⚪ **PLANNED** | Specified in PRD/SRS, no implementation yet. |

---

## 1. Backend — Rust core ([`src-tauri/src/`](file:///g:/G-Maiden/src-tauri/src/))

### 1.1 The six canonical G-series modules (ADR-01 / [[software-requirements-specification]] §2–3)

| Module | Responsibility | File(s) | Status | Evidence / caveat |
| --- | --- | --- | --- | --- |
| **G-Sentry** | Fog-of-war monitor (enemies missing from vision) | [`sentry.rs`](file:///g:/G-Maiden/src-tauri/src/sentry.rs) | 🟢 SHIPPED | Driven every frame ([`capture.rs:L486`](file:///g:/G-Maiden/src-tauri/src/capture.rs#L486)); edge-triggered `enemy-missing`; confirm-hits/stale gates vs phantoms. **Dies in Lite mode** (needs DXGI). Own-game = other 9 heroes only. |
| **G-Motion** | Heatmap / last-seen positions / gank-route prediction | [`motion.rs`](file:///g:/G-Maiden/src-tauri/src/motion.rs) | 🟡 PARTIAL | Time-off-map risk heuristic feeds G-Signal, now **heading-aware** (2026-07-18): the 5-min history drives a pre-vanish direction multiplier (rotating inward = gank ↑, walking out = farm ↓). No full heatmap / through-fog route prediction yet ([[software-requirements-specification]] §3.2 — inherently fog-bounded). |
| **G-Signal** | Real-time gank warning, voice interrupt (hard-latency path) | [`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs), [`capture.rs::voice_interrupt`](file:///g:/G-Maiden/src-tauri/src/capture.rs) | 🟢 SHIPPED | Edge-triggered `Alert`/`Revision` state machine; interrupt semantics ([`audio::cancel`](file:///g:/G-Maiden/src-tauri/src/audio.rs)+[`tts`](file:///g:/G-Maiden/src-tauri/src/tts.rs)); runtime-tunable sensitivity; latency harness asserts p99 in budget. **Needs CV capture** (silent in Lite / exclusive-fullscreen). |
| **G-Master** | Strategic/financial advisor (skill/item build vs enemy) | [`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs), [`counter_advice.rs`](file:///g:/G-Maiden/src-tauri/src/counter_advice.rs) | 🟢 SHIPPED | [`request_advice`](file:///g:/G-Maiden/src-tauri/src/main.rs#L243) cmd ([`main.rs:L243`](file:///g:/G-Maiden/src-tauri/src/main.rs#L243)); prompt grounded on [`runtime::known_enemies()`](file:///g:/G-Maiden/src-tauri/src/runtime.rs) + `data/item_counters.json` + self-burst. |
| **G-Sensory** | Overlay render + capture + hardware optimization | see §1.2 capture/CV + §2 overlay | 🟢 SHIPPED | Split across the CV/capture stack (below) and the frontend Overlay window. |
| **G-Log** | Feedback loop — local decision/outcome logging | [`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs) | 🟢 SHIPPED | `note_tick`/`note_event`/match archival wired in gsi + capture; timeline read, efficacy summary, privacy delete-all all exposed as commands. |

### 1.2 Capture, CV & vision

| Capability | File(s) | Status | Evidence / caveat |
| --- | --- | --- | --- |
| DXGI desktop-duplication capture | [`capture.rs`](file:///g:/G-Maiden/src-tauri/src/capture.rs), [`dxgi.rs`](file:///g:/G-Maiden/src-tauri/src/dxgi.rs) | 🟢 SHIPPED | [`capture::start`](file:///g:/G-Maiden/src-tauri/src/capture.rs) spawned ([`main.rs:L674`](file:///g:/G-Maiden/src-tauri/src/main.rs#L674)); real `IDXGIOutputDuplication`; monitor hot-swap; Lite-mode fallback emits `capture-mode="lite"`. |
| WGC capture (rollback path) | [`capture_wgc.rs`](file:///g:/G-Maiden/src-tauri/src/capture_wgc.rs) | 🟡 PARTIAL | Compiled only behind `--features wgc`; not the default backend. |
| Minimap CV detector (ONNX) | [`cv/detector.rs`](file:///g:/G-Maiden/src-tauri/src/cv/detector.rs), [`cv/prefilter.rs`](file:///g:/G-Maiden/src-tauri/src/cv/prefilter.rs), [`cv/region.rs`](file:///g:/G-Maiden/src-tauri/src/cv/region.rs) | 🟢 SHIPPED | ONNX via tract; `models/minimap-detector.onnx` (127KB) + `labels.json` present → `is_active()` true. Degrades to candidate-only if absent. |
| Draft-CV (pick-screen roster reader) | [`cv/draft_detector.rs`](file:///g:/G-Maiden/src-tauri/src/cv/draft_detector.rs), [`cv/draft_region.rs`](file:///g:/G-Maiden/src-tauri/src/cv/draft_region.rs) | 🟠 STUB | Loop path wired but **no `models/portraits/` on disk** → `recognize()` always `None`, never auto-commits a roster. Manual `set_draft_roster` cmd works. |
| Scoreboard OCR (enemy Net Worth) | [`ocr.rs`](file:///g:/G-Maiden/src-tauri/src/ocr.rs) | 🟠 STUB | `mod ocr` declared but **never called anywhere**; Phase-A scaffold, models unbundled, returns `Unavailable`. Dead in the binary. |

### 1.3 Voice, advice & cognition

| Capability | File(s) | Status | Evidence / caveat |
| --- | --- | --- | --- |
| Announcer packs (fire → banner → resolve → TTS) | [`announcer.rs`](file:///g:/G-Maiden/src-tauri/src/announcer.rs), [`voice_api.rs`](file:///g:/G-Maiden/src-tauri/src/voice_api.rs), [`audio.rs`](file:///g:/G-Maiden/src-tauri/src/audio.rs), [`tts.rs`](file:///g:/G-Maiden/src-tauri/src/tts.rs) | 🟢 SHIPPED | [`announcer::most_important`](file:///g:/G-Maiden/src-tauri/src/announcer.rs)`(observe(tick))` per game-tick ([`gsi.rs:L171`](file:///g:/G-Maiden/src-tauri/src/gsi.rs#L171)); banner emit; clip resolution pack→legacy→default→SAPI; path-traversal-hardened install. **Default pack covers 24/24 events** (v0.12.0, enforced by a `voice_api` unit test) and is a first-class read-only pack pinned first in the Voice inventory; all kill/streak tiers in-game-verified (v0.13.0). |
| G-Master self-burst / damage model | [`damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs) | 🟡 PARTIAL | [`self_burst()`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L444) (l.444) wired into [`master::build_prompt`](file:///g:/G-Maiden/src-tauri/src/master.rs); the rest (enemy-burst / dynamic lethal-HP warning) is unwired → file-level `#![allow(dead_code)]`. |
| Cognitive backends (cloud / local) | [`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs), [`slm.rs`](file:///g:/G-Maiden/src-tauri/src/slm.rs) | 🟢 SHIPPED | `MasterBackend::{Auto,Claude,Ollama}`; Claude via signed-in CLI or Anthropic Messages API (`claude-haiku-4-5`); Ollama fallback ([`slm::advise_offline`](file:///g:/G-Maiden/src-tauri/src/slm.rs)). **Gemini not wired.** |
| G-Revive (buyback advice) | [`revive.rs`](file:///g:/G-Maiden/src-tauri/src/revive.rs), [`respawn.rs`](file:///g:/G-Maiden/src-tauri/src/respawn.rs) | 🟢 SHIPPED | [`request_buyback_advice`](file:///g:/G-Maiden/src-tauri/src/main.rs#L278) cmd ([`main.rs:L278`](file:///g:/G-Maiden/src-tauri/src/main.rs#L278)); deterministic verdict + async local-SLM narrative. |

### 1.4 Server, identity & infra

| Capability | File(s) | Status | Evidence / caveat |
| --- | --- | --- | --- |
| GSI server (:3000) | [`gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs) | 🟢 SHIPPED | [`serve()`](file:///g:/G-Maiden/src-tauri/src/gsi.rs) spawned ([`main.rs:L670`](file:///g:/G-Maiden/src-tauri/src/main.rs#L670)); routes `/gsi`, `/announcer/install`, `/telemetry`, `/auth/callback`; emits `game-tick`; watchdog emits `gsi-status`. |
| Item / net-worth derivation | [`items.rs`](file:///g:/G-Maiden/src-tauri/src/items.rs) | 🟢 SHIPPED | Derived in gsi tick path. |
| GSI config detect/install | [`setup.rs`](file:///g:/G-Maiden/src-tauri/src/setup.rs) | 🟢 SHIPPED | [`dota_running`](file:///g:/G-Maiden/src-tauri/src/setup.rs), exclusive-fullscreen check, cfg install. |
| Identity / Steam link | [`identity.rs`](file:///g:/G-Maiden/src-tauri/src/identity.rs) | 🟢 SHIPPED | [`resolve_steam_id`](file:///g:/G-Maiden/src-tauri/src/identity.rs) (digit/vanity/URL forms; vanity hop via reqwest). |
| OAuth callback (login) | [`gsi.rs::oauth_callback`](file:///g:/G-Maiden/src-tauri/src/gsi.rs) + [`main.rs::oauth_begin`](file:///g:/G-Maiden/src-tauri/src/main.rs) | 🟢 SHIPPED | `/auth/callback` on :3000; CSRF-gated ([`runtime::take_oauth_pending`](file:///g:/G-Maiden/src-tauri/src/runtime.rs), single-use, time-boxed); emits `oauth-callback`. |
| Secret store (DPAPI) | [`secret.rs`](file:///g:/G-Maiden/src-tauri/src/secret.rs) | 🟢 SHIPPED | Windows DPAPI key store ([[CR-008-login-hardening]] WP-2). |
| GPU telemetry governor | [`governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs) + [`gpu-feeder/`](file:///g:/G-Maiden/gpu-feeder/) sidecar | 🟢 SHIPPED | `start`+`spawn_gpu_feeder` ([`main.rs:L677`](file:///g:/G-Maiden/src-tauri/src/main.rs#L677)); emits `resource-stats`; [`ingest_gpu`](file:///g:/G-Maiden/src-tauri/src/governor.rs) from `/telemetry`; CPU throttle read by capture loop ([`capture.rs:L306`](file:///g:/G-Maiden/src-tauri/src/capture.rs#L306)). |
| Claude quota stats | [`usage.rs`](file:///g:/G-Maiden/src-tauri/src/usage.rs) | 🟢 SHIPPED | Usage/quota surfacing. |
| Calibration (QA evidence) | [`calibration.rs`](file:///g:/G-Maiden/src-tauri/src/calibration.rs) | 🟢 SHIPPED | Off by default; writes screenshots/GIF/`audit.jsonl` locally only. |
| Utterance ledger emit (CR-011) | [`utterance.rs`](file:///g:/G-Maiden/src-tauri/src/utterance.rs) | 🟢 SHIPPED | Feeds the ON AIR console. |
| Global hotkeys / updater / window routing | [`main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs) | 🟢 SHIPPED | 4 global shortcuts; `tauri_plugin_updater`; tray + overlay/control routing in `.setup`. |

---

## 2. Frontend — Command Deck ([`src/src/`](file:///g:/G-Maiden/src/src/))

**Nav SSOT:** [`shortcuts.ts`](file:///g:/G-Maiden/src/src/shortcuts.ts) `PAGES` (7 pages). `NAV`, `Ctrl+1..7`, the Maiden Line
palette, and the shortcut sheet are all **derived** from it — rail/palette/sheet cannot drift.

### 2.1 The 7 nav pages

| # | Page (`key`) | Sub-views / tabs | File(s) | Status |
| --- | --- | --- | --- | --- |
| 1 | **Dashboard** (`dashboard`) | phase-aware single canvas: minimap mirror · ON AIR console · G-Signal cluster · phase chip · volume rail | [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) (`GMaidenFungDashboard`, `OnAirConsole`, `MinimapMirror`, `SignalGrid`, `PhaseChip`, `VolumeRail`) | 🟢 SHIPPED — live-wired via [`useCompanionData`](file:///g:/G-Maiden/src/src/companion.ts) |
| 2 | **Live** (`live`) | `[สด \| บิลด์]` (Build folded in, [[CR-013-one-canvas-sitemap-gstore-ios-settings]] W1) | [`CompanionPages.tsx`](file:///g:/G-Maiden/src/src/CompanionPages.tsx) (`LiveMatchPage`, `BuildAdvisorPage`) | 🟡 PARTIAL — score/visibility/feeds live; **objective board is honest `"—"`** placeholders; Build advisor is mock-fed |
| 3 | **Voice** (`voice`) | คลังของฉัน / ไอเทม / ตัวแก้ไข (+ cross-link → Store) | [`VoicePacksPage.tsx`](file:///g:/G-Maiden/src/src/VoicePacksPage.tsx), [`VoiceInventory.tsx`](file:///g:/G-Maiden/src/src/VoiceInventory.tsx), [`AudioSettings.tsx`](file:///g:/G-Maiden/src/src/AudioSettings.tsx) | 🟢 SHIPPED — install/activate/edit via real `voice_api_*` cmds |
| 4 | **G-Store** (`store`) | `[ร้านค้า \| กระเป๋า \| คลัง \| บันทึก]` | [`StorePage.tsx`](file:///g:/G-Maiden/src/src/StorePage.tsx), [`WalletTab.tsx`](file:///g:/G-Maiden/src/src/WalletTab.tsx), [`InventoryTab.tsx`](file:///g:/G-Maiden/src/src/InventoryTab.tsx), [`LedgerTab.tsx`](file:///g:/G-Maiden/src/src/LedgerTab.tsx), [`wallet.ts`](file:///g:/G-Maiden/src/src/wallet.ts) | 🟡 PARTIAL — **[[CR-003-account-phase1-wallet-billing]] schema live on gstore + catalog seeded (v0.11.0)**: free pack claimable, redeem codes `MAIDENFREE`/`WELCOME250` work, 2 packs coming-soon; WalletTab → LedgerTab tab-switch wired via `CommandDeck` `setStoreTab`; faucet (`mint_shard_from_match`) + payment (`credit_topup`) Edge Fns still NOT deployed (below) |
| 5 | **Insights** (`insights`) | `[ภาพรวม \| ประวัติ]` (History folded in, [[CR-013-one-canvas-sitemap-gstore-ios-settings]] W1) | [`CompanionPages.tsx`](file:///g:/G-Maiden/src/src/CompanionPages.tsx) (`InsightsPage`, `HistoryPage`), [`live/buildInsights.ts`](file:///g:/G-Maiden/src/src/live/buildInsights.ts), [`buildHistory.ts`](file:///g:/G-Maiden/src/src/live/buildHistory.ts) | 🟡 PARTIAL — real values when Steam linked (OpenDota); `"—"` NO_SENSOR sentinel otherwise; History paginates via `rowsThatFit` |
| 6 | **Account** (`account`) | บัญชี / กระเป๋า / ประวัติธุรกรรม | [`AccountPage.tsx`](file:///g:/G-Maiden/src/src/AccountPage.tsx), [`AuthPanel.tsx`](file:///g:/G-Maiden/src/src/AuthPanel.tsx), [`SteamLink.tsx`](file:///g:/G-Maiden/src/src/SteamLink.tsx), [`auth.ts`](file:///g:/G-Maiden/src/src/auth.ts), [`profile.ts`](file:///g:/G-Maiden/src/src/profile.ts), [`gid.ts`](file:///g:/G-Maiden/src/src/gid.ts) | 🟢 SHIPPED (identity) — Google OAuth + Steam link + GID mint; embeds Wallet/Ledger (same PARTIAL economy backend) |
| 7 | **Settings** (`settings`) | iOS split view — `general` + 6 Control categories | [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) split + [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) `Control`, `DeckPrefsCard`, [`useAppUpdate.ts`](file:///g:/G-Maiden/src/src/useAppUpdate.ts) | 🟢 SHIPPED — general deck-owned; overlay/voice/ai/modules/privacy/system routed to `Control` |

**Settings categories** (`SETTINGS_CATS`): ทั่วไป · Overlay · เสียง & เตือน · AI (G-Master) ·
โมดูล & CV · ความเป็นส่วนตัว · ระบบ. The in-app update banner shows on **every** category.

### 2.2 Cross-cutting frontend features

| Feature | File(s) | Status |
| --- | --- | --- |
| Live wiring → Tauri events | [`companion.ts`](file:///g:/G-Maiden/src/src/companion.ts) ([`useCompanionData`](file:///g:/G-Maiden/src/src/companion.ts)), [`live/events.ts`](file:///g:/G-Maiden/src/src/live/events.ts), `live/*` (pure builders), [`live/phase.ts`](file:///g:/G-Maiden/src/src/live/phase.ts), [`live/utterances.ts`](file:///g:/G-Maiden/src/src/live/utterances.ts) | 🟢 SHIPPED — subscribes to `game-tick`/`gsi-status`/`resource-stats`/`minimap-cv`/`draft-roster`/`gank-alert`/`enemy-missing`/`utterance`; merges over baked `MOCK` (renders offline) |
| Accounts / GID | [`auth.ts`](file:///g:/G-Maiden/src/src/auth.ts), [`profile.ts`](file:///g:/G-Maiden/src/src/profile.ts), [`supabase.ts`](file:///g:/G-Maiden/src/src/supabase.ts), [`gid.ts`](file:///g:/G-Maiden/src/src/gid.ts), [`AccountPage.tsx`](file:///g:/G-Maiden/src/src/AccountPage.tsx), [`AuthPanel.tsx`](file:///g:/G-Maiden/src/src/AuthPanel.tsx), [`SteamLink.tsx`](file:///g:/G-Maiden/src/src/SteamLink.tsx) | 🟢 SHIPPED — Google OAuth PKCE + Supabase `gstore`; GID codec + `mint-gid` edge fn |
| Economy / G-Store | [`StorePage.tsx`](file:///g:/G-Maiden/src/src/StorePage.tsx), [`WalletTab.tsx`](file:///g:/G-Maiden/src/src/WalletTab.tsx), [`InventoryTab.tsx`](file:///g:/G-Maiden/src/src/InventoryTab.tsx), [`LedgerTab.tsx`](file:///g:/G-Maiden/src/src/LedgerTab.tsx), [`wallet.ts`](file:///g:/G-Maiden/src/src/wallet.ts); `supabase/migrations/20260711120000_cr003_wallet_billing.sql` | 🟡 PARTIAL — frontend complete + **schema live on gstore, catalog seeded (v0.11.0)**: free pack + redeem codes claimable; faucet/payment Edge Fns still undeployed ([[ADR-16-credit-economy-and-mint-oracle]] §Prereq) |
| Maiden Line command palette (Ctrl+K) | `MaidenLine.tsx`, [`shortcuts.ts`](file:///g:/G-Maiden/src/src/shortcuts.ts) | 🟢 SHIPPED — verb-first bilingual, phase-aware ranking, arm/confirm Quit |
| ON AIR utterance console | [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) (`OnAirConsole`), [`live/utterances.ts`](file:///g:/G-Maiden/src/src/live/utterances.ts) | 🟢 SHIPPED — belief-revision strikethrough, LOCAL/CLOUD chip, copy-context menu |
| Phase axis (standby→prep→live→debrief) | [`live/phase.ts`](file:///g:/G-Maiden/src/src/live/phase.ts) ([`stepPhase`](file:///g:/G-Maiden/src/src/live/phase.ts)), `PhaseChip` | 🟢 SHIPPED — derived from GSI; geometry-frozen |
| In-app updater | [`useAppUpdate.ts`](file:///g:/G-Maiden/src/src/useAppUpdate.ts), [`updateChannel.ts`](file:///g:/G-Maiden/src/src/updateChannel.ts), `check_channel_update`/`install_pending_update` in [`lib.rs`](file:///g:/G-Maiden/src-tauri/src/lib.rs) | 🟡 PARTIAL — launch auto-check + banner + manual check + install/relaunch, now channel-aware: the Rust command owns the per-channel endpoint and passes no `target`, so the plugin's `{os}-{arch}-{installer}` fallback resolves the real manifest keys. Gates green (clippy/tsc/eslint/vitest/node). **Not yet proven end-to-end** — `dev.json` is at 0.13.1 vs a 0.13.2 tree, so a real self-update needs a fresh candidate |
| Overlay Combat HUD + announcer banner | [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) (`Overlay`, `packBanner`, `STREAK_LABELS`), [`overlay/FullOverlay.tsx`](file:///g:/G-Maiden/src/src/overlay/FullOverlay.tsx), [`overlay/modules.ts`](file:///g:/G-Maiden/src/src/overlay/modules.ts), [`overlay/LayoutEditor.tsx`](file:///g:/G-Maiden/src/src/overlay/LayoutEditor.tsx) | 🟢 SHIPPED — **v0.13.0: Lite+Full merged into one positionable overlay** (`uiMode` forced `'full'`, Lite/Full switch removed); every module (kill card, banner, low-HP warning, volume rail, standby chip, stats) independently toggle/resize/drag-positioned via Layout Editor; banner synced to voice via `announcer-banner`; all kill/streak tiers in-game-verified (v0.13.0) |

---

## 3. Product-level / planned features ([[product-requirements]] §3A / [[software-requirements-specification]] §3A)

Specified but **not shipped** — the "Companion Experience Extensions" layered on the six core modules.

| Feature | Priority | Intent | Status |
| --- | --- | --- | --- |
| **G-Voice** | P0 | Two-way voice: Push-to-Talk → STT → Cloud Brain → TTS, TH/EN, G-Signal can interrupt | ⚪ PLANNED — needs an STT module (not in shipped interface list) |
| **G-Memory** | P0 | Persistent cross-match player memory (heroes, death hotspots, mistakes, MMR trend); feeds G-Voice/G-Master | ⚪ PLANNED — would build on G-Log |
| **G-Coach** | P1 | Post-match deep review over the full GSI log; top-3 improvement points | ⚪ PLANNED — deep-analysis engine (overlaps the shipped DebriefTimeline surface) |
| **G-Mind** | P1 | Cognitive model router / LLM switcher (anti-vendor-lock-in) | 🟡 PARTIAL — the [`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs) backend picker covers switching; user-facing "choose LLM" UX + Gemini path not wired |
| **G-Persona** | P2 | Tone & verbosity presets without breaking Belief Revision / Interrupt / "Nerf CM" | ⚪ PLANNED |
| **G-Stream** | P2 | Streamer co-host mode + sensitive-data masking for broadcast | ⚪ PLANNED |
| **Gemini cloud engine** | — | Original [[software-requirements-specification]] design target | ⚪ PLANNED — superseded by Claude CLI/Anthropic + Ollama; "Phase-4 target" |

---

## 4. Hard non-functional constraints ([[software-requirements-specification]] §5.1 / [[product-requirements]] §5) — enforce, not aspire

| Constraint | Budget |
| --- | --- |
| **G-Signal end-to-end latency** | target **250 ms**, never exceed **300 ms** |
| Background CPU (mid-range chipset) | ≤ **2.5 %** |
| RAM (all modules active) | ≤ **400 MB** |
| Overlay FPS impact on Dota 2 | ≤ **3 %** drop; must not obscure minimap / skill bar / stats |
| Resilience | on cloud/network loss, G-Sentry + G-Signal keep running on the local SLM |
| Privacy | G-Log raw data, live match state, CV detections stay **local-only**; CV detections **never leave the machine, ever** |

> The GPU load/temp/VRAM in the deck footer (via [`gpu-feeder`](file:///g:/G-Maiden/gpu-feeder/) → `POST /telemetry`) is
> **informational only** and does not change these budgets.

---

## 5. Notable gaps (consolidated — the map's "watch list")

1. **Economy: schema + catalog live, payment still closed** — [[CR-003-account-phase1-wallet-billing]] wallet/billing schema
   was DEPLOYED to live gstore on 2026-07-17 (14 tables + RLS + RPCs, pgTAP 69/69). As of v0.11.0
   `catalog_items` is seeded (free pack claimable + 2 coming-soon) and redeem codes `MAIDENFREE`/
   `WELCOME250` work. What remains: the faucet (`mint_shard_from_match`) + payment (`credit_topup`)
   RPCs are deployed but service_role-only and their Edge Functions (`match-share-submit`/
   `payment-webhook`) are NOT deployed — gated on [[ADR-16-credit-economy-and-mint-oracle]] §Prerequisites (Valve legal status + consent/terms copy).
2. **G-Signal/G-Sentry depend on DXGI** — in Dota exclusive-fullscreen (or any DXGI-start
   failure) the app drops to **Lite mode** and the whole minimap-CV → Sentry → Motion → Signal
   chain goes silent; gank warnings are not GSI-derivable. A real functional cliff, not just degraded quality.
3. **G-Motion prediction — partially addressed (2026-07-18):** [`assess()`](file:///g:/G-Maiden/src-tauri/src/motion.rs) now reads the 5-min
   history for a pre-vanish heading multiplier (inward = gank ↑, outward = farm ↓). Still no full
   heatmap or through-fog route tracking — inherently fog-bounded (the trail ends at the vanish
   point), and "is this gank heading toward *me*" needs the player's own minimap position plumbed
   from GSI (a small future wiring task).
4. **Draft-CV is inert** — the recognizer ships but has no portrait templates on disk, so it
   never auto-reads a roster (only the manual `set_draft_roster` dev cmd). Matches "IDLE until assets".
5. **[`ocr.rs`](file:///g:/G-Maiden/src-tauri/src/ocr.rs) is fully dead code** — compiled but unreferenced; enemy-NW OCR not wired, models unbundled.
6. **[`damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs) half-wired (blocked-by-data)** — only [`self_burst`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L444) feeds G-Master; the enemy-burst /
   lethal-HP warning stays unwired because GSI is local-only and CV gives enemies identity+position
   only (no enemy level/items/HP). **Groundwork done (2026-07-18):** `GameTick` now carries absolute
   `hp`/`max_hp` (the defender-side input `is_lethal` needs). Two remaining blockers, both held: (a)
   **player armor/MR from loadout is also blocked-by-data** — `LoadoutItem`/`data/items.json` is a
   curated 12-item *offensive-burst* set with NO armor/magic-resistance fields, so deriving item armor
   needs a new defensive-item dataset authored first (hero-base armor/MR alone is computable via the
   currently-dead [`HeroData::armor_at_level`](file:///g:/G-Maiden/src-tauri/src/damage.rs), but ignoring items under-estimates effective HP); (b)
   **enemy hero-level/items/HP** needs scoreboard-CV (deferred, no OCR models bundled). Since the
   enemy side is hard-blocked, even a full player-side derivation has no consumer — held rather than
   build speculative dead code.
7. **Own-game data honesty limit** (GSI design, not a bug) — the CV chain only sees the other
   9 heroes as identity + position + missing-state; their KDA/items are unavailable.
8. **Live objective board / Insights metrics** collapse to honest `"—"` without a data source
   (GSI is local-player-only; several Insights metrics are OpenDota-only, need Steam link).

---

## 6. Related maps

- **UI sitemap / IA (SSOT):** [[05-sitemap-ia]] (`docs/design-system/05-sitemap-ia.md`)
- **UI flow-board (product-boundary + overlay):** [[g-maiden-ui-sitemap-flow-board]] (`docs/architecture/g-maiden-ui-sitemap-flow-board.md`)
- **Requirements:** [[product-requirements]] (`docs/product/product-requirements.md`) (PRD), [[software-requirements-specification]] (`docs/product/software-requirements-specification.md`) (SRS)
- **Repo layout & coding rules:** [[AGENTS.md]] · project guide: [[CLAUDE.md]]
