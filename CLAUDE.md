# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: implemented (v0.9.0), shipping via in-app updater

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
   analysis via a **cloud LLM** (design target was Gemini; **shipped** path is Claude CLI / Anthropic
   API with an Ollama local-SLM fallback — see `master.rs`). Non-critical; degrades gracefully offline.

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

**Command-deck UI (`src/src/CommandDeck.tsx`)** -- the control window renders a bento "command
deck" (`Dashboard.tsx` + `companion.ts`) with a GSI/LIVE header, a trend stat bar, and hero flip
cards (status VISIBLE / LOW / MISSING / DEAD). It is **live-wired** (CR-002 Phase 2a/2b, merged
`170805b8`): `useCompanionData()` subscribes to Tauri events (`game-tick`/`gsi-status`/`minimap-cv`/
`enemy-missing`/`gank-alert`) and merges pure builders in `src/src/live/` over a baked `MOCK`
fallback, so it renders signed-out/offline. Own-game honest limit: GSI exposes only the local
player, so the other 9 heroes get CV identity/position + missing state only (KDA/items hidden).
The overlay window + DXGI backend are untouched (window routing lives in `App.tsx`).

**Accounts & GID (ADR-14)** -- optional, **additive** sign-in (the deck works without it). Google
OAuth (PKCE, callback on the GSI `:3000/auth/callback` route) → a **GID**, the human-facing
cross-G-series identity (`G-[Gen][Payload][Checksum]`, `src/src/gid.ts`); internal key stays the
Supabase UUID. Backend is the shared `gstore` Supabase project (`profiles` + RLS). Steam is linked
(`resolve_steam_id` in `identity.rs` — vanity/profile/SteamID64) so the deck loads the player's
**public OpenDota** profile + trend baselines. Files: `auth.ts`, `profile.ts`, `supabase.ts`,
`AccountPage/AuthPanel/SteamLink.tsx`. See ADR-14 + `docs/change request/CR-002-*`.

When adding any new module/feature, keep the `G-` prefix (ADR-01) for brand/scalability unity.

### Hard constraints (non-functional â€” enforce these)

- **G-Signal end-to-end latency: target 250ms, never exceed 300ms.**
- Background CPU usage â‰¤ **2.5%** on a mid-range chipset; RAM â‰¤ **400MB** with all modules active.
- Overlay must not drop Dota 2 FPS by more than **3%**, and must not obscure minimap, skill bar,
  or stats panels.
- **Privacy-first (match data), local-first by default:** G-Log raw data, live match state, and
  CV detections stay **local only** unless the user explicitly opts in. **Two opt-ins exist, and
  they are separate:**
  1. **Account layer (ADR-14)** - stores identity only: email (Google auth), public Steam ids,
     display name, GID - plus reads **public** OpenDota data.
  2. **Data contribution (ADR-11, accepted 2026-06-23; economics in ADR-16)** - the user may
     opt in to share a *specific finished match* in exchange for shard credit. This is the
     data flywheel + marketplace moat (ADR-12). It is **not** enabled by signing in.
  **Hard rules that survive both opt-ins:** nothing leaves the machine for a match the user did
  not submit; **CV detections never leave the machine, ever** (third-party consent + Valve risk);
  shared data is used **post-match / as aggregate prior only** - never fed back as live enemy
  positions into the same match (= maphack; Valve banned ~40k accounts and killed Overwolf for
  this - ADR-11 §5); `match_id` is stored only as `HMAC(match_id)` (ADR-16 §5).
  If you are about to enforce "never upload anything", read ADR-11 and ADR-16 first - an absolute
  reading of this rule has silently dropped the flywheel strategy several times.
- **Resilience:** on cloud/network loss, G-Sentry and G-Signal must keep running on the local SLM.

### Key external interfaces

- **Dota 2 GSI** â†’ local HTTP POST on **port 3000**, JSON payloads from the player's own machine.
  The same :3000 server also accepts `POST /telemetry` (GPU feeder, below) and `POST /announcer/install`.
- **Cloud cognitive engine** â†’ Gemini was the original design target, but the **shipped** cloud path
  is the **Claude CLI / Anthropic Messages API** (`claude-haiku-4-5`) with an **Ollama** local-SLM
  fallback (`src-tauri/src/master.rs`, backends `Auto | Claude | Ollama`). Gemini is not wired.
- **TTS module** â†’ text-to-speech tuned for a live-caster vocal style (Windows SAPI via PowerShell
  today; Piper local-ONNX TTS is planned but not the default).
- **GPU telemetry** â†’ a bundled headless sidecar `gpu-feeder/` (repo-root, zero-dep crate) runs
  `nvidia-smi` in its own process and `POST`s to `/telemetry`; the main app never spawns nvidia-smi,
  so the NFR budgets stay about its own work. Governor merges it into `resource-stats` (deck footer);
  shows "—" when the feeder isn't running (30s staleness).

## Announcer event packs (G-AnnStudio)

Maiden voices community-made announcer packs on top of TTS. A pack is a **bundle** — a folder
`voice-cache/packs/<id>/` with a `manifest.json` that maps each event to clips **and a banner image**,
plus `clips/` and `banners/` (managed by `voice_api.rs` + `src/src/AudioSettings.tsx`). Per fired
event, `audio::play_random` resolves clips in order: **(1) the ACTIVE pack's mapped clips**
(`voice_api::active_event_clips`), (2) the legacy flat `voice-cache/{event}/*.wav`, (3) the bundled
default pack; `speak_event` falls back to SAPI TTS when none is found — so **activating a pack
actually changes what's voiced in-game**.

- **Event contract** — the canonical event ids live in `G-Suite/schemas/gmaiden-events.json`
  (mirrored in `src-tauri/src/voice_api.rs` `EVENTS`). Beyond G-Signal's `danger`/`gank`/`revision`
  and G-Master's `advice`, the announcer set is fired by `src-tauri/src/announcer.rs` from each GSI
  `game-tick`: `match_start`, `first_blood`, `kill`, multi-kills (`double_kill`/`triple_kill`/
  `ultra_kill`/`rampage`, 18s window), the streak ladder (`killing_spree`/`dominating`/`mega_kill`/
  `unstoppable`/`wicked_sick`/`monster_kill`/`godlike`/`beyond_godlike`), and
  `death`/`respawn`/`levelUp`/`hpLow`/`manaLow`.
- **Banner + sound bundle ("queue banner")** — on the GSI path, when `announcer::most_important`
  picks the event to voice, `gsi.rs` also emits the **`announcer-banner`** event
  (`voice_api::fired_banner`; the banner image is inlined as a base64 `data:` URL because the overlay
  CSP is `img-src 'self' data:`). The overlay (`App.tsx` `packBanner`) then shows the active pack's
  banner **image** for that event, replacing the built-in kill card (falls back to the card when the
  pack maps no image). Preview without a match: the **"Show on overlay"** button in `AudioSettings.tsx`
  → the `preview_announcer_event(pack_id, event)` command fires the exact same path.
- **Kill-banner sync (enforce)** — the streak ladder in `announcer.rs` mirrors the overlay kill
  banner (`src/src/App.tsx` `STREAK_LABELS`) exactly, so the voiced streak and the on-screen banner
  always agree. Both detect kills from `tick.kills` rising-edge and reset on death. Audio is
  single-slot, so `announcer::most_important` voices only the top-priority event per tick. If you
  add/rename a streak tier, change it in **both** places + `gmaiden-events.json`.
- **Authoring + install** — packs are built in **G-AnnStudio** (the
  [G-Suite](https://github.com/Freshair129/G-Suite) monorepo): import → Whisper auto-split → AI maps
  clips to events → installs into voice-cache, then `POST /announcer/install` on the :3000 GSI
  server (handled in `src-tauri/src/gsi.rs` `announcer_install`). The handler **auto-activates**
  the installed pack (`voice_api::activate_if_exists` — the same file write the "activate" UI
  action uses) unless the body sets `"activate": false`, so the pack really is picked up live, not
  just copied to disk. It accepts `packId` (preferred) or the legacy `pack` key, and returns real
  per-event counts resolved from the pack's manifest (`voice_api::install_report`, replacing the
  old `audio::all_counts()` folder-count that had no notion of a manifest-based pack). Because
  `:3000` has no auth, activation is limited to packs that already exist on disk — the endpoint
  never creates/writes/moves/extracts files, so the worst a rogue local POST can do is switch the
  active pack. Known gap: an already-open Voice Packs UI does not auto-refresh after a remote
  install (no listener wired) — reopen it to see the change.
- **Manifest path-traversal + zip-slip hardening — CLOSED (2026-07-10):** `manifest.json`'s
  `clips[]` / `bannerAsset` / `coverImage` are attacker-influenced (the manifest ships inside
  imported `.zip` packs), so every join of one of those strings onto a pack dir in `voice_api.rs`
  now goes through one shared helper, `safe_pack_path(pack_dir, rel) -> Option<PathBuf>` — it
  rejects absolute/drive/UNC/verbatim paths and any `..` component structurally (via
  `Path::components()`), and canonicalizes+contains-checks the target when it exists (catches a
  symlink escape too). Archive import (`voice_api::import_archive`) no longer shells out to
  PowerShell `Expand-Archive`; it extracts in-process via the `zip` crate (already transitive via
  `tauri-plugin-updater`), validating every entry's `enclosed_name()`/`is_symlink()` before writing
  anything. See `docs/rca/2026-07-10-voice-pack-path-traversal.md`.

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

