# AGENTS.md

> Context and governance for AI coding agents (Codex, Claude Code, Copilot, etc.)
> working on the G-Maiden codebase. Read this before touching any file.

---

## What is G-Maiden?

A **real-time AI companion for Dota 2** that narrates and advises during live matches via voice + transparent on-screen overlay. It reads live game data through Valve's **GSI (Game State Integration)** and reacts within a strict latency budget without disrupting the player's focus.

The persona is "**Maiden**" — inspired by Dota 2's Crystal Maiden. Gentle, intelligent, statistically credible, meme-aware (self-deprecating about CM's nerfed movement speed), and capable of mid-sentence belief revision when a prediction is wrong.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop shell | **Tauri v2** (Rust + WebView2) | RAM/CPU budget; transparent overlay; native perf |
| Frontend | **React 18 + Vite + TypeScript** | Single-file App.tsx, inline styles (glassmorphism) |
| Backend | **Rust** (axum, tokio, rodio, tract-onnx) | Latency-critical path must be Rust-only (ADR-03) |
| CV pipeline | **Windows Graphics Capture → ONNX detector** | Minimap hero detection for gank warnings |
| Audio | **rodio** (in-process WAV playback) | Sub-1ms cancel, no cmd flash |
| TTS | **Windows SAPI** (PowerShell, planned: Piper ONNX) | Thai voice, latency fallback chain |
| Cloud brain | **Gemini** (planned Phase 4) | Narrative, deep analysis, item advice |
| Local SLM | **Qwen2.5** via llama-cpp-rs (planned Phase 5) | Offline resilience fallback |

---

## Repository Layout

```
G-Maiden/
├── CLAUDE.md              # Instructions for Claude Code (authoritative)
├── AGENTS.md              # This file — cross-agent governance
├── CHANGELOG.md           # Keep a Changelog format
├── ROADMAP.md             # 8-phase masterplan (v0.1 → v1.0)
├── docs/                  # Specs: PRD, SRS, Tech Stack, Engineering Spec, TDD
│   ├── 01-Tech-Stack.md
│   ├── 02-Engineering-Spec.md
│   └── 03-Technical-Design-Document.md
├── Product Requirement Document.md   # Thai — vision, persona, modules
├── Software Requirements Specification.md  # Thai — NFR, interfaces, budgets
├── models/                # ONNX models + labels (bundled in release)
├── src/                   # Frontend (React/Vite)
│   ├── package.json
│   └── src/App.tsx        # Single-file UI: Overlay + Control components
├── src-tauri/             # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs        # Entry point, Tauri commands, module registry
│       ├── gsi.rs         # GSI HTTP server (axum :3000) + watchdog
│       ├── damage.rs      # G-Damage: burst damage calculator + hero DB
│       ├── audio.rs       # rodio playback (dedicated thread + mpsc channel)
│       ├── tts.rs         # Windows SAPI TTS (PowerShell, base64 Thai)
│       ├── capture.rs     # Windows Graphics Capture (screen → frames)
│       ├── cv/            # Computer vision pipeline
│       │   ├── mod.rs     # Pipeline orchestrator
│       │   ├── region.rs  # Minimap region detection
│       │   ├── prefilter.rs # Color-ring candidate prefilter
│       │   └── detector.rs  # ONNX inference (128 heroes)
│       ├── sentry.rs      # G-Sentry: fog-of-war monitor (missing >5s)
│       ├── motion.rs      # G-Motion: 5-min ring buffer, gank path prediction
│       ├── signal.rs      # G-Signal: hysteresis alert/clear + belief revision
│       ├── master.rs      # G-Master: Claude CLI shell-out advisor
│       ├── log.rs         # G-Log: local JSONL match logging
│       ├── runtime.rs     # Shared state (in_game, last_post_ms)
│       └── setup.rs       # GSI config auto-install + Dota process detection
└── .github/workflows/     # CI: tag → signed NSIS/MSI release
```

---

## Architecture (Two-Tier)

```
┌─────────────────────────────────────────────────────┐
│  LOCAL GATEWAY (G-Sensory tier)                      │
│  ┌──────┐  ┌────────┐  ┌────────┐  ┌───────┐       │
│  │ GSI  │→│G-Sentry │→│G-Motion │→│G-Signal│→ VOICE │
│  │:3000 │  │(fog)    │  │(paths)  │  │(alert) │       │
│  └──────┘  └────────┘  └────────┘  └───────┘       │
│  ┌──────────┐  ┌────────┐  ┌─────────┐             │
│  │ Capture  │→│  CV    │→│G-Damage │→ HP WARNING   │
│  │ (WGC)   │  │(ONNX)  │  │(burst)  │              │
│  └──────────┘  └────────┘  └─────────┘             │
│                                                      │
│  ┌──────────┐  ┌────────┐                           │
│  │ Overlay  │  │ G-Log  │  (all local, no egress)   │
│  │ (WebView)│  │(JSONL) │                           │
│  └──────────┘  └────────┘                           │
└─────────────────────────────────────────────────────┘
         ↕ (non-critical, degrades gracefully)
┌─────────────────────────────────────────────────────┐
│  CLOUD BRAIN (Maiden Scribe) — planned              │
│  Gemini streaming API → narration + deep analysis   │
│  Fallback: Local SLM → Template engine              │
└─────────────────────────────────────────────────────┘
```

---

## G-Series Modules (ADR-01: all prefixed `G-`)

| Module | Status | Responsibility |
|--------|--------|---------------|
| **G-Sentry** | Done | Fog-of-war monitor — polls GSI/CV every 500ms; flags enemies missing >5s |
| **G-Motion** | Done | Heatmap/path prediction — 5-min ring buffer of last-seen positions |
| **G-Signal** | Done | Gank warning — voice interrupt at >85% danger; hysteresis clear at <50% |
| **G-Master** | Basic | Advisor — currently Claude CLI, planned Gemini integration |
| **G-Sensory** | Done | Overlay rendering + resource budget (glassmorphism HUD) |
| **G-Log** | Done | Local-only match logging (JSONL) |
| **G-Damage** | New | Burst damage calculator — hero DB + armor/magic resistance formulas |

---

## Hard Constraints (Non-Functional — ENFORCE THESE)

| Constraint | Target | Consequence of violation |
|-----------|--------|------------------------|
| G-Signal end-to-end latency | p50 ≤ 250ms, **never exceed 300ms** | Player dies before warning |
| Background CPU | ≤ 2.5% on mid-range | Game stutters |
| RAM | ≤ 400MB (all modules active) | Swap thrash |
| FPS impact | ≤ 3% Dota 2 FPS drop | Unacceptable for competitive play |
| **Privacy** | G-Log + player stats **local only** | **NEVER upload raw data** |
| **Resilience** | G-Sentry + G-Signal work without cloud | Core safety must survive disconnects |
| **Signing key** | `.tauri/` is gitignored | **NEVER commit signing keys** |

---

## Coding Rules

### Rust (src-tauri/)
- Critical path (GSI → G-Signal → voice) must be **pure Rust** — no cloud, no webview in the hot path (ADR-03)
- `OutputStream` (rodio) is `!Sync` — lives on dedicated `g-audio` thread, communicate via `mpsc::channel<Cmd>`
- All new modules must follow `G-` naming convention (ADR-01)
- Run `cargo test` before committing — currently 50 tests, all must pass
- Resource-heavy operations (ONNX inference, screen capture) must respect the CPU/RAM budget

### TypeScript (src/)
- **Single-file architecture**: `src/src/App.tsx` contains both Overlay and Control components
- Inline styles using the `C` color palette and `panel()` glassmorphism helper
- Settings persisted to `localStorage('gm-settings')` — broadcast to overlay via Tauri `emit('settings', ...)`
- Two windows: `control` (main UI) and `overlay` (transparent, click-through, always-on-top)
- Run `npx tsc --noEmit` to verify — zero errors required

### General
- Specs (PRD, SRS) are in **Thai** — the source of truth for requirements
- SemVer: MAJOR.MINOR.PATCH — bump version in 3 places: `tauri.conf.json`, `src/package.json`, `App.tsx APP_VERSION`
- Keep a Changelog format in `CHANGELOG.md`
- Comments only when the WHY is non-obvious; no "what" comments
- No feature flags, no backwards-compat shims — just change the code
- Privacy-first: never add telemetry, analytics, or network egress for player data

---

## Release & Update Workflow

The app ships to users through an **in-app updater** (Tauri updater plugin), and releases are
produced **only by CI on a pushed version tag**. Understand both halves before touching versions.

### How users get updates
- The running app checks `plugins.updater.endpoints` in `tauri.conf.json` →
  `https://github.com/Freshair129/G-Maiden/releases/latest/download/latest.json` on launch and via
  the **"ตรวจหาอัปเดต"** button (`App.tsx`).
- It compares the published `latest.json` version against the running app's version. If newer, it
  downloads the signed installer, verifies it against the embedded **minisign pubkey**, installs,
  and relaunches.
- **A commit/push to `main` does NOT reach users.** Only a published GitHub Release does. The
  updater is blind to untagged commits.

### How a release is cut
- `.github/workflows/release.yml` triggers on tags matching `v*`. It builds, **signs** (using
  `TAURI_SIGNING_PRIVATE_KEY` from GitHub Secrets — the key is *not* on dev machines), and
  publishes a GitHub Release with the NSIS/MSI installers, their `.sig` files, and `latest.json`.
- Steps to release:
  1. Bump the version in **3 places**: `src-tauri/tauri.conf.json`, `src/package.json`, and
     `App.tsx` `APP_VERSION` (the first drives the updater; the last drives the UI display).
  2. Add a `CHANGELOG` entry (in `App.tsx` and `CHANGELOG.md`).
  3. `git commit` → `git push origin main` → `git tag -a vX.Y.Z -m "..."` → `git push origin vX.Y.Z`.
  4. CI takes ~13 min. Verify the result: the new version is `Latest` and `latest.json` reports the
     new version **with `signature` present**.
- Local `pnpm tauri build` produces installers but **cannot sign** (no private key locally), so it
  is for smoke-testing only — never the release path.

### Batching policy (IMPORTANT — don't churn versions)
- **Small fixes → commit to `main` WITHOUT tagging.** Accumulate them.
- **Only bump the version + push a tag when the user asks to release**, or when a meaningful batch
  has accumulated. Do not cut a release per fix — that ran 0.7.0→0.7.1→0.7.2 in minutes once and
  burned version numbers needlessly.
- If the user needs an unreleased fix tested in-game, build locally (`pnpm tauri build`) or ask
  before cutting a release.

---

## Current State (v0.6.0)

### What works
- GSI server receives Dota 2 game state on `:3000`
- Transparent overlay with glassmorphism HUD (position: top/left/right/custom)
- HP danger alerts with voice (rising-edge, 8s throttle, belief revision)
- Minimap CV pipeline: WGC capture → color prefilter → ONNX detector → G-Sentry → G-Motion → G-Signal
- Gank warning banners + voice with hysteresis
- Persona voice lines (level up, kill, death, respawn, mana low)
- rodio audio backend (in-process WAV, <1ms cancel)
- Individual stat toggles (timer, score, HP/Mana, K/D/A, gold/NW)
- Custom overlay positioning with X/Y sliders + profile save/load
- Overlay preview without affecting Dota/GSI status chips
- G-Damage engine with 8-hero database and burst damage calculator
- G-Master advisor (Claude CLI, 30s throttle)
- G-Log local JSONL logging
- In-app updater (GitHub Releases + minisign)
- GSI config auto-installer + Dota watchdog
- 50 unit tests across all modules

### What's next (see ROADMAP.md)
- **Phase 3** (v0.6): Piper local neural TTS for Thai voice
- **Phase 4** (v0.7): Gemini cloud brain integration
- **Phase 5** (v0.8): Local SLM offline resilience
- **Phase 6** (v0.9): G-Log SQLite + probability calibration
- **Phase 7** (v0.10): Resource governor + advanced overlay
- **Phase 8** (v1.0): Validation + ship

---

## Persona Rules (Product-Critical)

These are **functional requirements**, not flavor text. Maiden must:
1. Be **gentle + intelligent** — statistically credible advice, never toxic
2. Use **Nerf CM humor** — self-deprecating about Crystal Maiden's movement speed nerfs
3. Implement **Belief Revision** — when a prediction is wrong, audibly catch herself mid-sentence ("เอ๊ะ! เดี๋ยวก่อน!") and correct the advice. This is a required behavior of G-Signal.

---

## Security Constraints

- `.tauri/` directory contains the **signing private key** — gitignored, MUST NEVER be committed
- G-Log raw data stays **local only** — privacy-first, no network egress
- CV capture is **read-only** — no injection or memory access (Risk R-06)
- GitHub Secrets: `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- No telemetry, no analytics, no crash reporting that sends player data

---

## For Codex / Automated Agents

1. **Read CLAUDE.md first** — it's the primary instruction file and may override this one
2. **Run tests before proposing changes**: `cargo test` (Rust, from `src-tauri/`) and `npx tsc --noEmit` (TS, from `src/`)
3. **Don't add new files without reason** — prefer editing existing files
4. **Don't add dependencies without justification** — every dep affects the RAM/CPU budget
5. **Thai language**: specs and UI strings are in Thai; preserve existing Thai text
6. **Version bumps**: if your change is user-facing, bump version in all 3 places
7. **No breaking the overlay**: the overlay window is transparent + click-through + always-on-top; test changes don't break this
8. **Latency is sacred**: anything in the GSI → G-Signal → voice path must be <300ms total
