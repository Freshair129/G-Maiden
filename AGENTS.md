# AGENTS.md

> Context and governance for AI coding agents (Codex, Claude Code, Copilot, etc.)
> working on the G-Maiden codebase. Read this before touching any file.

---

## What is G-Maiden?

A **real-time AI companion for Dota 2** that narrates and advises during live matches via voice + transparent on-screen overlay. It reads live game data through Valve's **GSI (Game State Integration)** and reacts within a strict latency budget without disrupting the player's focus.

The persona is "**Maiden**" â€” inspired by Dota 2's Crystal Maiden. Gentle, intelligent, statistically credible, meme-aware (self-deprecating about CM's nerfed movement speed), and capable of mid-sentence belief revision when a prediction is wrong.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop shell | **Tauri v2** (Rust + WebView2) | RAM/CPU budget; transparent overlay; native perf |
| Frontend | **React 18 + Vite + TypeScript** | Single-file App.tsx, inline styles (glassmorphism) |
| Backend | **Rust** (axum, tokio, rodio, tract-onnx) | Latency-critical path must be Rust-only (ADR-03) |
| CV pipeline | **DXGI Desktop Duplication â†’ ONNX detector** (ADR-13) | Minimap hero detection; borderless-fullscreen required, Lite-mode fallback |
| Audio | **rodio** (in-process WAV playback) | Sub-1ms cancel, no cmd flash |
| TTS | **Windows SAPI** (PowerShell, planned: Piper ONNX) | Thai voice, latency fallback chain |
| Cloud brain | **Claude CLI / Anthropic API** (`claude-haiku-4-5`) | Narrative, deep analysis, item advice (Gemini = design target, not wired) |
| Local SLM | **Ollama** (HTTP, model chosen in UI) | Offline resilience fallback (no llama-cpp/Qwen pin in code) |
| GPU telemetry | **`gpu-feeder/`** sidecar (nvidia-smi â†’ POST /telemetry) | GPU/VRAM/temp in the deck footer; keeps nvidia-smi out of the main process |

---

## Repository Layout

```
G-Maiden/
â”œâ”€â”€ CLAUDE.md              # Instructions for Claude Code (authoritative)
â”œâ”€â”€ AGENTS.md              # This file â€” cross-agent governance
â”œâ”€â”€ CHANGELOG.md           # Keep a Changelog format
|- docs/                  # Canonical documentation hub
|  |- README.md
|  |- DOC-INDEX.md
|  |- product/
|  |  |- roadmap.md
|  |  |- product-requirements.md
|  |  `- software-requirements-specification.md
|  |- architecture/
|  |  |- tech-stack.md
|  |  |- engineering-spec.md
|  |  `- technical-design-document.md
|  |- features/
|  `- operations/
â”œâ”€â”€ models/                # ONNX models + labels (bundled in release)
â”œâ”€â”€ gpu-feeder/            # Headless nvidia-smi sidecar (zero-dep crate) â†’ POST /telemetry
â”œâ”€â”€ src/                   # Frontend (React/Vite)
â”‚   â”œâ”€â”€ package.json
â”‚   â””â”€â”€ src/               # App.tsx (Overlay+Control), CommandDeck.tsx + companion.ts + live/*.ts (deck),
â”‚                          #   AudioSettings.tsx (voice packs), account/auth/gid modules
â”œâ”€â”€ src-tauri/             # Rust backend
â”‚   â”œâ”€â”€ Cargo.toml
â”‚   â”œâ”€â”€ tauri.conf.json
â”‚   â””â”€â”€ src/
â”‚       â”œâ”€â”€ main.rs        # Entry point, Tauri commands, module registry
â”‚       â”œâ”€â”€ gsi.rs         # GSI HTTP server (axum :3000): /gsi, /telemetry, /announcer/install, /auth/callback + watchdog
â”‚       â”œâ”€â”€ damage.rs      # G-Damage: burst damage calculator + hero DB
â”‚       â”œâ”€â”€ audio.rs       # rodio playback (dedicated thread + mpsc channel)
â”‚       â”œâ”€â”€ tts.rs         # Windows SAPI TTS (PowerShell, base64 Thai)
â”‚       â”œâ”€â”€ capture.rs     # DXGI Desktop Duplication (screen â†’ frames); WGC behind --features wgc (capture_wgc.rs)
â”‚       â”œâ”€â”€ cv/            # Computer vision pipeline
â”‚       â”‚   â”œâ”€â”€ mod.rs     # Pipeline orchestrator
â”‚       â”‚   â”œâ”€â”€ region.rs  # Minimap region detection
â”‚       â”‚   â”œâ”€â”€ prefilter.rs # Color-ring candidate prefilter
â”‚       â”‚   â””â”€â”€ detector.rs  # ONNX inference (128 heroes)
â”‚       â”œâ”€â”€ sentry.rs      # G-Sentry: fog-of-war monitor (missing >5s)
â”‚       â”œâ”€â”€ motion.rs      # G-Motion: 5-min last-seen ring buffer + time-off-map risk heuristic (no heatmap/path model yet)
â”‚       â”œâ”€â”€ signal.rs      # G-Signal: hysteresis danger/clear latch + Sensitivity (Low/Med/High) + belief revision
â”‚       â”œâ”€â”€ master.rs      # G-Master: advisor via Claude CLI / Anthropic API + Ollama SLM fallback (Auto|Claude|Ollama)
â”‚       â”œâ”€â”€ log.rs         # G-Log: local JSONL match logging
â”‚       â”œâ”€â”€ runtime.rs     # Shared state (in_game, last_post_ms)
â”‚       â””â”€â”€ setup.rs       # GSI config auto-install + Dota process detection
â””â”€â”€ .github/workflows/     # CI: tag â†’ signed NSIS/MSI release
```

Also in `src-tauri/src/` (not drawn above): `dxgi.rs` (DXGI backend), `announcer.rs` (announcer event
detector), `voice_api.rs` (voice-pack bundles + `EVENTS` table + `fired_banner`), `governor.rs`
(resource governor + GPU telemetry ingest), `slm.rs` (Ollama offline advice), `revive.rs`/`respawn.rs`
(G-Revive buyback), `counter_advice.rs`/`items.rs` (counter-item build advice), `ocr.rs` (PP-OCR),
`identity.rs` (Steam id resolution), `usage.rs` (Claude quota), `calibration.rs` (capture calibration).

---

## Architecture (Two-Tier)

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  LOCAL GATEWAY (G-Sensory tier)                      â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”       â”‚
â”‚  â”‚ GSI  â”‚â†’â”‚G-Sentry â”‚â†’â”‚G-Motion â”‚â†’â”‚G-Signalâ”‚â†’ VOICE â”‚
â”‚  â”‚:3000 â”‚  â”‚(fog)    â”‚  â”‚(paths)  â”‚  â”‚(alert) â”‚       â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”˜       â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”             â”‚
â”‚  â”‚ Capture  â”‚â†’â”‚  CV    â”‚â†’â”‚G-Damage â”‚â†’ HP WARNING   â”‚
â”‚  â”‚ (DXGI)  â”‚  â”‚(ONNX)  â”‚  â”‚(burst)  â”‚              â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜             â”‚
â”‚                                                      â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”                           â”‚
â”‚  â”‚ Overlay  â”‚  â”‚ G-Log  â”‚  (all local, no egress)   â”‚
â”‚  â”‚ (WebView)â”‚  â”‚(JSONL) â”‚                           â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”˜                           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â†• (non-critical, degrades gracefully)
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  CLOUD BRAIN (Maiden Scribe)                        â”‚
â”‚  Claude CLI / Anthropic API â†’ narration + advice    â”‚
â”‚  Fallback: Ollama local SLM  (Gemini = design only) â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## G-Series Modules (ADR-01: all prefixed `G-`)

| Module | Status | Responsibility |
|--------|--------|---------------|
| **G-Sentry** | Done | Fog-of-war monitor â€” polls GSI/CV every 500ms; flags enemies missing >5s |
| **G-Motion** | Done | Time-off-map risk heuristic â€” 5-min ring buffer of last-seen positions (no heatmap/path model yet) |
| **G-Signal** | Done | Gank warning â€” voice interrupt at the Sensitivity danger threshold (default Med 0.65; clear 0.40) |
| **G-Master** | Basic | Advisor â€” Claude CLI / Anthropic API + Ollama SLM fallback (Auto\|Claude\|Ollama) |
| **G-Sensory** | Done | Overlay rendering + resource budget (glassmorphism HUD) |
| **G-Log** | Done | Local-only match logging (JSONL) |
| **G-Damage** | New | Burst damage calculator â€” hero DB + armor/magic resistance formulas |

---

## Hard Constraints (Non-Functional â€” ENFORCE THESE)

| Constraint | Target | Consequence of violation |
|-----------|--------|------------------------|
| G-Signal end-to-end latency | p50 â‰¤ 250ms, **never exceed 300ms** | Player dies before warning |
| Background CPU | â‰¤ 2.5% on mid-range | Game stutters |
| RAM | â‰¤ 400MB (all modules active) | Swap thrash |
| FPS impact | â‰¤ 3% Dota 2 FPS drop | Unacceptable for competitive play |
| **Privacy** | G-Log + player stats **local only** | **NEVER upload raw data** |
| **Resilience** | G-Sentry + G-Signal work without cloud | Core safety must survive disconnects |
| **Signing key** | `.tauri/` is gitignored | **NEVER commit signing keys** |

---

## Coding Rules

### Rust (src-tauri/)
- Critical path (GSI â†’ G-Signal â†’ voice) must be **pure Rust** â€” no cloud, no webview in the hot path (ADR-03)
- `OutputStream` (rodio) is `!Sync` â€” lives on dedicated `g-audio` thread, communicate via `mpsc::channel<Cmd>`
- All new modules must follow `G-` naming convention (ADR-01)
- Run `cargo test` before committing â€” ~130 tests, all must pass. CI gate is `cargo clippy --all-targets -- -D warnings` (built-ahead modules need `#![allow(dead_code)]`)
- Resource-heavy operations (ONNX inference, screen capture) must respect the CPU/RAM budget
- **Screen capture = DXGI Desktop Duplication** (`dxgi.rs` + `capture.rs`), not WGC (ADR-13 / CR-001). WGC on Win10 stalled at ~0.7 Hz / 8% CPU and crashed on the `WithoutBorder` toggle; DXGI is a GPU copy that lands within one vsync. Dota 2 **must run borderless-fullscreen** (`-window -noborder`) — exclusive fullscreen is unsupported, so on init failure the app auto-falls back to **GSI-only "Lite mode"** (no minimap CV; voice/overlay/G-Master still work) and shows a Lite badge. Old WGC path preserved behind `--features wgc` (`capture_wgc.rs`); default build = DXGI.

### TypeScript (src/)
- **Two UI surfaces** (App.tsx is no longer single-file): `src/src/App.tsx` = the **overlay**
  window (in-game HUD) + window routing; `src/src/CommandDeck.tsx` = the **control** window (bento
  deck) with `Dashboard.tsx`, `companion.ts`, pure live builders in `src/src/live/`, and the
  account system (`auth.ts` / `profile.ts` / `supabase.ts` / `gid.ts` + `AccountPage` / `AuthPanel`
  / `SteamLink`). Live data is Tauri events → builders → merged over `MOCK` (CR-002 / ADR-14).
- Frontend tests: **Vitest** (`pnpm -C src test`) — ~110 tests across the live builders (incl.
  telemetry/weekly/insights/history) + GID codec. Run alongside `tsc --noEmit`.
- Inline styles using the `C` color palette and `panel()` glassmorphism helper
- Settings persisted to `localStorage('gm-settings')` â€” broadcast to overlay via Tauri `emit('settings', ...)`
- Two windows: `control` (main UI) and `overlay` (transparent, click-through, always-on-top)
- Run `npx tsc --noEmit` to verify â€” zero errors required

### General
- Specs (PRD, SRS) are in **Thai** â€” the source of truth for requirements
- SemVer: MAJOR.MINOR.PATCH â€” bump version in 3 places: `tauri.conf.json`, `src/package.json`, `App.tsx APP_VERSION`
- Keep a Changelog format in `CHANGELOG.md`
- Comments only when the WHY is non-obvious; no "what" comments
- No feature flags, no backwards-compat shims â€” just change the code
- Privacy-first: never add telemetry, analytics, or network egress for player data

---

## Release & Update Workflow

The app ships to users through an **in-app updater** (Tauri updater plugin), and releases are
produced **only by CI on a pushed version tag**. Understand both halves before touching versions.

### How users get updates
- The running app checks `plugins.updater.endpoints` in `tauri.conf.json` â†’
  `https://github.com/Freshair129/G-Maiden/releases/latest/download/latest.json` on launch and via
  the **"à¸•à¸£à¸§à¸ˆà¸«à¸²à¸­à¸±à¸›à¹€à¸”à¸•"** button (`App.tsx`).
- It compares the published `latest.json` version against the running app's version. If newer, it
  downloads the signed installer, verifies it against the embedded **minisign pubkey**, installs,
  and relaunches.
- **A commit/push to `main` does NOT reach users.** Only a published GitHub Release does. The
  updater is blind to untagged commits.

### How a release is cut
- `.github/workflows/release.yml` triggers on tags matching `v*`. It builds, **signs** (using
  `TAURI_SIGNING_PRIVATE_KEY` from GitHub Secrets â€” the key is *not* on dev machines), and
  publishes a GitHub Release with the NSIS/MSI installers, their `.sig` files, and `latest.json`.
- Steps to release:
  1. Bump the version in **3 places**: `src-tauri/tauri.conf.json`, `src/package.json`, and
     `App.tsx` `APP_VERSION` (the first drives the updater; the last drives the UI display).
  2. Add a `CHANGELOG` entry (in `App.tsx` and `CHANGELOG.md`).
  3. `git commit` â†’ `git push origin main` â†’ `git tag -a vX.Y.Z -m "..."` â†’ `git push origin vX.Y.Z`.
  4. CI takes ~13 min. Verify the result: the new version is `Latest` and `latest.json` reports the
     new version **with `signature` present**.
- Local `pnpm tauri build` produces installers but **cannot sign** (no private key locally), so it
  is for smoke-testing only â€” never the release path.

### Batching policy (IMPORTANT â€” don't churn versions)
- **Small fixes â†’ commit to `main` WITHOUT tagging.** Accumulate them.
- **Only bump the version + push a tag when the user asks to release**, or when a meaningful batch
  has accumulated. Do not cut a release per fix â€” that ran 0.7.0â†’0.7.1â†’0.7.2 in minutes once and
  burned version numbers needlessly.
- If the user needs an unreleased fix tested in-game, build locally (`pnpm tauri build`) or ask
  before cutting a release.

---

## Current State (v0.7.x shipping; v0.8.0 in progress)

### What works
- GSI server receives Dota 2 game state on `:3000`
- Transparent overlay with glassmorphism HUD (position: top/left/right/custom)
- HP danger alerts with voice (rising-edge, 8s throttle, belief revision)
- Minimap CV pipeline: DXGI capture â†’ color prefilter â†’ ONNX detector â†’ G-Sentry â†’ G-Motion â†’ G-Signal (borderless-fullscreen required; GSI-only Lite-mode fallback on capture-init failure — ADR-13/CR-001)
- Gank warning banners + voice with hysteresis
- Persona voice lines (level up, kill, death, respawn, mana low)
- Command-deck control UI (`src/src/CommandDeck.tsx` + `Dashboard.tsx` + `companion.ts`): bento deck
  with GSI/LIVE header, trend stat bar (NW/GPM/XPM/KDA/CS-DN/PING), and hero flip cards (front:
  rank/MMR + BB/TP/ULT + items + status VISIBLE/LOW/MISSING/DEAD; back: profile/hours/winrate).
  **Live-wired** (CR-002 Phase 2a/2b, merged `170805b8`): Tauri events → pure builders in
  `src/src/live/` → merged over baked `MOCK` fallback (renders signed-out/offline). Own-game limit:
  GSI = local player only; other 9 heroes get CV identity/position + missing state (KDA/items hidden).
  Overlay window + DXGI backend unchanged (routing in `App.tsx`).
- **Accounts & GID (ADR-14)**: optional, additive Google-OAuth sign-in → a cross-G-series **GID**
  (`gid.ts`, `G-[Gen][Payload][Checksum]`) on the shared `gstore` Supabase backend; links Steam
  (`identity.rs`) and loads the player's public OpenDota profile. Match/CV/G-Log data stay local;
  the account stores identity only (email + public Steam ids + display name + GID).
- rodio audio backend (in-process WAV, <1ms cancel)
- Individual stat toggles (timer, score, HP/Mana, K/D/A, gold/NW)
- Custom overlay positioning with X/Y sliders + profile save/load
- Overlay preview without affecting Dota/GSI status chips
- G-Damage engine with 8-hero database and burst damage calculator
- G-Master advisor (Claude CLI / Anthropic API + Ollama SLM fallback, 30s throttle)
- G-Log local JSONL logging
- **Announcer packs = bundles**: activating a pack changes the in-game voice (active-pack-first clip
  resolution) and shows the pack's **banner image** on the overlay when an event fires
  (`announcer-banner` event); "Show on overlay" previews a pack without a match
- **Deck panels live-wired (Phase 2c)**: telemetry footer, weeklyReport, insights, history,
  agentSector.status now use real data (resource-stats / OpenDota / G-Log / GSI); buildAdvisor still MOCK
- **GPU/VRAM/temp telemetry**: bundled headless `gpu-feeder` sidecar (nvidia-smi → POST /telemetry);
  deck footer shows real GPU or "—" when the feeder isn't running
- In-app updater (GitHub Releases + minisign)
- GSI config auto-installer + Dota watchdog
- ~130 Rust unit tests + ~110 Vitest across all modules

### What's next (see `docs/product/roadmap.md`)
- **Phase 3** (v0.6): Piper local neural TTS for Thai voice (SAPI ships today)
- **Phase 4** (v0.7): cloud brain — DONE via Claude CLI/Anthropic API (Gemini specifically deferred)
- **Phase 5** (v0.8): Local SLM offline resilience — DONE via Ollama
- **Phase 6** (v0.9): G-Log probability calibration (logs are already JSONL, not SQLite)
- **Phase 7** (v0.10): Resource governor + advanced overlay
- **Phase 8** (v1.0): Validation + ship

---

## Persona Rules (Product-Critical)

These are **functional requirements**, not flavor text. Maiden must:
1. Be **gentle + intelligent** â€” statistically credible advice, never toxic
2. Use **Nerf CM humor** â€” self-deprecating about Crystal Maiden's movement speed nerfs
3. Implement **Belief Revision** â€” when a prediction is wrong, audibly catch herself mid-sentence ("à¹€à¸­à¹Šà¸°! à¹€à¸”à¸µà¹‹à¸¢à¸§à¸à¹ˆà¸­à¸™!") and correct the advice. This is a required behavior of G-Signal.

---

## Security Constraints

- `.tauri/` directory contains the **signing private key** â€” gitignored, MUST NEVER be committed
- G-Log raw data stays **local only** â€” privacy-first, no network egress
- CV capture is **read-only** â€” no injection or memory access (Risk R-06)
- GitHub Secrets: `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- No telemetry, no analytics, no crash reporting that sends player data

---

## For Codex / Automated Agents

1. **Read CLAUDE.md first** â€” it's the primary instruction file and may override this one
2. **Run tests before proposing changes**: `cargo test` (Rust, from `src-tauri/`) and `npx tsc --noEmit` (TS, from `src/`)
3. **Don't add new files without reason** â€” prefer editing existing files
4. **Don't add dependencies without justification** â€” every dep affects the RAM/CPU budget
5. **Thai language**: specs and UI strings are in Thai; preserve existing Thai text
6. **Version bumps**: if your change is user-facing, bump version in all 3 places
7. **No breaking the overlay**: the overlay window is transparent + click-through + always-on-top; test changes don't break this
8. **Latency is sacred**: anything in the GSI â†’ G-Signal â†’ voice path must be <300ms total
