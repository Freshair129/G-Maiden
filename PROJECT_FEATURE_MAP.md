# PROJECT_FEATURE_MAP

> **Single-page map of every G-Maiden feature → module → implementing file(s) → status.**
> Snapshot at **v0.10.0** (2026-07-17). Status is judged from the **actual code**, not from
> comments/specs. This is a derived/maintained doc — when it disagrees with the code, the
> code wins; update this file.

**Scope:** the shipped player-facing companion app (Tauri v2 + React/Vite + Rust). The
in-repo `orchestration/` project (**G-Orchestra**, `g-maiden-orchestrator` v0.1.0) is a
separate dev-tool product and is **out of scope** here. The announcer event-contract SSOT
lives in the sibling **G-Suite** repo (`G:/G-Suite/schemas/gmaiden-events.json`); the
authoritative in-repo mirror is `src-tauri/src/voice_api.rs` (`EVENTS`).

### Status legend

| Badge | Meaning |
| --- | --- |
| 🟢 **SHIPPED** | Wired into the runtime and functional (renders/emits real data). |
| 🟡 **PARTIAL** | Works but limited, mock-fed, or blocked by an external dependency. |
| 🟠 **STUB** | Scaffold compiled but not wired / dead code / placeholder empty-state. |
| ⚪ **PLANNED** | Specified in PRD/SRS, no implementation yet. |

---

## 1. Backend — Rust core (`src-tauri/src/`)

### 1.1 The six canonical G-series modules (ADR-01 / SRS §2–3)

| Module | Responsibility | File(s) | Status | Evidence / caveat |
| --- | --- | --- | --- | --- |
| **G-Sentry** | Fog-of-war monitor (enemies missing from vision) | `sentry.rs` | 🟢 SHIPPED | Driven every frame (`capture.rs:486`); edge-triggered `enemy-missing`; confirm-hits/stale gates vs phantoms. **Dies in Lite mode** (needs DXGI). Own-game = other 9 heroes only. |
| **G-Motion** | Heatmap / last-seen positions / gank-route prediction | `motion.rs` | 🟡 PARTIAL | Time-off-map risk heuristic feeds G-Signal, now **heading-aware** (2026-07-18): the 5-min history drives a pre-vanish direction multiplier (rotating inward = gank ↑, walking out = farm ↓). No full heatmap / through-fog route prediction yet (SRS §3.2 — inherently fog-bounded). |
| **G-Signal** | Real-time gank warning, voice interrupt (hard-latency path) | `signal.rs`, `capture.rs::voice_interrupt` | 🟢 SHIPPED | Edge-triggered `Alert`/`Revision` state machine; interrupt semantics (`audio::cancel`+`tts`); runtime-tunable sensitivity; latency harness asserts p99 in budget. **Needs CV capture** (silent in Lite / exclusive-fullscreen). |
| **G-Master** | Strategic/financial advisor (skill/item build vs enemy) | `master.rs`, `counter_advice.rs` | 🟢 SHIPPED | `request_advice` cmd (`main.rs:243`); prompt grounded on `runtime::known_enemies()` + `data/item_counters.json` + self-burst. |
| **G-Sensory** | Overlay render + capture + hardware optimization | see §1.2 capture/CV + §2 overlay | 🟢 SHIPPED | Split across the CV/capture stack (below) and the frontend Overlay window. |
| **G-Log** | Feedback loop — local decision/outcome logging | `log.rs` | 🟢 SHIPPED | `note_tick`/`note_event`/match archival wired in gsi + capture; timeline read, efficacy summary, privacy delete-all all exposed as commands. |

### 1.2 Capture, CV & vision

| Capability | File(s) | Status | Evidence / caveat |
| --- | --- | --- | --- |
| DXGI desktop-duplication capture | `capture.rs`, `dxgi.rs` | 🟢 SHIPPED | `capture::start` spawned (`main.rs:674`); real `IDXGIOutputDuplication`; monitor hot-swap; Lite-mode fallback emits `capture-mode="lite"`. |
| WGC capture (rollback path) | `capture_wgc.rs` | 🟡 PARTIAL | Compiled only behind `--features wgc`; not the default backend. |
| Minimap CV detector (ONNX) | `cv/detector.rs`, `cv/prefilter.rs`, `cv/region.rs` | 🟢 SHIPPED | ONNX via tract; `models/minimap-detector.onnx` (127KB) + `labels.json` present → `is_active()` true. Degrades to candidate-only if absent. |
| Draft-CV (pick-screen roster reader) | `cv/draft_detector.rs`, `cv/draft_region.rs` | 🟠 STUB | Loop path wired but **no `models/portraits/` on disk** → `recognize()` always `None`, never auto-commits a roster. Manual `set_draft_roster` cmd works. |
| Scoreboard OCR (enemy Net Worth) | `ocr.rs` | 🟠 STUB | `mod ocr` declared but **never called anywhere**; Phase-A scaffold, models unbundled, returns `Unavailable`. Dead in the binary. |

### 1.3 Voice, advice & cognition

| Capability | File(s) | Status | Evidence / caveat |
| --- | --- | --- | --- |
| Announcer packs (fire → banner → resolve → TTS) | `announcer.rs`, `voice_api.rs`, `audio.rs`, `tts.rs` | 🟢 SHIPPED | `announcer::most_important(observe(tick))` per game-tick (`gsi.rs:171`); banner emit; clip resolution pack→legacy→default→SAPI; path-traversal-hardened install. |
| G-Master self-burst / damage model | `damage.rs` | 🟡 PARTIAL | `self_burst()` (l.444) wired into `master::build_prompt`; the rest (enemy-burst / dynamic lethal-HP warning) is unwired → file-level `#![allow(dead_code)]`. |
| Cognitive backends (cloud / local) | `master.rs`, `slm.rs` | 🟢 SHIPPED | `MasterBackend::{Auto,Claude,Ollama}`; Claude via signed-in CLI or Anthropic Messages API (`claude-haiku-4-5`); Ollama fallback (`slm::advise_offline`). **Gemini not wired.** |
| G-Revive (buyback advice) | `revive.rs`, `respawn.rs` | 🟢 SHIPPED | `request_buyback_advice` cmd (`main.rs:278`); deterministic verdict + async local-SLM narrative. |

### 1.4 Server, identity & infra

| Capability | File(s) | Status | Evidence / caveat |
| --- | --- | --- | --- |
| GSI server (:3000) | `gsi.rs` | 🟢 SHIPPED | `serve()` spawned (`main.rs:670`); routes `/gsi`, `/announcer/install`, `/telemetry`, `/auth/callback`; emits `game-tick`; watchdog emits `gsi-status`. |
| Item / net-worth derivation | `items.rs` | 🟢 SHIPPED | Derived in gsi tick path. |
| GSI config detect/install | `setup.rs` | 🟢 SHIPPED | `dota_running`, exclusive-fullscreen check, cfg install. |
| Identity / Steam link | `identity.rs` | 🟢 SHIPPED | `resolve_steam_id` (digit/vanity/URL forms; vanity hop via reqwest). |
| OAuth callback (login) | `gsi.rs::oauth_callback` + `main.rs::oauth_begin` | 🟢 SHIPPED | `/auth/callback` on :3000; CSRF-gated (`runtime::take_oauth_pending`, single-use, time-boxed); emits `oauth-callback`. |
| Secret store (DPAPI) | `secret.rs` | 🟢 SHIPPED | Windows DPAPI key store (CR-008 WP-2). |
| GPU telemetry governor | `governor.rs` + `gpu-feeder/` sidecar | 🟢 SHIPPED | `start`+`spawn_gpu_feeder` (`main.rs:677`); emits `resource-stats`; `ingest_gpu` from `/telemetry`; CPU throttle read by capture loop (`capture.rs:306`). |
| Claude quota stats | `usage.rs` | 🟢 SHIPPED | Usage/quota surfacing. |
| Calibration (QA evidence) | `calibration.rs` | 🟢 SHIPPED | Off by default; writes screenshots/GIF/`audit.jsonl` locally only. |
| Utterance ledger emit (CR-011) | `utterance.rs` | 🟢 SHIPPED | Feeds the ON AIR console. |
| Global hotkeys / updater / window routing | `main.rs` | 🟢 SHIPPED | 4 global shortcuts; `tauri_plugin_updater`; tray + overlay/control routing in `.setup`. |

---

## 2. Frontend — Command Deck (`src/src/`)

**Nav SSOT:** `src/src/shortcuts.ts` `PAGES` (7 pages). `NAV`, `Ctrl+1..7`, the Maiden Line
palette, and the shortcut sheet are all **derived** from it — rail/palette/sheet cannot drift.

### 2.1 The 7 nav pages

| # | Page (`key`) | Sub-views / tabs | File(s) | Status |
| --- | --- | --- | --- | --- |
| 1 | **Dashboard** (`dashboard`) | phase-aware single canvas: minimap mirror · ON AIR console · G-Signal cluster · phase chip · volume rail | `CommandDeck.tsx` (`GMaidenFungDashboard`, `OnAirConsole`, `MinimapMirror`, `SignalGrid`, `PhaseChip`, `VolumeRail`) | 🟢 SHIPPED — live-wired via `useCompanionData` |
| 2 | **Live** (`live`) | `[สด \| บิลด์]` (Build folded in, CR-013 W1) | `CompanionPages.tsx` (`LiveMatchPage`, `BuildAdvisorPage`) | 🟡 PARTIAL — score/visibility/feeds live; **objective board is honest `"—"`** placeholders; Build advisor is mock-fed |
| 3 | **Voice** (`voice`) | คลังของฉัน / ไอเทม / ตัวแก้ไข (+ cross-link → Store) | `VoicePacksPage.tsx`, `VoiceInventory.tsx`, `AudioSettings.tsx` | 🟢 SHIPPED — install/activate/edit via real `voice_api_*` cmds |
| 4 | **G-Store** (`store`) | `[ร้านค้า \| กระเป๋า \| คลัง \| บันทึก]` | `StorePage.tsx`, `WalletTab.tsx`, `InventoryTab.tsx`, `LedgerTab.tsx`, `wallet.ts` | 🟡 PARTIAL — frontend wired + **CR-003 schema DEPLOYED to live gstore (2026-07-17)**; catalog empty (no items seeded) so Store still shows the coming-soon state, and faucet/payment stay gated (below) |
| 5 | **Insights** (`insights`) | `[ภาพรวม \| ประวัติ]` (History folded in, CR-013 W1) | `CompanionPages.tsx` (`InsightsPage`, `HistoryPage`), `live/buildInsights.ts`, `buildHistory.ts` | 🟡 PARTIAL — real values when Steam linked (OpenDota); `"—"` NO_SENSOR sentinel otherwise; History paginates via `rowsThatFit` |
| 6 | **Account** (`account`) | บัญชี / กระเป๋า / ประวัติธุรกรรม | `AccountPage.tsx`, `AuthPanel.tsx`, `SteamLink.tsx`, `auth.ts`, `profile.ts`, `gid.ts` | 🟢 SHIPPED (identity) — Google OAuth + Steam link + GID mint; embeds Wallet/Ledger (same PARTIAL economy backend) |
| 7 | **Settings** (`settings`) | iOS split view — `general` + 6 Control categories | `CommandDeck.tsx` split + `App.tsx` `Control`, `DeckPrefsCard`, `useAppUpdate.ts` | 🟢 SHIPPED — general deck-owned; overlay/voice/ai/modules/privacy/system routed to `Control` |

**Settings categories** (`SETTINGS_CATS`): ทั่วไป · Overlay · เสียง & เตือน · AI (G-Master) ·
โมดูล & CV · ความเป็นส่วนตัว · ระบบ. The in-app update banner shows on **every** category.

### 2.2 Cross-cutting frontend features

| Feature | File(s) | Status |
| --- | --- | --- |
| Live wiring → Tauri events | `companion.ts` (`useCompanionData`), `live/events.ts`, `live/*` (pure builders), `live/phase.ts`, `live/utterances.ts` | 🟢 SHIPPED — subscribes to `game-tick`/`gsi-status`/`resource-stats`/`minimap-cv`/`draft-roster`/`gank-alert`/`enemy-missing`/`utterance`; merges over baked `MOCK` (renders offline) |
| Accounts / GID | `auth.ts`, `profile.ts`, `supabase.ts`, `gid.ts`, `AccountPage.tsx`, `AuthPanel.tsx`, `SteamLink.tsx` | 🟢 SHIPPED — Google OAuth PKCE + Supabase `gstore`; GID codec + `mint-gid` edge fn |
| Economy / G-Store | `StorePage.tsx`, `WalletTab.tsx`, `InventoryTab.tsx`, `LedgerTab.tsx`, `wallet.ts`; `supabase/migrations/20260711120000_cr003_wallet_billing.sql` | 🟡 PARTIAL — frontend complete + **schema live on gstore (2026-07-17)**; catalog empty + faucet/payment Edge Fns undeployed (ADR-16 §Prereq) |
| Maiden Line command palette (Ctrl+K) | `MaidenLine.tsx`, `shortcuts.ts` | 🟢 SHIPPED — verb-first bilingual, phase-aware ranking, arm/confirm Quit |
| ON AIR utterance console | `CommandDeck.tsx` (`OnAirConsole`), `live/utterances.ts` | 🟢 SHIPPED — belief-revision strikethrough, LOCAL/CLOUD chip, copy-context menu |
| Phase axis (standby→prep→live→debrief) | `live/phase.ts` (`stepPhase`), `PhaseChip` | 🟢 SHIPPED — derived from GSI; geometry-frozen |
| In-app updater | `useAppUpdate.ts` | 🟢 SHIPPED — launch auto-check + banner + manual check + install/relaunch |
| Overlay Combat HUD + announcer banner | `App.tsx` (`Overlay`, `packBanner`, `STREAK_LABELS`), `overlay/FullOverlay.tsx`, `overlay/modules.ts`, `overlay/LayoutEditor.tsx` | 🟢 SHIPPED — Lite tier default; Full modular tier opt-in (`uiMode='full'`); banner synced to voice via `announcer-banner` |

---

## 3. Product-level / planned features (PRD §3A / SRS §3A)

Specified but **not shipped** — the "Companion Experience Extensions" layered on the six core modules.

| Feature | Priority | Intent | Status |
| --- | --- | --- | --- |
| **G-Voice** | P0 | Two-way voice: Push-to-Talk → STT → Cloud Brain → TTS, TH/EN, G-Signal can interrupt | ⚪ PLANNED — needs an STT module (not in shipped interface list) |
| **G-Memory** | P0 | Persistent cross-match player memory (heroes, death hotspots, mistakes, MMR trend); feeds G-Voice/G-Master | ⚪ PLANNED — would build on G-Log |
| **G-Coach** | P1 | Post-match deep review over the full GSI log; top-3 improvement points | ⚪ PLANNED — deep-analysis engine (overlaps the shipped DebriefTimeline surface) |
| **G-Mind** | P1 | Cognitive model router / LLM switcher (anti-vendor-lock-in) | 🟡 PARTIAL — the `master.rs` backend picker covers switching; user-facing "choose LLM" UX + Gemini path not wired |
| **G-Persona** | P2 | Tone & verbosity presets without breaking Belief Revision / Interrupt / "Nerf CM" | ⚪ PLANNED |
| **G-Stream** | P2 | Streamer co-host mode + sensitive-data masking for broadcast | ⚪ PLANNED |
| **Gemini cloud engine** | — | Original SRS design target | ⚪ PLANNED — superseded by Claude CLI/Anthropic + Ollama; "Phase-4 target" |

---

## 4. Hard non-functional constraints (SRS §5.1 / PRD §5) — enforce, not aspire

| Constraint | Budget |
| --- | --- |
| **G-Signal end-to-end latency** | target **250 ms**, never exceed **300 ms** |
| Background CPU (mid-range chipset) | ≤ **2.5 %** |
| RAM (all modules active) | ≤ **400 MB** |
| Overlay FPS impact on Dota 2 | ≤ **3 %** drop; must not obscure minimap / skill bar / stats |
| Resilience | on cloud/network loss, G-Sentry + G-Signal keep running on the local SLM |
| Privacy | G-Log raw data, live match state, CV detections stay **local-only**; CV detections **never leave the machine, ever** |

> The GPU load/temp/VRAM in the deck footer (via `gpu-feeder` → `POST /telemetry`) is
> **informational only** and does not change these budgets.

---

## 5. Notable gaps (consolidated — the map's "watch list")

1. **Economy: schema live, store still closed** — CR-003 wallet/billing schema was DEPLOYED to
   live gstore on 2026-07-17 (14 tables + RLS + RPCs, pgTAP 69/69). What remains before the Store
   actually "opens": (a) seed `catalog_items` (currently empty → coming-soon state persists), and
   (b) the faucet (`mint_shard_from_match`) + payment (`credit_topup`) RPCs are deployed but
   service_role-only and their Edge Functions (`match-share-submit`/`payment-webhook`) are NOT
   deployed — gated on ADR-16 §Prerequisites (Valve legal status + consent/terms copy).
2. **G-Signal/G-Sentry depend on DXGI** — in Dota exclusive-fullscreen (or any DXGI-start
   failure) the app drops to **Lite mode** and the whole minimap-CV → Sentry → Motion → Signal
   chain goes silent; gank warnings are not GSI-derivable. A real functional cliff, not just degraded quality.
3. **G-Motion prediction — partially addressed (2026-07-18):** `assess()` now reads the 5-min
   history for a pre-vanish heading multiplier (inward = gank ↑, outward = farm ↓). Still no full
   heatmap or through-fog route tracking — inherently fog-bounded (the trail ends at the vanish
   point), and "is this gank heading toward *me*" needs the player's own minimap position plumbed
   from GSI (a small future wiring task).
4. **Draft-CV is inert** — the recognizer ships but has no portrait templates on disk, so it
   never auto-reads a roster (only the manual `set_draft_roster` dev cmd). Matches "IDLE until assets".
5. **`ocr.rs` is fully dead code** — compiled but unreferenced; enemy-NW OCR not wired, models unbundled.
6. **`damage.rs` half-wired (blocked-by-data)** — only `self_burst` feeds G-Master; the enemy-burst /
   lethal-HP warning stays unwired because GSI is local-only and CV gives enemies identity+position
   only (no enemy level/items/HP). **Groundwork done (2026-07-18):** `GameTick` now carries absolute
   `hp`/`max_hp` (the defender-side input `is_lethal` needs). Two remaining blockers, both held: (a)
   **player armor/MR from loadout is also blocked-by-data** — `LoadoutItem`/`data/items.json` is a
   curated 12-item *offensive-burst* set with NO armor/magic-resistance fields, so deriving item armor
   needs a new defensive-item dataset authored first (hero-base armor/MR alone is computable via the
   currently-dead `HeroData::armor_at_level`, but ignoring items under-estimates effective HP); (b)
   **enemy hero-level/items/HP** needs scoreboard-CV (deferred, no OCR models bundled). Since the
   enemy side is hard-blocked, even a full player-side derivation has no consumer — held rather than
   build speculative dead code.
7. **Own-game data honesty limit** (GSI design, not a bug) — the CV chain only sees the other
   9 heroes as identity + position + missing-state; their KDA/items are unavailable.
8. **Live objective board / Insights metrics** collapse to honest `"—"` without a data source
   (GSI is local-player-only; several Insights metrics are OpenDota-only, need Steam link).

---

## 6. Related maps

- **UI sitemap / IA (SSOT):** [docs/design-system/05-sitemap-ia.md](docs/design-system/05-sitemap-ia.md)
- **UI flow-board (product-boundary + overlay):** [docs/architecture/g-maiden-ui-sitemap-flow-board.md](docs/architecture/g-maiden-ui-sitemap-flow-board.md)
- **Requirements:** `docs/product/product-requirements.md` (PRD), `docs/product/software-requirements-specification.md` (SRS)
- **Repo layout & coding rules:** `AGENTS.md` · project guide: `CLAUDE.md`
