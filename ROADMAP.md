# G-Maiden — Masterplan & Roadmap

> Source of truth: PRD, SRS, Engineering Spec, TDD
> SemVer: MAJOR.MINOR.PATCH — release เมื่อมี feature set ครบที่ผู้ใช้สัมผัสได้

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
- [x] 42 unit tests across all modules

**Milestone v0.5.0** — ใช้ได้จริง: GSI + CV gank detection + voice alerts ครบ loop

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

**Milestone v0.6.0** — Maiden พูดไทยได้จริง + เสียง persona นุ่ม + ตัด/ต่อคลิปอัจฉริยะ

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

**Milestone v0.7.0** — Maiden เป็นนักพากย์สด: narrate + วิเคราะห์ลึก + แนะนำไอเทมเชิง meta

---

## Phase 5: Offline Resilience (Local SLM) `v0.8`

### P5.1 — Local SLM (SRS §5.2)
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
- [ ] analyze.py: precision/recall from gank_signal → outcome
- [ ] Auto-tune G-Sentry/G-Signal thresholds from match data
- [ ] tuning_state feedback → next match config (Eng §6)

### P6.3 — Post-Match Summary
- [ ] Maiden summarizes after game end (accuracy, response speed)
- [ ] Match history UI (stats, timeline, Maiden's calls vs outcomes)
- [ ] Persona line: "แมตช์หน้าฉันจะทำได้ดีกว่านี้"

**Milestone v0.9.0** — Maiden เรียนรู้จากแมตช์จริง: ทำนายแม่นขึ้นทุกเกม + สรุปผลหลังจบ

---

## Phase 7: Polish & Performance `v0.10`

### P7.1 — Resource Governor (TDD §7)
- [ ] 1Hz CPU/RAM/FPS monitor (ResourceStat event)
- [ ] Auto-throttle: CPU >2.5% → lower capture rate
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

**Milestone v1.0.0** — Production release: ครบทุกโมดูล G-Series, ผ่าน NFR ทุกข้อ, พร้อมเปิดให้ใช้จริง

---

## NFR Constraints (enforce throughout)

| Constraint | Target | Source |
|-----------|--------|--------|
| G-Signal latency | p50 ≤250ms, p99 ≤300ms | SRS §5.1 |
| Background CPU | ≤2.5% (mid-range) | SRS §5.1 |
| RAM | ≤400MB (all modules active, SLM unloaded) | SRS §5.1 |
| FPS impact | ≤3% Dota 2 FPS drop | SRS §3.5 |
| Privacy | G-Log + player stats local-only, no egress | SRS §5.2 |
| Resilience | G-Sentry + G-Signal work without cloud | SRS §5.2 |
| Persona | Gentle + intelligent + Nerf CM humor + Belief Revision | PRD §2–3 |

## Architecture Decision Records

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-01 | G- prefix on all modules | Brand unity / scalability |
| ADR-02 | Tauri v2 (not Electron) | RAM/CPU budget; transparent overlay |
| ADR-03 | Critical path = Rust only (no cloud/webview) | Latency + resilience |
| ADR-04 | G-Signal audio = cache + slot-splicing (no live synth) | Latency budget |
| ADR-05 | Enemy positions from minimap CV (GSI doesn't provide) | Functional necessity |
| ADR-06 | G-Log = local-only, no network egress | Privacy-first |
| ADR-07 | SLM lazy-load on fallback only | RAM budget |
