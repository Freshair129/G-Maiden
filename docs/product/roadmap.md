# G-Maiden — Masterplan & Roadmap

> Source of truth: [[product-requirements|PRD]], [[software-requirements-specification|SRS]], [[engineering-spec|Engineering Spec]], [[technical-design-document|TDD]]
> SemVer: MAJOR.MINOR.PATCH — release เมื่อมี feature set ครบที่ผู้ใช้สัมผัสได้

---

## สถานะปัจจุบัน (updated 2026-07-19)

**Released:** v0.13.0 (2026-07-19) — overlay รวมเหลือแบบเดียว (Lite+Full merge, ปรับตำแหน่งเองได้ทุกชิ้น)
+ ยืนยันเสียงประกาศครบทุก multi-kill/streak tier ในเกมจริง
**Live-deployed backend:** [[CR-003-account-phase1-wallet-billing|CR-003]] economy schema (wallet/store/ledger) live บน Supabase
`gstore` ตั้งแต่ 2026-07-17; ตั้งแต่ v0.11.0 catalog seed แล้ว (แพ็กฟรี + redeem codes `MAIDENFREE`/`WELCOME250`
ใช้งานได้จริง) — faucet/payment RPC ยัง gated ตาม [[ADR-16-credit-economy-and-mint-oracle|ADR-16]]

> **Milestone = feature-gated** (ไม่ผูกเลขเวอร์ชันตายตัว). เลขเวอร์ชันจริง (v0.13.0) วิ่งเลย phase
> labels ด้านล่างไปแล้ว — label คงไว้เป็น historical reference เท่านั้น. สถานะจริงรายฟีเจอร์อยู่ที่
> **[[PROJECT_FEATURE_MAP]]** (`PROJECT_FEATURE_MAP.md` — feature → file → status).

### Shipped v0.10.0 → v0.13.0 (ก.ค. 2026) — ดู `CHANGELOG.md` สำหรับรายละเอียดทุก patch
- [x] **v0.11.0** — G-Store เปิดของจริง: แพ็กฟรี "Maiden — Community Pack" claim ได้ทันที + redeem
      codes (`MAIDENFREE` แพ็กฟรี, `WELCOME250` 250 coins) + แพ็ก coming-soon (Frost/Meme); G-Motion
      heading-aware gank risk (pre-vanish direction); resource-stats session-peak CPU/RAM; settings
      R1 no-scroll `!important` clip fix; `GameTick` abs-HP groundwork (feature-map #6)
- [x] **v0.11.1** — standby chip เลิกลอยค้างบน desktop เปล่า (โชว์เฉพาะตอนมี GSI feed จริง)
- [x] **v0.12.0** — แพ็กเสียง default ครบ 24/24 events (จากเดิม 9) + "Maiden Default (ไทย)" เป็น
      first-class read-only pack ปักหมุดแรกในคลัง; ชิปสถานะรายอีเวนต์บอก fallback chain จริง
      (`N คลิป` / `เสียงกลาง` / `TTS`) แทน "missing" หลอก
- [x] **v0.13.0** — overlay Lite+Full **รวมเป็นโมดูลเดียว**: ทุกชิ้น (การ์ดฆ่า/มัลติคิล, แบนเนอร์แพ็กเสียง,
      เตือนเลือดต่ำ, แถบเสียง, ชิป standby, สถิติ) เปิด/ปิด-ย่อขยาย-ลากวางเองได้ผ่าน Layout Editor;
      เอาสวิตช์ Lite/Full ออก (`uiMode` บังคับ `'full'`); ยืนยันเสียงประกาศ first_blood/multi-kill/
      streak ครบทุก tier ในเกมจริง; big mode default เปิด (แก้ black frame บนหน้าต่างใหญ่)

### Shipped v0.8.0 → v0.10.0 (มิ.ย.–ก.ค. 2026)
- [x] **[[CR-007-frostline-deck-refresh|CR-006/007]]** design-system shell (liquid glass, fixed stage 1420×760) + materials &
      tokens (feathered ambient shadows, IBM Plex bundled)
- [x] **[[CR-008-login-hardening|CR-008]]** security hardening — DPAPI secret store ([`secret.rs`](file:///g:/G-Maiden/src-tauri/src/secret.rs) WP-2) + `/auth/callback` login-CSRF gate
      (WP-3); voice-pack manifest path-traversal/zip-slip closed
- [x] **[[CR-011-cold-booth-ux-direction|CR-011]] COLD BOOTH** — broadcast-booth deck: phase axis (standby→prep→live→debrief), ON AIR
      utterance ledger + Belief Revision strikethrough, Maiden Line palette (Ctrl+K), quality tiers,
      opt-in big mode
- [x] **[[CR-013-one-canvas-sitemap-gstore-ios-settings|CR-013]] ONE CANVAS** — 7-page sitemap (`Ctrl+1..7`), Build→Live tab, History→Insights tab,
      **G-Store** nav seat, iOS-style Settings split view; standing laws R1/R2/R3 (no page-level scroll)
- [x] **CR-012** multi-monitor CV auto-detect + GDI fallback + phantom-hero tuning
- [x] **[[CR-003-account-phase1-wallet-billing|CR-003]] economy DEPLOYED LIVE** — wallet/store/ledger/RPC schema on `gstore` (69/69 pgTAP,
      advisors clean); catalog seeded (free pack + 2 coming-soon), redeem codes (item + coins),
      coin_packages (hidden); every RPC + payment-webhook flow behaviorally verified. Faucet/payment
      Edge Fns intentionally NOT deployed — see [[CR-003-payment-golive-checklist]]
- [x] **G-Motion heading-aware** gank risk (pre-vanish direction) + `GameTick` abs-HP groundwork (#6)

### Now — งานถัดไป (candidate next MINOR)
- [ ] **Phase 7 NFR — FPS-drop measurement** — CPU/RAM legs of the closeout are **CLOSED** (see Phase 7
      below: release core 0.12% CPU / 66MB RAM). Only the FPS-drop ≤3% leg remains, and it's
      **measurement-blocked (Boss-run)**: needs a live Dota match + PresentMon.exe + ETW/admin.
- [ ] **Phase 3 Voice** — Piper local-ONNX TTS แทน SAPI default + audio-cache slot-splicing +
      G-Persona presets (รายละเอียดด้านล่าง)
- [ ] **Payment go-live** — ตาม [[CR-003-payment-golive-checklist|CR-003 checklist]]: Phase 0 legal/terms + Phase 1 Omise (Boss) →
      Phase 2 deploy Edge Fns (assistant) → flip `coin_packages.active`

### Next
- [ ] **Phase 6** — G-Log JSONL → SQLite → **G-Memory** (persistent player memory) + **G-Coach** (post-match review)
- [ ] **Phase 4** — Cloud Brain: **G-Voice** (Push-to-Talk STT → brain → TTS) + **G-Mind** model-router UX
      (Gemini path superseded by shipped Claude/Ollama — see Phase 4 note)
- [ ] แชร์ GID codec ([`gid.ts`](file:///g:/G-Maiden/src/src/gid.ts)) เป็น shared lib ให้ G-app อื่น (G-Suite / G-Link / G-Market)
- [ ] Generation switch: [`handle_new_user`](file:///g:/G-Maiden/src-tauri/src/gsi.rs) trigger `gen := 'F'` → `'B'`/`'P'` เมื่อเปิด Beta/Public
- [ ] **Phase 9** — Community marketplace UI บน economy ที่ deploy แล้ว (post-v1.0, [[ADR-12-community-ai-marketplace|ADR-12]])

---

## Phase 0–2: Foundation + CV Pipeline `v0.1–0.5` ✅ DONE

### P0 — Scaffold
- [x] Tauri v2 + React/Vite/Tailwind monorepo
- [x] GSI server (axum :3000) + GameTick parser — [`gsi.rs`](file:///g:/G-Maiden/src-tauri/src/gsi.rs)
- [x] Transparent overlay + control panel (glassmorphism) — [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx)
- [x] System tray + hide-to-tray — [`main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs)

### P1 — GSI + Basic UI
- [x] GSI auto-install + Dota watchdog (`CREATE_NO_WINDOW`) — [`setup.rs`](file:///g:/G-Maiden/src-tauri/src/setup.rs)
- [x] HP/mana danger alerts (voice + banner) — [`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs)
- [x] SAPI TTS via PowerShell (base64 Thai round-trip) — [`tts.rs`](file:///g:/G-Maiden/src-tauri/src/tts.rs)
- [x] Settings persistence (localStorage + IPC sync)

### P2 — Minimap CV + Gank Detection
- [x] WGC screen capture (adaptive 8–15 Hz) — [`capture_wgc.rs`](file:///g:/G-Maiden/src-tauri/src/capture_wgc.rs) (now behind `--features wgc`)
- [x] Color-ring prefilter + ONNX detector (128 heroes) — [`cv/prefilter.rs`](file:///g:/G-Maiden/src-tauri/src/cv/prefilter.rs), [`cv/detector.rs`](file:///g:/G-Maiden/src-tauri/src/cv/detector.rs)
- [x] G-Sentry: missing >5s edge-triggered — [`sentry.rs`](file:///g:/G-Maiden/src-tauri/src/sentry.rs)
- [x] G-Motion: 5-min ring buffer + gank probability — [`motion.rs`](file:///g:/G-Maiden/src-tauri/src/motion.rs)
- [x] G-Signal: hysteresis (>85% alert, <50% clear) — [`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs)
- [x] Belief Revision voice retraction — [`signal.rs::Revision`](file:///g:/G-Maiden/src-tauri/src/signal.rs)
- [x] Latency harness p50=21.6ms p99=67.4ms

### Infrastructure
- [x] rodio audio backend (in-process WAV, no PS flash) — [`audio.rs`](file:///g:/G-Maiden/src-tauri/src/audio.rs)
- [x] In-app auto-updater (GitHub Releases + minisign) — [`useAppUpdate.ts`](file:///g:/G-Maiden/src/src/useAppUpdate.ts)
- [x] G-Log JSONL local logging + gank event schema — [`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs)
- [x] G-Master basic (Claude CLI shell-out, 30s throttle) — [`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs)
- [x] CI/CD release workflow (tag → signed NSIS/MSI) — [`.github/workflows/release.yml`](file:///g:/G-Maiden/.github/workflows/release.yml)
- [x] Changelog viewer in-app
- [x] 42 unit tests across all modules (Rust cargo suite; frontend now has 87 Vitest tests, see Phase 3+ below)

**Milestone v0.5.0** — ใช้ได้จริง: GSI + CV gank detection + voice alerts ครบ loop

### Shipped increments `v0.6.0 → v0.7.9` (มิ.ย. 2026 — งานที่ ship นอกแผน phase เดิม)
- [x] Stat toggles รายตัว + custom overlay positioning + saved profiles (v0.6.0)
- [x] **G-Damage** burst-damage calculator (v0.6.0) — [`damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs)
- [x] **Announcer event pack system** — full GSI event taxonomy (kill / multi-kill / streak
      ladder sync กับ kill banner) + `POST /announcer/install` สำหรับ **G-AnnStudio** (v0.7.5) — [`announcer.rs`](file:///g:/G-Maiden/src-tauri/src/announcer.rs), [`voice_api.rs`](file:///g:/G-Maiden/src-tauri/src/voice_api.rs)
- [x] Master volume + global hotkeys (Ctrl+Alt+S, Alt+↑/↓, Alt+M) (v0.7.5) — [`main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs)
- [x] G-Master backend picker: auto / Claude / **Ollama offline** ([`slm.rs`](file:///g:/G-Maiden/src-tauri/src/slm.rs)) (v0.7.5)
- [x] Capture switch WGC → **DXGI Desktop Duplication** ([[ADR-13-dxgi-capture-migration|ADR-13]] / [[CR-001-REVIEW-and-execution-plan|CR-001]]; WGC เก็บหลัง
      `--features wgc`) + GSI-only **Lite mode** fallback — [`capture.rs`](file:///g:/G-Maiden/src-tauri/src/capture.rs), [`dxgi.rs`](file:///g:/G-Maiden/src-tauri/src/dxgi.rs)
- [x] voice-cache bundled เข้า installer (v0.7.9)
- [x] **P3.5 / [[CR-002-Phase2-wire-backend|CR-002]]** — command deck live-wire + GID accounts (ดู Phase 3 ด้านล่าง)
      `merged to main, unreleased`

---

## Phase 3: Voice & Persona `v0.6`

> **Status (v0.10.0):** P3.5 (Accounts & GID) shipped. The **voice/persona half is still open** —
> Piper TTS, audio-cache slot-splicing, and G-Persona presets are all PLANNED (TTS today is Windows
> SAPI via PowerShell). This is the top "Now" item alongside the Phase 7 NFR closeout.

### P3.1 — Piper Local Neural TTS ([[software-requirements-specification|SRS]] §4.3)
- [ ] Integrate Piper ONNX via tract (reuse existing dep)
- [ ] Bundle Thai voice model (~20–60 MB) in `models/`
- [ ] Piper → rodio pipeline (synthesize → play in-process) — extend [`audio.rs`](file:///g:/G-Maiden/src-tauri/src/audio.rs)
- [ ] Fallback chain: voice-cache WAV → Piper → SAPI — [`tts.rs`](file:///g:/G-Maiden/src-tauri/src/tts.rs)

### P3.2 — Audio Cache + Slot-Splicing (ADR-04)
- [ ] Pre-render critical clips (danger, revision opener "เอ๊ะ! เดี๋ยวก่อน!")
- [ ] Slot-splicing: base sentence + dynamic hero/item name clips
- [ ] Word-boundary interrupt (cut at phoneme edge, not raw)

### P3.3 — Maiden Persona Voice
- [ ] Voice profile config (pitch, speed, warmth tuning)
- [ ] Thai caster-style intonation (Piper voice fine-tune or model select)
- [ ] UI: voice preview + A/B compare between TTS engines — [`AudioSettings.tsx`](file:///g:/G-Maiden/src/src/AudioSettings.tsx)

### P3.4 — G-Persona: Tone & Verbosity Presets ([[software-requirements-specification|SRS]] §3.11) `new`
- [ ] Verbosity axis: Silent (critical-only) ↔ Chatty (continuous caster commentary)
- [ ] Tone axis: Coach-serious ↔ Meme/casual (Nerf CM humor preserved in all modes)
- [ ] Preset picker in settings (3–4 named presets, no raw sliders)
- [ ] Constraint: never overrides Belief Revision / G-Signal Interrupt behavior

**Milestone v0.6.0** — Maiden พูดไทยได้จริง + เสียง persona นุ่ม + ตัด/ต่อคลิปอัจฉริยะ + ปรับโทนได้

### P3.5 — Accounts & GID: Google OAuth + Command Deck Live-Wire ([[ADR-14-gid-account-identity|ADR-14]], [[CR-002-Phase2-wire-backend|CR-002]]) `done`
- [x] Optional, additive Google-OAuth sign-in → cross-G-series GID identity ([`gid.ts`](file:///g:/G-Maiden/src/src/gid.ts))
- [x] Backend: shared Supabase project `gstore` (profiles table + RLS) — [`supabase.ts`](file:///g:/G-Maiden/src/src/supabase.ts)
- [x] Steam linked via [`identity.rs`](file:///g:/G-Maiden/src-tauri/src/identity.rs) ([`resolve_steam_id`](file:///g:/G-Maiden/src-tauri/src/identity.rs)) → public OpenDota profile + baselines
- [x] Command deck live-wired to Tauri events (game-tick, gsi-status, minimap-cv, enemy-missing, gank-alert) via [`useCompanionData`](file:///g:/G-Maiden/src/src/companion.ts) → [`live/`](file:///g:/G-Maiden/src/src/live/) builders, merged over MOCK fallback ([[CR-002-Phase2-wire-backend|CR-002]] Phase 2a/2b)
- [x] Privacy: match/CV/G-Log stay local; account stores identity + public data only, opt-in per [[ADR-11-optin-data-contribution-flywheel|ADR-11]]
- See [[ADR-14-gid-account-identity]] and [[CR-002-Phase2-wire-backend]]

---

## Phase 4: Cloud Brain (Gemini) `v0.7`

> **Reality diverged (as of v0.10.0):** the shipped cloud path is the **Claude CLI / Anthropic
> Messages API** (`claude-haiku-4-5`) with an **Ollama** local-SLM fallback ([`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs),
> backends `Auto | Claude | Ollama`) — **Gemini was never wired**. P4.3 G-Master basic (counter-
> advice on CV enemies + self-burst) shipped on that path; enemy Net Worth comparison is
> blocked-by-data (own-game GSI + CV give no enemy items). G-Voice (P4.4) and the G-Mind model-
> router UX (P4.5) remain PLANNED. Treat "Gemini" below as "cloud LLM" — the engine choice is
> settled (Claude), not open.

### P4.1 — Gemini Integration ([[software-requirements-specification|SRS]] §4.2)
- [ ] Gemini 2.0 Flash streaming API client (SSE chunks)
- [ ] Context redaction — strip PII/G-Log raw before upload
- [ ] API key config in settings (encrypted local storage) — [`secret.rs`](file:///g:/G-Maiden/src-tauri/src/secret.rs)
- [ ] Timeout 1500ms + circuit breaker (N fails → local fallback)

### P4.2 — Brain Router ([[technical-design-document|TDD]] §6)
- [ ] 3-tier fallback: Cloud Gemini → Local SLM → Template engine
- [ ] Narration queue (preemptible) — G-Signal always wins
- [ ] Narrative continuity (context window across game events)

### P4.3 — G-Master Upgrade ([[software-requirements-specification|SRS]] §3.4)
- [ ] Replace Claude CLI → Gemini for item/skill advice — [`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs)
- [ ] Net Worth comparison (player vs enemy visible items) — [`items.rs`](file:///g:/G-Maiden/src-tauri/src/items.rs)
- [ ] Meta patch data integration (item win-rates by hero matchup)
- [ ] Persona-flavored advice with Nerf CM humor

### P4.4 — G-Voice: Two-Way Voice Conversation ([[software-requirements-specification|SRS]] §3.7) `new — P0`
- [ ] STT integration (Whisper local or cloud STT) — Thai + English
- [ ] Push-to-Talk via `Alt+M` hold (reuse hotkey infra from P7.3) — [`main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs)
- [ ] STT → Cloud Brain (Gemini) with GSI snapshot + G-Memory context injected
- [ ] Response as streamed TTS via Piper/rodio pipeline (reuse Phase 3) — [`audio.rs`](file:///g:/G-Maiden/src-tauri/src/audio.rs)
- [ ] G-Signal **always preempts** G-Voice response (Interrupt guaranteed) — [`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs)
- [ ] Fallback: G-Voice degrades to text-overlay when cloud offline (G-Signal still works via SLM)

### P4.5 — G-Mind: Cognitive Model Router ([[software-requirements-specification|SRS]] §3.10) `new — P1`
- [ ] Abstract `CloudBrainClient` trait — Gemini default, pluggable
- [ ] Config UI: model selector (Gemini / Claude / future) + API key per model
- [ ] ADR-03 preserved: critical path (G-Signal) never touches cloud router
- [ ] Local SLM fallback path unchanged (ADR-07) — [`slm.rs`](file:///g:/G-Maiden/src-tauri/src/slm.rs)

**Milestone v0.7.0** — Maiden เป็นนักพากย์สด: narrate + วิเคราะห์ลึก + แนะนำไอเทม + **คุยสองทาง (G-Voice)** + สลับ LLM ได้

---

## Phase 5: Offline Resilience (Local SLM) `v0.8`

### P5.1 — Local SLM ([[software-requirements-specification|SRS]] §5.2)
> `partial` — [`slm.rs`](file:///g:/G-Maiden/src-tauri/src/slm.rs) ship แล้ว: Ollama-backed offline advice ผ่าน G-Master backend picker
> (v0.7.5). ที่ยังเปิดอยู่คือ embedded lazy-load ตาม ADR-07 (ไม่พึ่ง Ollama ภายนอก) + model
> download manager. Model picks ปัจจุบัน: Llama-3.2-1B Q4 (G-Signal), Typhoon2-3B Thai (G-Master)
- [ ] Qwen2.5-0.5B/1.5B Q4 via llama-cpp-rs or candle
- [ ] Lazy-load only on cloud disconnect (ADR-07)
- [ ] Model download manager (on-demand, not bundled)
- [ ] Persona prompt tuning for small model

### P5.2 — Template Engine (always-available fallback)
- [ ] Parameterized Thai templates per game event
- [ ] Hero-name / item-name slot filling
- [ ] Meme-aware variants (Nerf CM, self-deprecation pool)

### P5.3 — Cloud-loss Test
- [ ] Integration test: disconnect network → G-Sentry/G-Signal still work — [`sentry.rs`](file:///g:/G-Maiden/src-tauri/src/sentry.rs), [`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs)
- [ ] SLM takeover narration within 2s of cloud fail — [`slm.rs`](file:///g:/G-Maiden/src-tauri/src/slm.rs)
- [ ] Seamless recovery when cloud reconnects

**Milestone v0.8.0** — ปิดเน็ตก็ใช้ได้ครบ: gank warning + narration + advice ทำงานบน SLM/template

---

## Phase 6: Feedback Loop & Calibration `v0.9`

### P6.1 — G-Log Upgrade ([[software-requirements-specification|SRS]] §3.6)
- [ ] Migrate JSONL → SQLite (matches, decisions, signals, tuning_state) — [`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs)
- [ ] Log Maiden decisions + actual outcomes (death/teamfight/win)
- [ ] Privacy audit: verify zero network egress from G-Log tables

### P6.2 — Probability Calibration
> `partial` — [`calibration.rs`](file:///g:/G-Maiden/src-tauri/src/calibration.rs) wired แล้ว (event recording + toggle จาก [`main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs));
> [`analyze.py`](file:///g:/G-Maiden/tools/analyze-log/analyze.py) มีอยู่ใน `tools/analyze-log/` — เหลือจูนจริงเมื่อมี match data
- [ ] [`analyze.py`](file:///g:/G-Maiden/tools/analyze-log/analyze.py): precision/recall from gank_signal → outcome
- [ ] Auto-tune G-Sentry/G-Signal thresholds from match data — [`sentry.rs`](file:///g:/G-Maiden/src-tauri/src/sentry.rs), [`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs)
- [ ] tuning_state feedback → next match config ([[engineering-spec|Eng]] §6)

### P6.3 — G-Coach: Post-Match Deep Review ([[software-requirements-specification|SRS]] §3.9) `upgraded — P1`
- [ ] Consume full-match GSI log (JSONL/SQLite) post-game
- [ ] Identify key decision points: avoidable deaths, item timing, teamfight positioning
- [ ] Rank top 3 improvement areas and surface in Dashboard — [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx)
- [ ] Maiden voice summary + text report card (non-critical, runs after game end) — [`tts.rs`](file:///g:/G-Maiden/src-tauri/src/tts.rs)
- [ ] Persona line: "แมตช์หน้าฉันจะทำได้ดีกว่านี้"

### P6.4 — G-Memory: Persistent Player Memory ([[software-requirements-specification|SRS]] §3.8) `new — P0`
- [ ] Extend SQLite schema (from P6.1): hero preferences, per-zone death heatmap, MMR trend, common mistake patterns
- [ ] Memory context injector: pack top-3 relevant facts → Cloud Brain context for G-Voice / G-Master — [`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs)
- [ ] In-game references: Maiden cites past-match patterns in voice lines ("ครั้งก่อนตรงนี้คุณโดนแกง")
- [ ] Privacy gate: G-Memory rows flagged `local_only = true`, verified by no-egress test (P8.2)
- [ ] Memory management UI: view / delete records

**Milestone v0.9.0** — Maiden เรียนรู้จากแมตช์จริง: ทำนายแม่นขึ้นทุกเกม + **จำผู้เล่นได้ (G-Memory)** + รีวิวเชิงลึก (G-Coach)

---

## Phase 7: Polish & Performance `v0.10`

### P7.1 — Resource Governor ([[technical-design-document|TDD]] §7)
> **NFR CLOSEOUT (2026-07-18)** — measured the **release** build with `tests/perf/` harnesses:
> **CPU ≤2.5% MET** ([`perf_cpu_tree`](file:///g:/G-Maiden/tests/perf/src/bin/perf_cpu_tree.rs), idle steady-state): grouped-tree mean 0.61% / p95 1.54%; the
> Rust core `g-maiden.exe` is **0.12%** + gpu-feeder 0.12%. The earlier "6–7%" was a **debug-build
> artifact** (confirmed). The one over-budget sample was a transient WebView2 spike (7.69%) while the
> **deck was visible** — drops out in-game (deck hidden, overlay-only). **RAM ≤400MB MET**: own-process
> 66 MB ([`perf_p7`](file:///g:/G-Maiden/tests/perf/src/bin/perf_p7.rs) `--pid`). Governor polls **10s**; CPU|RAM over-budget → capture-rate throttle ~2 Hz
> (real + wired, [`governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs)→[`capture.rs`](file:///g:/G-Maiden/src-tauri/src/capture.rs)); **session-peak cpu/ram now on `resource-stats`** for
> in-app proof over a match. GPU/VRAM/temp via [`gpu-feeder`](file:///g:/G-Maiden/gpu-feeder/) (out-of-process, off-budget).
- [x] CPU/RAM monitor ทุก 10s (`resource-stats`) + session-peak fields — [`governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs)
- [x] Auto-throttle CPU >2.5% → lower capture rate (real + wired to [`capture.rs`](file:///g:/G-Maiden/src-tauri/src/capture.rs))
- [x] CPU-budget investigation **CLOSED** — 6–7% = debug; release core **0.12% CPU / 66 MB RAM**
- [~] RAM >2.5% → unload SLM / reduce cache — **N/A**: shipped SLM = external Ollama (separate
      process, not in the app's working set) → nothing in-process to unload; RAM breach reuses the
      capture throttle instead. Superseded by the external-Ollama choice.
- [ ] FPS drop ≤3% → disable blur — **measurement-blocked (Boss-run):** [`perf_p7`](file:///g:/G-Maiden/tests/perf/src/bin/perf_p7.rs) PresentMon A/B
      harness is built but needs a live Dota match + PresentMon.exe + ETW/admin + manual overlay
      toggle (`--fps-baseline` overlay-off → start overlay → `--fps-overlay`). No FPS signal reaches
      the governor, so the "disable blur" action has no trigger yet — deferred until a source exists.

### P7.2 — G-Sensory Advanced ([[software-requirements-specification|SRS]] §3.5)
- [ ] Hero-element color theming (ice for CM, fire for Lina, etc.)
- [x] Manual overlay module positioning — [`overlay/LayoutEditor.tsx`](file:///g:/G-Maiden/src/src/overlay/LayoutEditor.tsx) (v0.13.0, single merged
      overlay, every module drag/resize/toggle); auto-detect-avoid-minimap/skill-bar remains `[ ]`
- [x] Resource stats display in control panel — [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx)

### P7.3 — Global Hotkeys ([[software-requirements-specification|SRS]] §4.1)
- [ ] Alt+M → Maiden situation summary (voice + overlay flash) — [`main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs)
- [ ] Toggle overlay / mute / sensitivity +/- hotkeys
- [ ] Customizable hotkey config in settings

**Milestone v0.10.0** — ไม่กระทบเกม: governor ควบคุม CPU/RAM/FPS อัตโนมัติ + UX ระดับ pro

---

## Phase 8: Validation & Release `v1.0`

### P8.1 — Performance Harness ([[engineering-spec|Eng]] §7 Definition of Done)
- [ ] G-Signal p99 ≤300ms, p50 ≤250ms (10-min harness) — [`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs)
- [ ] Background CPU ≤2.5% on mid-range chipset — [`governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs)
- [ ] RAM ≤400MB (cloud-online, SLM unloaded)
- [ ] FPS drop ≤3% vs baseline (real Dota 2 match)

### P8.2 — Integration Tests
- [ ] Cloud-loss test: disconnect → G-Sentry/G-Signal + SLM fallback — [`sentry.rs`](file:///g:/G-Maiden/src-tauri/src/sentry.rs), [`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs), [`slm.rs`](file:///g:/G-Maiden/src-tauri/src/slm.rs)
- [ ] No-egress test: G-Log/player stats never leave machine — [`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs)
- [ ] CV accuracy validation with real Dota 2 matches — [`cv/detector.rs`](file:///g:/G-Maiden/src-tauri/src/cv/detector.rs)
- [ ] Persona consistency audit (meme, belief revision, gentle tone)

### P8.3 — Ship It
- [ ] Vercel landing page + download
- [ ] Onboarding flow polish (first-run wizard)
- [ ] Win10 + Win11 compatibility matrix sign-off
- [ ] README + user guide

### P8.4 — G-Stream: Streamer Co-host Mode ([[software-requirements-specification|SRS]] §3.12) `new — P2`
- [ ] Stream-mode toggle in settings: adjusts G-Persona verbosity to broadcast-friendly
- [ ] Sensitive data mask: MMR, G-Memory stats, raw GPM/XPM hidden from overlay during stream
- [ ] Privacy gate: verified that G-Stream mode sends zero additional data beyond existing Cloud Brain calls
- [ ] OBS-friendly overlay crop hint (leave left-side safe zone for facecam)

**Milestone v1.0.0** — Production release: ครบทุกโมดูล G-Series ทั้ง 12 โมดูล, ผ่าน NFR ทุกข้อ, พร้อมเปิดให้ใช้จริง

---

## Phase 9: Post-v1.0 / Future `vNext`

> ไม่อยู่ใน core v1.0 — delighter/differentiator + platform plays · **อย่าให้ดีเลย์ core wedge (gank warning)**

### P9.1 — Community AI Marketplace ([[ADR-12-community-ai-marketplace|ADR-12]], [[ADR-11-optin-data-contribution-flywheel|ADR-11]])
- [ ] UGC trainable styles (persona → advice-logic → bot **practice/sandbox-only**)
- [ ] rating/ranking + **seasonal top-rank cash payout** (self-fund จาก take-rate) + anti-gaming
- [ ] opt-in data flywheel — match_id ground-truth dataset (privacy: local-first + credit)

### P9.2 — G-Score: Dynamic GSI-driven Soundtrack `new` (FEAT-G-SCORE)
- [ ] event→music trigger map (Roshan=boss music, clutch=epic sting, teamfight=combat)
- [ ] AI-music packs (**DMCA-safe**) + audio hierarchy (voice > SFX > soundtrack, ไม่ต้อง duck ก้าวร้าว)
- [ ] synergy: **G-Stream** (เพลงปลอด DMCA สำหรับสตรีมเมอร์) + **Marketplace** (community soundtrack packs)

**Milestone vNext** — platform + delighter layer: marketplace creator economy + adaptive soundtrack

---

## NFR Constraints (enforce throughout)

| Constraint | Target | Source |
|-----------|--------|--------|
| G-Signal latency | p50 ≤250ms, p99 ≤300ms | [[software-requirements-specification|SRS]] §5.1 |
| Background CPU | ≤2.5% (mid-range) | [[software-requirements-specification|SRS]] §5.1 |
| RAM | ≤400MB (all modules active, SLM unloaded) | [[software-requirements-specification|SRS]] §5.1 |
| FPS impact | ≤3% Dota 2 FPS drop | [[software-requirements-specification|SRS]] §3.5 |
| Privacy | local-only **by default**; non-opted-in data = zero egress; opt-in sharing per [[ADR-11-optin-data-contribution-flywheel|ADR-11]] | [[software-requirements-specification|SRS]] §5.2 |
| Resilience | G-Sentry + G-Signal work without cloud; G-Voice degrades gracefully | [[software-requirements-specification|SRS]] §5.2 |
| Persona | Gentle + intelligent + Nerf CM humor + Belief Revision; G-Persona presets never override these | [[product-requirements|PRD]] §2–3, [[software-requirements-specification|SRS]] §3.11 |
| G-Voice interrupt | G-Signal always preempts G-Voice response | [[software-requirements-specification|SRS]] §3.7 |
| G-Stream privacy | Stream mode adds zero extra data egress beyond normal Cloud Brain calls | [[software-requirements-specification|SRS]] §3.12 |

## Architecture Decision Records

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-01 | G- prefix on all modules | Brand unity / scalability |
| ADR-02 | Tauri v2 (not Electron) | RAM/CPU budget; transparent overlay |
| ADR-03 | Critical path = Rust only (no cloud/webview) | Latency + resilience |
| ADR-04 | G-Signal audio = cache + slot-splicing (no live synth) | Latency budget |
| ADR-05 | Enemy positions from minimap CV (GSI doesn't provide) | Functional necessity |
| ADR-06 | G-Log + G-Memory = local-only by default; **opt-in sharing** allowed (amended by [[ADR-11-optin-data-contribution-flywheel|ADR-11]]) | Privacy-first |
| ADR-07 | SLM lazy-load on fallback only | RAM budget |
| ADR-08 | G-Voice = Push-to-Talk only (no always-on mic) | Privacy + CPU budget |
| ADR-09 | G-Mind router never touches G-Signal critical path | Latency guarantee |
| [[ADR-10-hybrid-ingestion-resilience|ADR-10]] | Hybrid ingestion: GSI + CV own-state fallback + replay priors | Resilience vs GSI block · *Accepted* |
| [[ADR-11-optin-data-contribution-flywheel|ADR-11]] | Opt-in data contribution + match_id flywheel (amends ADR-06) | Data moat without breaking privacy · *Accepted* |
| [[ADR-12-community-ai-marketplace|ADR-12]] | Community AI marketplace (trainable + seasonal top-rank payout) | Network-effect moat + engagement · *Accepted, post-v1.0* |
