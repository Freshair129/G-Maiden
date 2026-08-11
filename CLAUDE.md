# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: implemented (v0.9.0), shipping via in-app updater

The project is scaffolded and shipping — **Tauri v2 + React/Vite + Rust**. For the current
implementation state, module status, repo layout, and coding rules see **AGENTS.md**. The two
specs remain the source of truth for *requirements*:

- `docs/product/product-requirements.md` (PRD) — vision, modules, persona, ADR-01 naming.
- `docs/product/software-requirements-specification.md` (SRS) — functional + non-functional requirements,
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

1. **Local Gateway (G-Sensory tier)** — receives raw GSI data, processes the minimap, and emits
   ultra-low-latency voice alerts. Critical-path work (gank warnings) runs here so it survives
   cloud disconnection by falling back to a **local SLM**.
2. **Cloud Brain (Maiden Scribe)** — drives live-caster persona, narrative continuity, and deep
   analysis via a **cloud LLM** (design target was Gemini; **shipped** path is Claude CLI / Anthropic
   API with an Ollama local-SLM fallback — see `master.rs`). Non-critical; degrades gracefully offline.

### The G-Series modules (ADR-01: every module is prefixed `G-`)

| Module | Responsibility |
| --- | --- |
| **G-Sentry** | Fog-of-war monitor — polls GSI every 500ms; flags enemies missing from vision >5s |
| **G-Motion** | Heatmap/path prediction — keeps 5 min of last-seen enemy positions, predicts gank routes |
| **G-Signal** | Real-time gank warning — **voice interrupt** when danger threshold >85%; the hard-latency path |
| **G-Master** | Strategic/financial advisor — skill/item build advice vs. enemy Net Worth & items |
| **G-Sensory** | Overlay rendering + hardware optimization (glassmorphism HUD, FPS/resource budget) |
| **G-Log** | Feedback loop — logs decisions/outcomes locally to tune prediction params next match |

**Screen capture (G-Sensory CV)** uses **DXGI Desktop Duplication**, not WGC (ADR-13 / CR-001) —
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

**ONE CANVAS sitemap (CR-013, accepted 2026-07-16).** The deck has **7 nav pages**
(single source `src/src/shortcuts.ts` `PAGES`, `Ctrl+1..7`): Dashboard, Live, Voice, **G-Store**,
Insights, Account, Settings. Build folds into Live as a tab (`[สด | บิลด์]`), History into Insights
(`[ภาพรวม | ประวัติ]`) via the reusable `DeckTabs`; **G-Store** gives the orphaned CR-003 economy
(`StorePage`/`WalletTab`/`InventoryTab`/`LedgerTab`) its own seat (`[ร้านค้า | กระเป๋า | คลัง | บันทึก]`).
**Settings is an iOS split view** — a category rail in `CommandDeck.tsx` + `Control` (`App.tsx`)
rendering ONE category at a time via a required `category` prop (the old ~340-line full render is
gone); the in-app updater lives in `src/src/useAppUpdate.ts` (owned by CommandDeck, banner shows on
every settings category). Three standing laws (SSOT `docs/design-system/05-sitemap-ia.md` §2.2):
**R1** no page-level scroll (`.surface`=`overflow:hidden`; only bounded regions scroll), **R2**
overflow → tab or `rowsThatFit()` pagination, **R3** COLD BOOTH `--g-*` tokens only in the deck
(the legacy inline `C` hex palette is Overlay-only).

**Accounts & GID (ADR-14)** -- optional, **additive** sign-in (the deck works without it). Google
OAuth (PKCE, callback on the GSI `:3000/auth/callback` route) → a **GID**, the human-facing
cross-G-series identity (`G-[Gen][Payload][Checksum]`, `src/src/gid.ts`); internal key stays the
Supabase UUID. Backend is the shared `gstore` Supabase project (`profiles` + RLS). Steam is linked
(`resolve_steam_id` in `identity.rs` — vanity/profile/SteamID64) so the deck loads the player's
**public OpenDota** profile + trend baselines. Files: `auth.ts`, `profile.ts`, `supabase.ts`,
`AccountPage/AuthPanel/SteamLink.tsx`. See ADR-14 + `docs/change request/CR-002-*`.

**Planned GID security + web profile contract (not shipped).** Google stays the primary sign-in;
there is no GID/password login, and a GID or Steam link is never an account-recovery credential.
The web landing will distinguish a public, opt-in profile from the signed-in account center. A
public profile may expose only owner-selected display fields and an opt-in `GID Shield` badge;
email, phone, recovery contacts, security activity, sessions, and every match/CV/G-Log datum stay
private. `GID Shield` will mean Google primary + TOTP MFA + verified recovery email + verified
phone OTP; it is not legal identity or skill verification. Recovery is passwordless: recovery-email
magic link plus TOTP or phone OTP issues a short recovery session; rebinding Google identity has a
24-hour hold and sends security alerts. Losing every factor routes to manual support review.
Phone and recovery data require a separate, RLS-protected private data model (not public `profiles`
or client-readable auth metadata), explicit SMS consent/rate limiting, and a C-3/HIGH threat-model
and approval gate before any schema, provider, or route is implemented.

**G-Maiden Closed Beta handoff (landing implemented; legal/desktop gate pending).** The landing at
`https://g-maiden-landing.vercel.app/` has a production G-Maiden queue sector and the owner/admin
controller at `/ops`. G-Maiden artifacts live only in the private Supabase Storage bucket
`gmad-releases`; `request-gmad-download` rechecks the Google-authenticated user, owned GID, and
active grant before minting a five-minute signed URL. Never put the artifact URL in email, treat an
email link as an authorization credential, or allow a typed GID to establish entitlement. CR-020
defines the landing countdown and notification route. CR-021 is a **candidate legal/consent design**:
before it ships, counsel must approve final Terms/Privacy language and the implementation must add
server-written, private, versioned acceptance receipts plus optional-consent withdrawal. The next
planned design task is CR-022: desktop first-run handoff from installed G-Maiden to Google sign-in with
the same GID, current Terms acceptance and active entitlement; it is C-3/HIGH and must be documented
and approved before code. Keep raw match, CV, and G-Log data local even in this flow.

When adding any new module/feature, keep the `G-` prefix (ADR-01) for brand/scalability unity.

### Hard constraints (non-functional — enforce these)

- **G-Signal end-to-end latency: target 250ms, never exceed 300ms.**
- Background CPU usage ≤ **2.5%** on a mid-range chipset; RAM ≤ **400MB** with all modules active.
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

- **Dota 2 GSI** → local HTTP POST on **port 3000**, JSON payloads from the player's own machine.
  The same :3000 server also accepts `POST /telemetry` (GPU feeder, below) and `POST /announcer/install`.
- **Cloud cognitive engine** → Gemini was the original design target, but the **shipped** cloud path
  is the **Claude CLI / Anthropic Messages API** (`claude-haiku-4-5`) with an **Ollama** local-SLM
  fallback (`src-tauri/src/master.rs`, backends `Auto | Claude | Ollama`). Gemini is not wired.
- **TTS module** → text-to-speech tuned for a live-caster vocal style (Windows SAPI via PowerShell
  today; Piper local-ONNX TTS is planned but not the default).
- **GPU telemetry** → a bundled headless sidecar `gpu-feeder/` (repo-root, zero-dep crate) runs
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
actually changes what's voiced in-game**. The bundled default (`src-tauri/voice-pack-default/`,
generated by `tools/voice-gen/gen_default_pack.py`, **must cover all 24 events** — a
`voice_api` unit test enforces this) is also surfaced in the Voice inventory as a first-class
**read-only pack** (`voice_api::DEFAULT_PACK_ID`, pinned first, equippable like a store's default
kit), and every pack's event rows report the real fallback chain (`N คลิป` / `เสียงกลาง` / `TTS`)
instead of a false "missing".

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
  mid-sentence ("เอ๊ะ! เดี๋ยวก่อน!") — this mid-stream correction is a required behavior of
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

## Custom Agent Skills (Review & Alignment Gate)

The workspace has local Agent skills registered in `.agents/skills/`.

* **RWANG Code-Doc Aligner (`rwang-codedoc-aligner`):**
  - **SOP สำหรับ Agent:** ทุกครั้งที่ได้รับคำสั่งให้ตรวจทาน Git Diff หรือก่อนส่งงานตรวจรับ (Walkthrough) เอเจนต์สามารถเรียกใช้งานสคริปต์ [chunk_and_align.py](file:///g:/G-Maiden/.agents/skills/rwang-codedoc-aligner/scripts/chunk_and_align.py) เพื่อตรวจสอบความสอดคล้องกันระหว่างโค้ดที่เกิดการเปลี่ยนแปลงและรายละเอียดในเอกสาร `docs/` ผ่านโมเดล Mellum2 (Local LLM) ได้โดยอัตโนมัติ

## Visual language

Premium-dark dashboard: background `#08090c`, frosted ice-aluminium panels
`rgba(18, 20, 28, 0.72)`, glassmorphism overlay in Maiden's ice palette. Modular control panels.

## Release & update workflow

Users receive updates through an **in-app updater** (Tauri updater plugin). Releases move along
**three channels** — a build is never published straight to the public. See
`docs/releases/release-channel-architecture.md` for the full design.

**Pushing a tag does NOT publish anything.** There is no `release.yml`; both workflows are
`workflow_dispatch` only. A tag is an input you hand to a workflow, not a trigger.

| Channel | Audience | Manifest | Set by |
| --- | --- | --- | --- |
| `dev` | internal testers | `release/channels/dev.json` | `candidate-release.yml` |
| `closed-beta` | invited testers | `release/channels/closed-beta.json` | promotion |
| `stable` | public | `release/channels/stable.json` | `promote-release.yml` (production approval) |

- **In-app update:** the app checks `release/channels/{{target}}.json` on `main`
  (`tauri.conf.json` → `plugins.updater`), where `{{target}}` is the channel resolved in
  `src/src/updateChannel.ts` — from the signed-in account's entitlement, **falling back to
  `stable`** when there is none. It verifies the **minisign** signature before installing.
- **Cutting a candidate:** bump all five version sources (`src-tauri/tauri.conf.json`,
  `src/package.json`, `package.json` root, `src-tauri/Cargo.toml` + `Cargo.lock`,
  `APP_VERSION` in `src/src/app/theme.ts`), add a CHANGELOG entry, commit, tag `vX.Y.Z`, then run
  **candidate-release** with that tag. It verifies tag↔HEAD lineage, runs lint/tests, builds and
  signs once, publishes a GitHub **prerelease**, and writes `dev.json` only.
- **Promoting to stable:** run **promote-release** with the candidate manifest and an approval
  evidence file. It runs in the `production` environment, defaults to `dry_run: true`, and
  **re-publishes the same signed artifact** — promotion never rebuilds or re-signs.

**Non-negotiable (architecture doc §3):**

1. Stable users never see an unapproved candidate.
2. Promotion must not rebuild or re-sign the artifact.
3. A version that failed is burned — never rebuild over it; bump patch/minor and cut a new one.
4. `stable.json` changes only through the approval-gated workflow.
5. Every promotion carries test evidence and a known-issues record.

### Batching policy (avoid version churn)

The gate above answers *how* to release; this answers *when*.

- **Small fixes → commit to `main` WITHOUT tagging.** Accumulate them.
- **Only bump the version and cut a candidate when the user asks** (or a meaningful batch is
  ready). Do not cut per fix — that is what runs the version number away
  ("เวอร์ชันวิ่งทะลุโลก"). Because rule 3 burns failed versions, cutting eagerly costs numbers
  permanently.
- If an unreleased fix needs in-game testing, build locally or ship it to `dev` — not to stable.
  Local `pnpm tauri build` cannot sign, so it is smoke-testing only.

## repo https://github.com/Freshair129/G-Maiden.git
deploy to web by vercel cli

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.3.0b | 2026-08-11 | Replaced the stale tag-publishes-to-everyone release section with the dev/closed-beta/stable channel pipeline that actually ships (candidate-release → promote-release), folded the batching policy into it, and corrected the updater endpoint and APP_VERSION path. |
| 0.2.1b | 2026-07-22 | Normalized reader-facing Closed Beta naming from GMAD to G-Maiden while preserving technical identifiers such as functions, anchors, and storage paths. |
| 0.2.0b | 2026-07-21 | Added GMAD Closed Beta delivery, legal-consent, and desktop first-run handoff context; CR-021 remains counsel-gated and CR-022 is not yet authored. |
| 0.1.0b | 2026-07-21 | Added the planned GID security and privacy-safe web-profile contract; no implementation is implied. |
