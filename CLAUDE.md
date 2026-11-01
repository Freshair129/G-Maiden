---
title: "CLAUDE.md"
doc_id: "claude"
status: active
version: "0.4.11"
updated: "2026-11-01"
owner: "G-Maiden"
---
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: implemented (v0.13.2), shipping via in-app updater

The project is scaffolded and shipping — **Tauri v2 + React/Vite + Rust**. For the current
implementation state, module status, repo layout, and coding rules see **AGENTS.md**. The two
specs remain the source of truth for *requirements*:

- `docs/product/product-requirements.md` (PRD) — vision, modules, persona, ADR-01 naming.
- `docs/product/software-requirements-specification.md` (SRS) — functional + non-functional requirements,
  external interfaces, performance budgets. The SRS is the more detailed/authoritative of the two.

Both are written in Thai. `docs/product/mvp-decisions.md` is the accepted authority for MVP
scope, access, privacy and quality; PRD/SRS define functional requirements and must align with it.
Treat accepted SRS quality thresholds as hard constraints, not aspirations. Keep current behavior
separate from targets and cite implementation/evidence before claiming acceptance. Build/test
commands now exist: `cargo test` (from `src-tauri/`), `npx tsc --noEmit` (from `src/`),
`pnpm tauri build` (from repo root). Releases go through the **Release & update workflow** below.


## What G-Maiden is

A real-time AI companion / co-pilot ("**Maiden**", inspired by Dota 2's Crystal Maiden) that
narrates and advises during live Dota 2 matches via voice + a transparent on-screen overlay. It
reads live game data through Valve's **GSI (Game State Integration)** and reacts within a strict
latency budget without disrupting the player's focus.

## Architecture intent (from the SRS)

Hybrid **client-server**, split by latency requirement:

1. **Local Gateway (G-Sensory tier)** — receives raw GSI data, processes the minimap, and emits
   ultra-low-latency voice alerts. G-Signal critical-path work is local pure Rust with cached audio;
   it has no cloud, SLM, or WebView dependency.
2. **Optional cloud advice** — current G-Master provider path is Claude CLI / Anthropic API with
   Ollama for local advice fallback (`master.rs`). MVP cloud game context is off by default and
   requires the separate own-stat allowlist opt-in in `docs/product/mvp-decisions.md`. This runtime
   enforcement remains an implementation/acceptance task; current provider wiring is not proof it
   is already enforced. G-Voice, G-Memory, CV, G-Log, audio, and transcript never enter cloud.

### The G-Series modules (ADR-01: every module is prefixed `G-`)

| Module | Responsibility |
| --- | --- |
| **G-Sentry** | Fog-of-war monitor — current CV loop polls every 250ms normally, 125ms with missing heroes, and 500ms under CPU throttle (`capture.rs`); MVP target is event-driven evaluation and 500ms watchdog/freshness only; flags enemies missing >5s |
| **G-Motion** | Time-off-map risk heuristic — keeps 5 min of last-seen enemy positions. **No heatmap or learned path model ships** (`motion.rs` is an explicit v1 heuristic); "predicts gank routes" is the design target, not the build |
| **G-Signal** | Real-time gank warning — **voice interrupt** when risk crosses the `Sensitivity` bar; the hard-latency path. Default **Med = 0.65 danger / 0.40 clear**. `DANGER_THRESHOLD = 0.85` is the **Low** rung only (the conservative SRS baseline); High is 0.50/0.30 |
| **G-Master** | Strategic/financial advisor — skill/item build advice vs. enemy Net Worth & items |
| **G-Sensory** | Overlay rendering + hardware optimization (glassmorphism HUD, FPS/resource budget) |
| **G-Log** | Feedback loop — logs decisions/outcomes locally to tune prediction params next match |

**Screen capture (G-Sensory CV)** uses **DXGI Desktop Duplication**, not WGC (ADR-13 / CR-001) —
GPU copy within one vsync. Dota 2 ต้องรันแบบ borderless-fullscreen (`-window -noborder`); ถ้า capture
เริ่มไม่ได้ แอปจะ fall back เป็น **GSI-only "Lite mode"** (ไม่มี minimap CV แต่เสียง/overlay/G-Master ยังทำงาน).
WGC เดิมเก็บไว้หลัง `--features wgc` (`capture_wgc.rs`).

**MVP scope contract (2026-10-10):** [[mvp-decisions]] governs product target and quality thresholds.
G-Voice and G-Memory remain Companion P0; both are still incomplete at runtime. Acceptance targets
Windows x64 builds 19045/26100, live 5v5 All Pick Ranked/Unranked, and initial CV layout 1920×1080,
16:9, one primary display, 100% DPI, default HUD/minimap bottom-left, borderless-fullscreen. Other
modes/layouts need calibration/evidence; unknown or empty coverage is not a safety assertion.

**Command-deck UI (`src/src/CommandDeck.tsx`)** -- the control window renders a bento "command
deck" (`Dashboard.tsx` + `companion.ts`) with a GSI/LIVE header, a trend stat bar, and hero flip
cards (status VISIBLE / LOW / MISSING / DEAD). It is **live-wired** (CR-002 Phase 2a/2b, merged
`170805b8`): `useCompanionData()` subscribes to Tauri events (`game-tick`/`gsi-status`/`minimap-cv`/
`enemy-missing`/`gank-alert`) and merges pure builders in `src/src/live/` over a baked `MOCK`
fallback, so the deck itself renders signed-out/offline. Release-mode native acceptance remains
pending. Own-game honest limit:
GSI exposes only the local
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

**Accounts & GID (ADR-14)** -- accepted MVP target sets `account_gate_required=false` and keeps
`account_surface_exposed=true`: local core starts without account/session/entitlement/network, while
protected account actions stay server-authorized and Google remains the sole primary sign-in. The deck
and local GSI/capture runtime do not wait for Google sign-in or network. Release-mode native
acceptance remains pending; do not claim the target is shipped until the cold/offline/revoke matrix is verified. Google
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

When adding any new module/feature, keep the `G-` prefix (ADR-01) for brand/scalability unity.

### Hard constraints (non-functional — enforce these)

- **G-Signal end-to-end latency: target 250ms, never exceed 300ms.**
- Whole-app process-group CPU normalized by logical CPU capacity ≤ **10% per 1-second sample** (MVP decision v0.2.0);
  aggregate peak Working Set ≤ **900,000,000 bytes** including host/WebView2/feeder/STT/SLM/model
  processes; Dota 2 FPS impact ≤3% per paired acceptance run.
- Overlay must not drop Dota 2 FPS by more than **3%**, and must not obscure minimap, skill bar,
  or stats panels.
- **Privacy-first (match data), local-first by default:** G-Log raw data, live match state, and
  CV detections stay **local only** under the existing contract. **Account, AI and the new
  G-Party peer route have separate authorization/consent boundaries:**
  1. **Account layer (ADR-14)** - identity and public OpenDota profile data; sign-in is not cloud
     game-context consent.
  2. **MVP cloud-context opt-in** - separate local preference for only the own-stat allowlist in
     `docs/product/mvp-decisions.md`; API-key entry, backend choice, sign-in, or Ask does not imply
     consent. Opt-out cancels future sends and invalidates stale responses.
  3. **G-Party peer sharing (MVP-005A)** — checked explicit sharing consent plus create/join
     activation for the selected relay; no view-only/auto-join/saved credentials or app-account
     requirement. Only admitted own hero/level/HP/maxHP/MP%/alive/respawn and bounded protocol
     metadata cross this route. Same room/match/team is required; raw match ID/SteamID stay
     local and the room-scoped hash is a pseudonym, not anonymity or game attestation. Received
     peer stats do not enter AI/Memory/G-Log. Relay sees shared stats; remote HTTPS is required
     and no E2EE/hosting/deployment claim is made. See [[FEAT-G-PARTY]]; detailed implementation
     decisions and pending native/live evidence are separate from owner-authorized scope.
   **MVP denylist:** G-Log/history/replay, G-Memory including aggregates, CV/enemy fields, raw
   GSI/GameTick, match ID, items/exact clock/self-burst, local paths/diagnostics, account/security
   data, microphone audio, transcript, and free-form Voice questions stay local. Do not infer that
   older ADR-11 finished-match contribution or a user sign-in authorizes these paths.
- **Resilience:** G-Sentry/G-Motion/G-Signal and local Voice/Memory do not depend on cloud. G-Signal
  is pure Rust and does not fall back to SLM; non-critical advice may use local Ollama or report
  unavailable.

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

The interface authority is [[gann-event-media-contract]].

The 2026-10-31 user instruction replaces the previous legacy/default/VRZO-specific
announcer media contract. Event media is admitted only from a verified local `.gann`
container. Studio authors original/mixed WAV and silent WebM pairs, verifies the
container, and installs through the same `g-ann-package` crate used by Maiden.
The original archive remains under `voice-cache/containers/<SHA-256>.gann`; its
bounded verified cache lives under `voice-cache/packs/ann_<UUID>/`.

- Runtime selects one event mapping from `ann_<UUID>.json`, then plays that mapping's
  mixed audio and silent video through the native playback lifecycle. No flat-cache,
  bundled-default, embedded catalog, hardcoded clip-list, generated event-card or TTS
  fallback may supply announcer event media. Missing or invalid mappings stay silent
  and record a reason. Native event taxonomy, priority and session fences remain Rust.
- Studio Event Test builds and reads the same GANN artifact that is exported or
  installed. Raw source auditions are authoring tools, not event playback proof.
- Import never changes selection. `POST /announcer/install` activates only an
  already installed, verified GANN and requires its `containerSha256`; `/health`
  supplies `voiceRootId` so Studio checks the selected runtime before activation.
  The endpoint never accepts an arbitrary write path or extracts an upload.
- Signatures, Store receipts and account authorization remain separate from local
  package integrity. Local GANN installation confers no Store entitlement.
- G-Signal remains Rust-only with prewarmed packaged audio and no SLM/WebView
  dependency. Dynamic non-event advice is separate from the announcer media resolver.
- Source checks, package tests and injected native GSI tests are distinct from live
  Dota, acoustic synchronization and whole-match resource acceptance. Record each
  result explicitly in the implementation plan and validation evidence.

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
| **Ctrl+Alt+V** | G-Voice PTT default for MVP; runtime not implemented yet, check collision and support remap |

## Custom Agent Skills (Review & Alignment Gate)

The workspace has local Agent skills registered in `.agents/skills/`.


## Visual language

Premium-dark dashboard: background `#08090c`, frosted ice-aluminium panels
`rgba(18, 20, 28, 0.72)`, glassmorphism overlay in Maiden's ice palette. Modular control panels.

## Release & update workflow

Users receive updates through an **in-app updater** (Tauri updater plugin). Releases move along
**two channels** — a build is never published straight to the public. See
`docs/releases/release-channel-architecture.md` for the full design.

**Pushing a tag does NOT publish anything.** There is no `release.yml`; both workflows are
`workflow_dispatch` only. A tag is an input you hand to a workflow, not a trigger.

| Channel | Audience | Manifest | Set by |
| --- | --- | --- | --- |
| `dev` | internal testers | `release/channels/dev.json` | `candidate-release.yml` |
| `stable` | public | `release/channels/stable.json` | `promote-release.yml` (production approval) |

- **In-app update — the channel goes in the URL, never in `target`.** This is the one rule that
  keeps the updater working; breaking it is what made the feature inert for months.
  In `tauri-plugin-updater` a single `target` string is used **both** to fill `{{target}}` in the
  endpoint **and** as the key looked up in the manifest's `platforms{}`. So the channel cannot ride
  on `target`: `check({target:'dev'})` fetches the right file and then looks for a `platforms['dev']`
  that generated manifests never carry, and a bare `check()` asks for a `channels/windows.json` that
  does not exist.
  The Rust command **`check_channel_update`** (`lib.rs`) therefore builds the endpoint itself from a
  hardcoded per-channel URL (`update_channel::ReleaseChannel::manifest_url`) and passes **no target**,
  so the plugin's own `{os}-{arch}-{installer}` → `{os}-{arch}` fallback resolves the real keys and
  MSI/NSIS installs each get their own artifact. `install_pending_update` installs what the check
   offered. The webview passes a **channel enum, never a URL**. Minisign verification is untouched.
   The current desktop client checks only the signed `stable` manifest, and account sign-in does not
   change updater or local-runtime state.
  **Manifests are keyed by platform id, never by channel name**, and `channel-manifest.mjs`
  `validateManifest` now rejects channel-name keys so the old shape cannot come back.
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

### VRZO v8 runtime correction

VRZO v8 verifies the selected original WAV snapshot and the bundled mixed WAV snapshot separately, then admits exactly one mono48k PCM16 source through rodio. Mixed bytes must match their catalog hash, format and original duration; failure plays original once, suppresses the v8 visual and logs the reason. Lifecycle carries distinct original/played hashes. Silent video is cancelled even during its natural-completion tail. Native GSI owns gameplay pack events when announcer is enabled; Overlay does not issue a second persona clip. Personal events require player SteamID agreement with the active local Steam login (read-only HKCU ActiveProcess.ActiveUser; provider SteamID is not required); unknown identity is silent, owner changes reseed, and aggregate kill jumps do not establish multi-kill timing. Native acoustic/sync and false-event match acceptance remain unverified.


## VRZO filesystem revision 3 transition contract (historical)

Owner-directed local candidate change,2026-10-30: ID manifest revision3 preserves every sound ID and all63 WAV bytes;21silent1280x560 VP9 alpha files now60fps/CRF32 with one lossless transparent final frame. Native width680px/max72vw. Natural completion permits a3.2s silent tail, including approximately0.7s eased fade; expiry still bounds it.

Same-scope announcer replacement starts the new selected event immediately at normal audio rate/gain. Previous visual plays2x with300ms opacity fade; previous voice receives a sample-accurate150ms fade. Bound to one active plus one outgoing visual/sink; a third arrival removes oldest outgoing. Preparation admission is3slots, at most12MiB PCM. Critical/non-announcer interruption, explicit cancellation, pack revision/session invalidation or live announcer disable hard-stops stale announcer sources. Audio owner validates scoped sources on its50ms control loop, outside the output callback. Draft match_start retains the active-session contract. New audio remains uniquely selected/verified; overlap is a bounded old-source retirement authorized by the owner.

Verified native video byte cache is24MiB/6entries, keyed by admitted revision/path/hash/file metadata. One worker coalesces the latest pending warmup, preloads FirstBlood/DoubleKill/firstKill on activation/startup, then predicts next multikill on relevant events. Pack cache rebuild invalidates snapshots and stale worker insertion. It does not preplay audio or run hidden animations, and byte warmup does not establish decoder readiness. Local-only G-BannerVisual receipts record browser frame/drop/first-frame counters; native playback, visual smoothness and900,000,000-byte resource acceptance must be measured separately. No SQL/release or player-data egress.

Current checks/asset/native evidence: ignored target/vrzo-smooth-20261030 and Studio workspace/vrzo-smooth-v3. Historical v8/v2 receipts remain historical; these local receipts do not establish release or native acceptance.


## VRZO filesystem revision 4 ready-frame contract

This runtime contract supersedes the revision3 video/runtime policy. Release and native acceptance remain separate. Revision4 keeps all IDs and63 WAV bytes;21 silent VP8 alpha videos are960x420/60fps, rendered directly from1280x560 Canvas sources. Apparent width remains680px/max72vw. Video ends with a fully transparent frame after its intended3.2s post-audio tail (including0.7s eased fade).

The Overlay owns at most3 video DOM nodes total: active, optional retiring, and remaining paused warm candidates. Native ID-only hints carry resolved pack generation, on startup/activation, predicted events and Control variant selection. Muted first-frame preparation pauses rather than looping hidden media; admitted playback reuses the prepared node. Scope change destroys stale candidates. Same-generation hints preserve useful paused nodes and evict only an unclaimed lower-priority candidate under capacity pressure. Byte-cache warmup alone is not decoder readiness. The ID protocol allows at most3 simultaneous verified reads and waits at most500ms for a permit, then checks the generation again; no arbitrary webview filesystem path is accepted.

Natural completion permits the queued current=0 lifecycle state while its audio generation and scope still match. Video ended clears normally; native/frontend hard caps allow up to4.2s after completion receipt (3.2s intended tail plus1s bounded decoding grace), under the original15s lifetime. Duplicate completion cannot extend the deadline. Cancellation, critical interruption, pack/session invalidation and expiry remain hard fences. Same-scope replacement retains the old visual2x/300ms opacity fade and old voice150ms fade; incoming image/audio start without waiting for old retirement, at normal rate. At most one active and one outgoing source remain.

Local visual receipts distinguish warmed/cold, wait count, first nontransparent presented frame (frame1 rather than transparent frame0), frame/drop deltas excluding preparation, full media duration and ended/cleared/error. Native acceptance must separately verify FirstBlood, DoubleKill, Rampage, quiet drops, complete fade and rapid differing-event insertion. Target ready first present<=100ms and quiet drops<=1% per clip. Source/asset tests do not establish these native gates or acoustic/whole-match/FPS acceptance. Aggregate RAM ceiling900000000bytes, original Nakhom, local-only data and filesystem-only persistence remain unchanged. Evidence: target/vrzo-ready-20261030 and Studio workspace/vrzo-smooth-v4; native results are recorded there without rewriting failed v3 evidence.

## Local .gann container (2026-10-30)

Owner-authorized local package import is available separately from signed Store installation. `.gann` v1 is an indexed ZIP with `gann.json`, one canonical `ann_<UUID>.json`, ID-named audio/video, and inert authoring stock under `motion/`. Preserve registry config/component/instance/cue IDs and unknown authoring fields. Do not execute imported scripts. No SQL is introduced.

Trusted Control imports a local file, validates bounded paths/counts/sizes and SHA-256 references, admits all native audio/video pairs, preserves a content-addressed original under `voice-cache/containers/<sha256>.gann`, and atomically installs a playback cache under `packs/<announcer_id>/`. Identical reimport is idempotent; a conflicting same-ID package is refused and active selection remains unchanged. A local origin record is not a Store receipt, signature or entitlement. Release runtime inventory/equip/clip validation must explicitly accept admitted local containers without weakening the signed Store path. Events use existing native caches and do not unzip in the audio hot path.

G-AnnStudio opens the same container through its package panel or a file argument, inspects configuration, previews each mapped mixed WAV with its muted WebM, and can save a byte-identical copy. A file association is declared for installed builds; a no-bundle build does not register it in Windows. Existing authoring projects are not overwritten. Evidence and portable source are under Studio `workspace/gann-container-v1`; tests/build/UI results there remain distinct from live-match, acoustic, frame-drop or whole-match resource acceptance.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.4.2b | 2026-10-18 | Documented account-optional local startup and pending native acceptance. |
| 0.4.0b | 2026-10-10 | Reconciled accepted MVP scope, privacy/access rules, hard-path constraints, and quality limits. |
| 0.3.0b | 2026-08-11 | Documented the candidate-release and same-artifact promotion workflows, batching policy, updater endpoint, and APP_VERSION path. |
| 0.2.1b | 2026-07-22 | Normalized reader-facing product naming while preserving technical identifiers and anchors. |
| 0.2.0b | 2026-07-21 | Added desktop delivery and account handoff context. |
| 0.1.0b | 2026-07-21 | Added the planned GID security and privacy-safe web-profile contract; no implementation is implied. |
| 0.4.1b | 2026-10-16 | Remove retired local review integration and its references. |
| 0.4.3 | 2026-10-28 | Align active RAM target with owner-approved800MB aggregate full Working Set (MVP decision v0.4.0); retain accounting and historical evidence. |
| 0.4.4 | 2026-10-28 | Align active MVP RAM ceiling to owner-approved900MB aggregate Working Set; preserve accounting and historical evidence. |
| 0.4.5 | 2026-10-29 | Record VRZO visual/audio identity, bounded lifecycle, preview and native acceptance boundaries. |
| 0.4.6 | 2026-10-29 | Record verified v8 mix, single audio owner, personal-event identity and pending native acceptance. |
| 0.4.7 | 2026-10-30 | Record larger60fps ID visuals, predictive bounded cache and owner-authorized visual/audio retirement. |
| 0.4.8 | 2026-10-30 | Record revision4 paused decoder preparation, VP8 media and bounded natural-completion grace. |
| 0.4.9 | 2026-10-30 | Document user-authorized .gann filesystem import and shared G-Ann opener. |
| 0.4.10 | 2026-10-31 | Replace announcer fallback routes with verified GANN-only event media and bound activation. |
| 0.4.11 | 2026-11-01 | Add separately consented G-Party own-stat sharing guidance without widening AI/raw-data permissions or claiming native/live acceptance. |
