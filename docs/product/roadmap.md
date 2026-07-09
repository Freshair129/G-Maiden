# G-Maiden — Masterplan & Roadmap

> Source of truth: PRD, SRS, Engineering Spec, TDD
> SemVer: MAJOR.MINOR.PATCH — release เมื่อมี feature set ครบที่ผู้ใช้สัมผัสได้

---

## สถานะปัจจุบัน (updated 2026-07-03)

**Released:** v0.7.9 (2026-06-28) — announcer packs + voice-cache bundle ถึงมือผู้ใช้แล้ว
**Unreleased on `main`:** 49 commits (ถึง `a2dba63b`) = command deck live-wire (CR-002 Phase 2a/2b)
+ GID accounts / Steam identity (ADR-14) + doc sweep — **ยังไม่ถึงผู้ใช้จนกว่าจะ push tag**

> ⚠️ **Version drift:** เลขเวอร์ชันจริง (v0.7.9) วิ่งเลย milestone labels ด้านล่างแล้ว
> (Phase 3 ยัง label ว่า `v0.6`). ตั้งแต่ update นี้ milestone = **feature-gated** ไม่ผูกเลขเวอร์ชัน
> ตายตัว — label เดิมคงไว้เป็น historical reference เท่านั้น

### Now — ก่อน release ถัดไป (candidate v0.8.0, batch ใหญ่พอเป็น MINOR)
- [x] ~~**Settings จริงหายจาก deck**~~ — ปิดแล้ว `90c94c8a` (2026-07-03): `Control` เก่า
      (การ์ดตั้งค่าจริงทั้งหมด + Quota monitor) mount เข้า deck **Settings tab** ผ่าน prop
      `settingsPanel` (โหมด `embedded` ตัด header/พื้นหลังซ้ำ). ระยะยาวค่อย redesign
      การ์ดเป็นสไตล์ deck ทีละใบ
- [x] ~~**Voice Packs surface decision**~~ — ปิดแล้ว [PR #3](https://github.com/Freshair129/G-Maiden/pull/3)
      (merge `ebe55631`, 2026-07-03): port `/api/voice*` เป็น **native Tauri commands**
      (`voice_api.rs` + shim `readJson→invoke` ใน `AudioSettings.tsx`) — หน้า Voice Packs
      กลับมาใช้งานได้โดยไม่ต้องมี node backend
- [x] ~~**Deck panels ยังเป็น mock**~~ — ปิดแล้ว (2026-07-03, Phase 2c): telemetry-footer /
      `weeklyReport` / `insights` / `history` / `agentSector.status` live-wired จริงผ่าน
      `src/src/live/build{Telemetry,Weekly,Insights,History}.ts` (merge over MOCK ใน `companion.ts`)
- [x] ~~**Voice pack = เสียงในเกมจริง**~~ — ปิดแล้ว (2026-07-03): activate pack เปลี่ยนเสียง
      announcer ในเกม + banner image ของ pack โผล่บน overlay (event ใหม่ `announcer-banner`) +
      ปุ่ม "Show on overlay" (`preview_announcer_event`) ให้ preview banner+เสียงบน overlay จริง
      โดยไม่ต้องเข้าเกม
- [x] ~~**GPU/VRAM/temp telemetry**~~ — ปิดแล้ว (2026-07-03): `gpu-feeder` sidecar (own process,
      รัน nvidia-smi) PUSH sample → `POST /telemetry` :3000 → deck footer แสดง GPU load/temp + VRAM
- [ ] **Release verification** — `pnpm tauri build` จาก main → smoke: deck + overlay + DXGI
      + Settings tab (Control embedded) + Voice Packs (import/activate/preview + Show-on-overlay banner)
      + telemetry footer (GPU/VRAM) + Google-login → GID end-to-end → จึงค่อย bump + tag

### Next
- [ ] Phase 3 — Voice & Persona (Piper / audio-cache / presets — รายละเอียดด้านล่าง)
- [ ] แชร์ GID codec (`src/src/gid.ts`) เป็น shared lib ให้ G-app อื่น (G-Suite / G-Link / G-Market)
      ให้ derive GID เดียวกันจาก source fields เดียวกัน
- [ ] Generation switch: เมื่อ ecosystem เปิด Beta/Public เปลี่ยน `handle_new_user` trigger
      `gen := 'F'` → `'B'`/`'P'` ใน Supabase `gstore` (พิจารณา config table แทน hardcode)

---

## Phase 0–2: Foundation + CV Pipeline `v0.1–0.5` ✅ DONE

### P0 — Scaffold
- [x] Tauri v2 + React/Vite/Tailwind monorepo
- [x] GSI server (axum :3000) + GameTick parser
- [x] Transparent overlay + control panel (glassmorphism)
- [x] System tray + hide-to-tray

### P1 — GSI + Basic UI
- [x] GSI auto-install + Dota watchdog (CREATE_NO_WINDOW)
- [x] HP/mana danger alerts (voice + banner)
- [x] SAPI TTS via PowerShell (base64 Thai round-trip)
- [x] Settings persistence (localStorage + IPC sync)

### P2 — Minimap CV + Gank Detection
- [x] WGC screen capture (adaptive 8–15 Hz)
- [x] Color-ring prefilter + ONNX detector (128 heroes)
- [x] G-Sentry: missing >5s edge-triggered
- [x] G-Motion: 5-min ring buffer + gank probability
- [x] G-Signal: hysteresis (>85% alert, <50% clear)
- [x] Belief Revision voice retraction
- [x] Latency harness p50=21.6ms p99=67.4ms

### Infrastructure
- [x] rodio audio backend (in-process WAV, no PS flash)
- [x] In-app auto-updater (GitHub Releases + minisign)
- [x] G-Log JSONL local logging + gank event schema
- [x] G-Master basic (Claude CLI shell-out, 30s throttle)
- [x] CI/CD release workflow (tag → signed NSIS/MSI)
- [x] Changelog viewer in-app
- [x] 42 unit tests across all modules (Rust cargo suite; frontend now has 87 Vitest tests, see Phase 3+ below)

**Milestone v0.5.0** — ใช้ได้จริง: GSI + CV gank detection + voice alerts ครบ loop

### Shipped increments `v0.6.0 → v0.7.9` (มิ.ย. 2026 — งานที่ ship นอกแผน phase เดิม)
- [x] Stat toggles รายตัว + custom overlay positioning + saved profiles (v0.6.0)
- [x] **G-Damage** burst-damage calculator (v0.6.0)
- [x] **Announcer event pack system** — full GSI event taxonomy (kill / multi-kill / streak
      ladder sync กับ kill banner) + `POST /announcer/install` สำหรับ **G-AnnStudio** (v0.7.5)
- [x] Master volume + global hotkeys (Ctrl+Alt+S, Alt+↑/↓, Alt+M) (v0.7.5)
- [x] G-Master backend picker: auto / Claude / **Ollama offline** (`slm.rs`) (v0.7.5)
- [x] Capture switch WGC → **DXGI Desktop Duplication** (ADR-13 / CR-001; WGC เก็บหลัง
      `--features wgc`) + GSI-only **Lite mode** fallback
- [x] voice-cache bundled เข้า installer (v0.7.9)
- [x] **P3.5 / CR-002** — command deck live-wire + GID accounts (ดู Phase 3 ด้านล่าง)
      `merged to main, unreleased`

---

## Phase 3: Voice & Persona `v0.6` ← NEXT

### P3.1 — Piper Local Neural TTS (SRS §4.3)
- [ ] Integrate Piper ONNX via tract (reuse existing dep)
- [ ] Bundle Thai voice model (~20–60 MB) in `models/`
- [ ] Piper → rodio pipeline (synthesize → play in-process)
- [ ] Fallback chain: voice-cache WAV → Piper → SAPI

### P3.2 — Audio Cache + Slot-Splicing (ADR-04)
- [ ] Pre-render critical clips (danger, revision opener "เอ๊ะ! เดี๋ยวก่อน!")
- [ ] Slot-splicing: base sentence + dynamic hero/item name clips
- [ ] Word-boundary interrupt (cut at phoneme edge, not raw)

### P3.3 — Maiden Persona Voice
- [ ] Voice profile config (pitch, speed, warmth tuning)
- [ ] Thai caster-style intonation (Piper voice fine-tune or model select)
- [ ] UI: voice preview + A/B compare between TTS engines

### P3.4 — G-Persona: Tone & Verbosity Presets (SRS §3.11) `new`
- [ ] Verbosity axis: Silent (critical-only) ↔ Chatty (continuous caster commentary)
- [ ] Tone axis: Coach-serious ↔ Meme/casual (Nerf CM humor preserved in all modes)
- [ ] Preset picker in settings (3–4 named presets, no raw sliders)
- [ ] Constraint: never overrides Belief Revision / G-Signal Interrupt behavior

**Milestone v0.6.0** — Maiden พูดไทยได้จริง + เสียง persona นุ่ม + ตัด/ต่อคลิปอัจฉริยะ + ปรับโทนได้

### P3.5 — Accounts & GID: Google OAuth + Command Deck Live-Wire (ADR-14, CR-002) `done`
- [x] Optional, additive Google-OAuth sign-in → cross-G-series GID identity (`src/src/gid.ts`)
- [x] Backend: shared Supabase project `gstore` (profiles table + RLS)
- [x] Steam linked via `src-tauri/src/identity.rs` (`resolve_steam_id`) → public OpenDota profile + baselines
- [x] Command deck live-wired to Tauri events (game-tick, gsi-status, minimap-cv, enemy-missing, gank-alert) via `useCompanionData` → `src/src/live/` builders, merged over MOCK fallback (CR-002 Phase 2a/2b)
- [x] Privacy: match/CV/G-Log stay local; account stores identity + public data only, opt-in per ADR-11
- See `docs/architecture/adr/ADR-14-gid-account-identity.md` and `docs/change request/CR-002-Phase2-wire-backend.md`

---

## Phase 4: Cloud Brain (Gemini) `v0.7`

### P4.1 — Gemini Integration (SRS §4.2)
- [ ] Gemini 2.0 Flash streaming API client (SSE chunks)
- [ ] Context redaction — strip PII/G-Log raw before upload
- [ ] API key config in settings (encrypted local storage)
- [ ] Timeout 1500ms + circuit breaker (N fails → local fallback)

### P4.2 — Brain Router (TDD §6)
- [ ] 3-tier fallback: Cloud Gemini → Local SLM → Template engine
- [ ] Narration queue (preemptible) — G-Signal always wins
- [ ] Narrative continuity (context window across game events)

### P4.3 — G-Master Upgrade (SRS §3.4)
- [ ] Replace Claude CLI → Gemini for item/skill advice
- [ ] Net Worth comparison (player vs enemy visible items)
- [ ] Meta patch data integration (item win-rates by hero matchup)
- [ ] Persona-flavored advice with Nerf CM humor

### P4.4 — G-Voice: Two-Way Voice Conversation (SRS §3.7) `new — P0`
- [ ] STT integration (Whisper local or cloud STT) — Thai + English
- [ ] Push-to-Talk via `Alt+M` hold (reuse hotkey infra from P7.3)
- [ ] STT → Cloud Brain (Gemini) with GSI snapshot + G-Memory context injected
- [ ] Response as streamed TTS via Piper/rodio pipeline (reuse Phase 3)
- [ ] G-Signal **always preempts** G-Voice response (Interrupt guaranteed)
- [ ] Fallback: G-Voice degrades to text-overlay when cloud offline (G-Signal still works via SLM)

### P4.5 — G-Mind: Cognitive Model Router (SRS §3.10) `new — P1`
- [ ] Abstract `CloudBrainClient` trait — Gemini default, pluggable
- [ ] Config UI: model selector (Gemini / Claude / future) + API key per model
- [ ] ADR-03 preserved: critical path (G-Signal) never touches cloud router
- [ ] Local SLM fallback path unchanged (ADR-07)

**Milestone v0.7.0** — Maiden เป็นนักพากย์สด: narrate + วิเคราะห์ลึก + แนะนำไอเทม + **คุยสองทาง (G-Voice)** + สลับ LLM ได้

---

## Phase 5: Offline Resilience (Local SLM) `v0.8`

### P5.1 — Local SLM (SRS §5.2)
> `partial` — `slm.rs` ship แล้ว: Ollama-backed offline advice ผ่าน G-Master backend picker
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
- [ ] Integration test: disconnect network → G-Sentry/G-Signal still work
- [ ] SLM takeover narration within 2s of cloud fail
- [ ] Seamless recovery when cloud reconnects

**Milestone v0.8.0** — ปิดเน็ตก็ใช้ได้ครบ: gank warning + narration + advice ทำงานบน SLM/template

---

## Phase 6: Feedback Loop & Calibration `v0.9`

### P6.1 — G-Log Upgrade (SRS §3.6)
- [ ] Migrate JSONL → SQLite (matches, decisions, signals, tuning_state)
- [ ] Log Maiden decisions + actual outcomes (death/teamfight/win)
- [ ] Privacy audit: verify zero network egress from G-Log tables

### P6.2 — Probability Calibration
> `partial` — `calibration.rs` wired แล้ว (event recording + toggle จาก main.rs);
> analyze.py มีอยู่ใน `tools/analyze-log/` — เหลือจูนจริงเมื่อมี match data
- [ ] analyze.py: precision/recall from gank_signal → outcome
- [ ] Auto-tune G-Sentry/G-Signal thresholds from match data
- [ ] tuning_state feedback → next match config (Eng §6)

### P6.3 — G-Coach: Post-Match Deep Review (SRS §3.9) `upgraded — P1`
- [ ] Consume full-match GSI log (JSONL/SQLite) post-game
- [ ] Identify key decision points: avoidable deaths, item timing, teamfight positioning
- [ ] Rank top 3 improvement areas and surface in Dashboard
- [ ] Maiden voice summary + text report card (non-critical, runs after game end)
- [ ] Persona line: "แมตช์หน้าฉันจะทำได้ดีกว่านี้"

### P6.4 — G-Memory: Persistent Player Memory (SRS §3.8) `new — P0`
- [ ] Extend SQLite schema (from P6.1): hero preferences, per-zone death heatmap, MMR trend, common mistake patterns
- [ ] Memory context injector: pack top-3 relevant facts → Cloud Brain context for G-Voice / G-Master
- [ ] In-game references: Maiden cites past-match patterns in voice lines ("ครั้งก่อนตรงนี้คุณโดนแกง")
- [ ] Privacy gate: G-Memory rows flagged `local_only = true`, verified by no-egress test (P8.2)
- [ ] Memory management UI: view / delete records

**Milestone v0.9.0** — Maiden เรียนรู้จากแมตช์จริง: ทำนายแม่นขึ้นทุกเกม + **จำผู้เล่นได้ (G-Memory)** + รีวิวเชิงลึก (G-Coach)

---

## Phase 7: Polish & Performance `v0.10`

### P7.1 — Resource Governor (TDD §7)
> `partial` — `governor.rs` start ที่ launch แล้ว (main.rs:440); ยังต้อง validate throttle
> actions ครบตาม TDD §7 + วัดจริงกับ NFR budgets. **GPU-telemetry-feeder path done:**
> `gpu-feeder` sidecar รัน nvidia-smi **out-of-process** (protect NFR budget) → PUSH → `POST /telemetry`;
> governor poll ทุก **10s** (ไม่ใช่ 1Hz). FPS-impact ยัง **ไม่ instrument**
- [ ] CPU/RAM monitor ทุก 10s (ResourceStat event) — GPU/VRAM/temp via feeder ✅; FPS ยังไม่วัด
- [ ] Auto-throttle: CPU >2.5% → lower capture rate
- [ ] Investigate latest `cpu_pct` peak `20%+` against the hard `<=2.5%` budget; add sustained app-path harness and broader mitigation than capture-rate throttling alone
- [ ] Auto-throttle: RAM >400MB → unload SLM, reduce cache
- [ ] Auto-throttle: FPS drop >3% → disable blur, static HUD

### P7.2 — G-Sensory Advanced (SRS §3.5)
- [ ] Hero-element color theming (ice for CM, fire for Lina, etc.)
- [ ] Dynamic overlay positioning (avoid minimap/skill bar auto-detect)
- [ ] Resource stats display in control panel

### P7.3 — Global Hotkeys (SRS §4.1)
- [ ] Alt+M → Maiden situation summary (voice + overlay flash)
- [ ] Toggle overlay / mute / sensitivity +/- hotkeys
- [ ] Customizable hotkey config in settings

**Milestone v0.10.0** — ไม่กระทบเกม: governor ควบคุม CPU/RAM/FPS อัตโนมัติ + UX ระดับ pro

---

## Phase 8: Validation & Release `v1.0`

### P8.1 — Performance Harness (Eng §7 Definition of Done)
- [ ] G-Signal p99 ≤300ms, p50 ≤250ms (10-min harness)
- [ ] Background CPU ≤2.5% on mid-range chipset
- [ ] RAM ≤400MB (cloud-online, SLM unloaded)
- [ ] FPS drop ≤3% vs baseline (real Dota 2 match)

### P8.2 — Integration Tests
- [ ] Cloud-loss test: disconnect → G-Sentry/G-Signal + SLM fallback
- [ ] No-egress test: G-Log/player stats never leave machine
- [ ] CV accuracy validation with real Dota 2 matches
- [ ] Persona consistency audit (meme, belief revision, gentle tone)

### P8.3 — Ship It
- [ ] Vercel landing page + download
- [ ] Onboarding flow polish (first-run wizard)
- [ ] Win10 + Win11 compatibility matrix sign-off
- [ ] README + user guide

### P8.4 — G-Stream: Streamer Co-host Mode (SRS §3.12) `new — P2`
- [ ] Stream-mode toggle in settings: adjusts G-Persona verbosity to broadcast-friendly
- [ ] Sensitive data mask: MMR, G-Memory stats, raw GPM/XPM hidden from overlay during stream
- [ ] Privacy gate: verified that G-Stream mode sends zero additional data beyond existing Cloud Brain calls
- [ ] OBS-friendly overlay crop hint (leave left-side safe zone for facecam)

**Milestone v1.0.0** — Production release: ครบทุกโมดูล G-Series ทั้ง 12 โมดูล, ผ่าน NFR ทุกข้อ, พร้อมเปิดให้ใช้จริง

---

## Phase 9: Post-v1.0 / Future `vNext`

> ไม่อยู่ใน core v1.0 — delighter/differentiator + platform plays · **อย่าให้ดีเลย์ core wedge (gank warning)**

### P9.1 — Community AI Marketplace (ADR-12, ADR-11)
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
| G-Signal latency | p50 ≤250ms, p99 ≤300ms | SRS §5.1 |
| Background CPU | ≤2.5% (mid-range) | SRS §5.1 |
| RAM | ≤400MB (all modules active, SLM unloaded) | SRS §5.1 |
| FPS impact | ≤3% Dota 2 FPS drop | SRS §3.5 |
| Privacy | local-only **by default**; non-opted-in data = zero egress; opt-in sharing per ADR-11 | SRS §5.2 |
| Resilience | G-Sentry + G-Signal work without cloud; G-Voice degrades gracefully | SRS §5.2 |
| Persona | Gentle + intelligent + Nerf CM humor + Belief Revision; G-Persona presets never override these | PRD §2–3, SRS §3.11 |
| G-Voice interrupt | G-Signal always preempts G-Voice response | SRS §3.7 |
| G-Stream privacy | Stream mode adds zero extra data egress beyond normal Cloud Brain calls | SRS §3.12 |

## Architecture Decision Records

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-01 | G- prefix on all modules | Brand unity / scalability |
| ADR-02 | Tauri v2 (not Electron) | RAM/CPU budget; transparent overlay |
| ADR-03 | Critical path = Rust only (no cloud/webview) | Latency + resilience |
| ADR-04 | G-Signal audio = cache + slot-splicing (no live synth) | Latency budget |
| ADR-05 | Enemy positions from minimap CV (GSI doesn't provide) | Functional necessity |
| ADR-06 | G-Log + G-Memory = local-only by default; **opt-in sharing** allowed (amended by ADR-11) | Privacy-first |
| ADR-07 | SLM lazy-load on fallback only | RAM budget |
| ADR-08 | G-Voice = Push-to-Talk only (no always-on mic) | Privacy + CPU budget |
| ADR-09 | G-Mind router never touches G-Signal critical path | Latency guarantee |
| ADR-10 | Hybrid ingestion: GSI + CV own-state fallback + replay priors | Resilience vs GSI block · *Accepted* (`docs/architecture/adr/ADR-10-*`) |
| ADR-11 | Opt-in data contribution + match_id flywheel (amends ADR-06) | Data moat without breaking privacy · *Accepted* (`docs/architecture/adr/ADR-11-*`) |
| ADR-12 | Community AI marketplace (trainable + seasonal top-rank payout) | Network-effect moat + engagement · *Accepted, post-v1.0* (`docs/architecture/adr/ADR-12-*`) |
