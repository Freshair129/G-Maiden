# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: implemented (v0.7.x), shipping via in-app updater

The project is scaffolded and shipping â€” **Tauri v2 + React/Vite + Rust**. For the current
implementation state, module status, repo layout, and coding rules see **AGENTS.md**. The two
specs remain the source of truth for *requirements*:

- `docs/product/product-requirements.md` (PRD) â€” vision, modules, persona, ADR-01 naming.
- `docs/product/software-requirements-specification.md` (SRS) â€” functional + non-functional requirements,
  external interfaces, performance budgets. The SRS is the more detailed/authoritative of the two.

Both are written in Thai. Treat the SRS numbers (latency, CPU, RAM) as hard constraints, not
aspirations. Build/test commands now exist: `cargo test` (from `src-tauri/`), `npx tsc --noEmit`
(from `src/`), `pnpm tauri build` (from repo root). Releases go through the **Release & update
workflow** below.


## What G-Maiden is

A real-time AI companion / co-pilot ("**Maiden**", inspired by Dota 2's Crystal Maiden) that
narrates and advises during live Dota 2 matches via voice + a transparent on-screen overlay. It
reads live game data through Valve's **GSI (Game State Integration)** and reacts within a strict
latency budget without disrupting the player's focus.

## Architecture intent (from the SRS)

Hybrid **client-server**, split by latency requirement:

1. **Local Gateway (G-Sensory tier)** â€” receives raw GSI data, processes the minimap, and emits
   ultra-low-latency voice alerts. Critical-path work (gank warnings) runs here so it survives
   cloud disconnection by falling back to a **local SLM**.
2. **Cloud Brain (Maiden Scribe)** â€” drives live-caster persona, narrative continuity, and deep
   analysis via a **cloud LLM (Gemini)**. Non-critical; degrades gracefully when offline.

### The G-Series modules (ADR-01: every module is prefixed `G-`)

| Module | Responsibility |
| --- | --- |
| **G-Sentry** | Fog-of-war monitor â€” polls GSI every 500ms; flags enemies missing from vision >5s |
| **G-Motion** | Heatmap/path prediction â€” keeps 5 min of last-seen enemy positions, predicts gank routes |
| **G-Signal** | Real-time gank warning â€” **voice interrupt** when danger threshold >85%; the hard-latency path |
| **G-Master** | Strategic/financial advisor â€” skill/item build advice vs. enemy Net Worth & items |
| **G-Sensory** | Overlay rendering + hardware optimization (glassmorphism HUD, FPS/resource budget) |
| **G-Log** | Feedback loop â€” logs decisions/outcomes locally to tune prediction params next match |

**Screen capture (G-Sensory CV)** uses **DXGI Desktop Duplication**, not WGC (ADR-13 / CR-001) â€”
GPU copy within one vsync. Dota 2 ต้องรันแบบ borderless-fullscreen (`-window -noborder`); ถ้า capture
เริ่มไม่ได้ แอปจะ fall back เป็น **GSI-only "Lite mode"** (ไม่มี minimap CV แต่เสียง/overlay/G-Master ยังทำงาน).
WGC เดิมเก็บไว้หลัง `--features wgc` (`capture_wgc.rs`).

When adding any new module/feature, keep the `G-` prefix (ADR-01) for brand/scalability unity.

### Hard constraints (non-functional â€” enforce these)

- **G-Signal end-to-end latency: target 250ms, never exceed 300ms.**
- Background CPU usage â‰¤ **2.5%** on a mid-range chipset; RAM â‰¤ **400MB** with all modules active.
- Overlay must not drop Dota 2 FPS by more than **3%**, and must not obscure minimap, skill bar,
  or stats panels.
- **Privacy-first:** G-Log raw data and player stats stay **local only** â€” never upload them.
- **Resilience:** on cloud/network loss, G-Sentry and G-Signal must keep running on the local SLM.

### Key external interfaces

- **Dota 2 GSI** â†’ local HTTP POST on **port 3000**, JSON payloads from the player's own machine.
- **Cloud cognitive engine** â†’ Gemini streaming API.
- **TTS module** â†’ text-to-speech tuned for a live-caster vocal style.

## Announcer event packs (G-AnnStudio)

Maiden voices community-made announcer packs on top of TTS. Clips live in
`assets/voice-cache/{event}/*.wav` and are read live (drop-in, no restart): `audio::play_random`
picks one at random per fired event; `speak_event` falls back to SAPI TTS when an event has no clip.

- **Event contract** — the canonical event ids live in `G-Suite/schemas/gmaiden-events.json`
  (mirrored in `src-tauri/src/main.rs` `EVENTS`). Beyond G-Signal's `danger`/`revision`, the set is
  fired by `src-tauri/src/announcer.rs` from each GSI `game-tick`: `match_start`, `first_blood`,
  `kill`, multi-kills (`double_kill`…`rampage`, 18s window), the streak ladder (`killing_spree`/
  `dominating`/`mega_kill`/`unstoppable`/`wicked_sick`/`monster_kill`/`godlike`/`beyond_godlike`),
  and `death`/`respawn`/`levelUp`/`hpLow`/`manaLow`.
- **Kill-banner sync (enforce)** — the streak ladder in `announcer.rs` mirrors the overlay kill
  banner (`src/src/App.tsx` `STREAK_LABELS`) exactly, so the voiced streak and the on-screen banner
  always agree. Both detect kills from `tick.kills` rising-edge and reset on death. Audio is
  single-slot, so `announcer::most_important` voices only the top-priority event per tick. If you
  add/rename a streak tier, change it in **both** places + `gmaiden-events.json`.
- **Authoring + install** — packs are built in **G-AnnStudio** (the
  [G-Suite](https://github.com/Freshair129/G-Suite) monorepo): import → Whisper auto-split → AI maps
  clips to events → installs into voice-cache, then `POST /announcer/install` on the :3000 GSI
  server (handled in `src-tauri/src/gsi.rs`) so the pack is picked up live; the endpoint returns
  per-event clip counts.

## Persona rules (product-critical, not flavor)

"Maiden" must stay consistent across every utterance:
- **Gentle + intelligent**, statistically credible advice.
- **Meme-aware self-deprecation** about the perennial "Nerf CM" movement-speed nerfs.
- **Belief Revision:** when a prediction is wrong, Maiden audibly catches itself and changes advice
  mid-sentence ("à¹€à¸­à¹Šà¸°! à¹€à¸”à¸µà¹‹à¸¢à¸§à¸à¹ˆà¸­à¸™!") â€” this mid-stream correction is a required behavior of
  G-Signal, not optional polish.

## Global hotkeys

All hotkeys are registered as global shortcuts (work even when Dota 2 is focused).
Defined in `src-tauri/src/main.rs` via `tauri_plugin_global_shortcut`.

| Hotkey | Action |
| --- | --- |
| **Ctrl+Alt+S** | ซ่อน/แสดง overlay |
| **Alt+↑** | เพิ่มระดับเสียง +10% |
| **Alt+↓** | ลดระดับเสียง -10% |
| **Alt+M** | ปิด/เปิดเสียง (mute toggle — กลับเป็นระดับเดิมเมื่อ unmute) |

## Visual language

Premium-dark dashboard: background `#08090c`, frosted ice-aluminium panels
`rgba(18, 20, 28, 0.72)`, glassmorphism overlay in Maiden's ice palette. Modular control panels.

## Release & update workflow

Users receive updates through an **in-app updater** (Tauri updater plugin), and releases are cut
**only by CI on a pushed version tag** â€” never by a plain push to `main`.

- **In-app update:** the app checks `https://github.com/Freshair129/G-Maiden/releases/latest/download/latest.json`
  (set in `tauri.conf.json` â†’ `plugins.updater`) on launch and via the **"à¸•à¸£à¸§à¸ˆà¸«à¸²à¸­à¸±à¸›à¹€à¸”à¸•"** button.
  If a newer version is published, it downloads the signed installer, verifies the **minisign**
  signature, installs, and relaunches.
- **Cutting a release:** push a tag `vX.Y.Z` â†’ `.github/workflows/release.yml` builds, signs (key
  from GitHub Secrets, *not* local), and publishes the GitHub Release + `latest.json`. Steps: bump
  version in `src-tauri/tauri.conf.json` + `src/package.json` + `App.tsx` `APP_VERSION`, add a
  CHANGELOG entry, commit, then `git tag -a vX.Y.Z && git push origin vX.Y.Z`. CI â‰ˆ 13 min.
- **A commit on `main` does NOT reach users** until a tag is pushed. Local `pnpm tauri build` can't
  sign â€” it's for smoke-testing only.

### Batching policy (avoid version churn)

- **Small fixes â†’ commit to `main` WITHOUT tagging.** Accumulate them into a batch.
- **Only bump the version + push a tag when the user asks to release** (or a meaningful batch is
  ready). Do not cut a release per fix â€” releasing every small fix runs the version number up
  needlessly ("à¹€à¸§à¸­à¸£à¹Œà¸Šà¸±à¸™à¸§à¸´à¹ˆà¸‡à¸—à¸°à¸¥à¸¸à¹‚à¸¥à¸"). If an unreleased fix needs in-game testing, build locally or
  ask before releasing.

## repo https://github.com/Freshair129/G-Maiden.git
deploy to web by vercel cli

