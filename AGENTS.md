---
title: "AGENTS.md"
doc_id: "agents"
status: active
version: "0.4.7"
updated: "2026-10-29"
owner: "G-Maiden"
---
# AGENTS.md

> Context and governance for AI coding agents (Codex, Claude Code, Copilot, etc.)
> working on the G-Maiden codebase. Read this before touching any file.

---

## What is G-Maiden?

A **real-time AI companion for Dota 2** that narrates and advises during live matches via voice + transparent on-screen overlay. It reads live game data through Valve's **GSI (Game State Integration)** and reacts within a strict latency budget without disrupting the player's focus.

The persona is "**Maiden**" — inspired by Dota 2's Crystal Maiden. Gentle, intelligent, statistically credible, meme-aware (self-deprecating about CM's nerfed movement speed), and capable of mid-sentence belief revision when a prediction is wrong.

## Accepted MVP Contract

`docs/product/mvp-decisions.md` is the accepted target for MVP scope, account access, cloud data,
and quality. G-Voice and G-Memory remain Companion P0, but neither is complete at runtime yet.
Target acceptance: Windows x64 builds 19045/26100; live Dota 2 5v5 All Pick Ranked/Unranked; CV at
1080p 16:9, one primary display, 100% DPI, default bottom-left minimap, borderless-fullscreen.
Other modes/layouts require calibration/evidence; unknown coverage must be reported as unknown.
This target does not claim a tested compatibility result or shipped runtime behavior.

Local core starts without account/session/entitlement/network; the account surface remains optional
and protected actions remain server-authorized. GSI/capture start independently of sign-in.
Release-mode native acceptance of cold/offline/revoke behavior is still pending, so do not claim
release readiness from code checks alone.

Cloud game context is off by default and limited to the explicit own-stat allowlist after separate
opt-in. G-Voice audio/transcript/free-form question, G-Memory including aggregates, CV, raw
GSI/GameTick, G-Log/history/replay, account/security fields and local diagnostics stay local.
G-Signal is pure Rust with no cloud or SLM dependency. `Ctrl+Alt+V` is the MVP PTT default to
implement; `Alt+M` remains mute. These are product targets until implementation/evidence lands.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop shell | **Tauri v2** (Rust + WebView2) | RAM/CPU budget; transparent overlay; native perf |
| Frontend | **React 18 + Vite + TypeScript** | Single-file App.tsx, inline styles (glassmorphism) |
| Backend | **Rust** (axum, tokio, rodio, tract-onnx) | Latency-critical path must be Rust-only (ADR-03) |
| CV pipeline | **DXGI Desktop Duplication → ONNX detector** (ADR-13) | Minimap hero detection; borderless-fullscreen required, Lite-mode fallback |
| Audio | **rodio** (in-process WAV playback) | Sub-1ms cancel, no cmd flash |
| TTS | **Windows SAPI** (PowerShell, planned: Piper ONNX) | Thai voice, latency fallback chain |
| Cloud advice | **Claude CLI / Anthropic API** (`claude-haiku-4-5`) | Non-critical G-Master advice only under MVP-005 separate opt-in/own-stat allowlist; runtime enforcement acceptance remains open |
| Local SLM | **Ollama** (HTTP, model chosen in UI) | Local non-critical advice fallback; G-Voice must keep its transcript local and G-Signal never depends on any SLM |
| GPU telemetry | **`gpu-feeder/`** sidecar (nvidia-smi → POST /telemetry) | GPU/VRAM/temp in the deck footer; keeps nvidia-smi out of the main process |

---

## Repository Layout

```
G-Maiden/
├── CLAUDE.md              # Instructions for Claude Code (authoritative)
├── AGENTS.md              # This file — cross-agent governance
├── CHANGELOG.md           # Keep a Changelog format
|- docs/                  # Canonical documentation hub (SSOT)
|  |- README.md           # Documentation overview
|  |- DOC-INDEX.md        # Document index and tracking (SSOT)
|  |- FEATURE-LEDGER.md   # Feature map and registry
|  |- product/            # Product requirements & roadmap (PRD, SRS)
|  |- architecture/       # Core architecture design
|  |  |- adr/             # Architecture Decision Records (ADR-10 to ADR-18)
|  |  |- spikes/          # Technical proofs and spike notes
|  |- design-system/      # UI foundations, tokens, sitemap/IA (Iceglass Command Deck HUD v2)
|  |- features/           # Specs for individual G-series modules (FEAT-G-*)
|  |- releases/           # Release governance and update workflow
|  |- change request/     # Change Requests (CR-001 to CR-033) & execution plans
|  |- operations/         # Operations runbooks and validation forms
|  |- audits/             # Security and codebase audits
|  |- rca/                # Root Cause Analysis notes for release failures
|  |- guides/             # Developer setups and prompting guides
|  |- research/           # Concept notes and competitive analysis
|  `- superpowers/        # GID pipeline plans and specs
├── models/                # ONNX models + labels (bundled in release)
├── gpu-feeder/            # Headless nvidia-smi sidecar (zero-dep crate) → POST /telemetry
├── src/                   # Frontend (React/Vite)
│   ├── package.json
│   └── src/               # App.tsx (Overlay+Control), CommandDeck.tsx + companion.ts + live/*.ts (deck),
│                          #   app/cards/AudioSettingsCard.tsx (voice settings), account/auth/gid modules
├── src-tauri/             # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs        # Entry point, Tauri commands, module registry
│       ├── gsi.rs         # GSI HTTP server (axum :3000): /gsi, /telemetry, /announcer/install, /auth/callback + watchdog
│       ├── damage.rs      # G-Damage: burst damage calculator + hero DB
│       ├── audio.rs       # rodio playback (dedicated thread + mpsc channel)
│       ├── tts.rs         # Windows SAPI TTS (PowerShell, base64 Thai)
│       ├── capture.rs     # DXGI Desktop Duplication (screen → frames); WGC behind --features wgc (capture_wgc.rs)
│       ├── cv/            # Computer vision pipeline
│       │   ├── mod.rs     # Pipeline orchestrator
│       │   ├── region.rs  # Minimap region detection
│       │   ├── prefilter.rs # Color-ring candidate prefilter
│       │   └── detector.rs  # ONNX inference (128 heroes)
│       ├── sentry.rs      # G-Sentry: fog-of-war monitor (missing >5s)
│       ├── motion.rs      # G-Motion: 5-min last-seen ring buffer + time-off-map risk heuristic (no heatmap/path model yet)
│       ├── signal.rs      # G-Signal: hysteresis danger/clear latch + Sensitivity (Low/Med/High) + belief revision
│       ├── master.rs      # G-Master: advisor via Claude CLI / Anthropic API + Ollama SLM fallback (Auto|Claude|Ollama)
│       ├── log.rs         # G-Log: local JSONL match logging
│       ├── runtime.rs     # Shared state (in_game, last_post_ms)
│       └── setup.rs       # GSI config auto-install + Dota process detection
└── .github/workflows/     # CI: tag → signed NSIS/MSI release
```

Also in `src-tauri/src/` (not drawn above): `dxgi.rs` (DXGI backend), `announcer.rs` (announcer event
detector), `voice_api.rs` (voice-pack bundles + `EVENTS` table + `fired_banner`), `governor.rs`
(resource governor + GPU telemetry ingest), `slm.rs` (Ollama offline advice), `revive.rs`/`respawn.rs`
(G-Revive buyback), `counter_advice.rs`/`items.rs` (counter-item build advice), `ocr.rs` (PP-OCR),
`identity.rs` (Steam id resolution), `usage.rs` (Claude quota), `calibration.rs` (capture calibration).

---

## Architecture (Two-Tier)

```
┌─────────────────────────────────────────────────────┐
│  LOCAL GATEWAY (G-Sensory tier)                      │
│  GSI (:3000) → GameTick / own-player / session / score-derived enemy deaths │
│                                                                            │
│  Capture (DXGI) → minimap CV detections → G-Sentry → G-Motion → G-Signal  │
│                                               ↑                            │
│                            enemy-death count ┘                            │
│                                             → cached alert audio           │
│                                                     │
│  ┌──────────┐  ┌────────┐                           │
│  │ Overlay  │  │ G-Log  │  (all local, no egress)   │
│  │ (WebView)│  │(JSONL) │                           │
│  └──────────┘  └────────┘                           │
└─────────────────────────────────────────────────────┘
         ↕ (non-critical, degrades gracefully)
┌─────────────────────────────────────────────────────┐
│  OPTIONAL CLOUD ADVICE                               │
│  G-Master only; separate opt-in + own-stat allowlist │
│  Fallback: local Ollama or unavailable               │
└─────────────────────────────────────────────────────┘
```

---

## G-Series Modules (ADR-01: all prefixed `G-`)

| Module | Status | Responsibility |
|--------|--------|---------------|
| **G-Sentry** | Done | Fog-of-war monitor — current CV loop polls at 250ms normally, 125ms while missing heroes, and 500ms under CPU throttle (`capture.rs`); MVP target is event-driven evaluation, with 500ms only as watchdog/freshness cadence; flags enemies missing >5s |
| **G-Motion** | Done | Time-off-map risk heuristic — 5-min ring buffer of last-seen positions (no heatmap/path model yet) |
| **G-Signal** | Done | Gank warning — voice interrupt at the Sensitivity danger threshold (default Med 0.65; clear 0.40) |
| **G-Master** | Done | Advisor — Claude CLI / Anthropic API + Ollama SLM fallback (Auto\|Claude\|Ollama) |
| **G-Sensory** | Done | Overlay rendering + resource budget (glassmorphism HUD) |
| **G-Log** | Done | Local-only match logging (JSONL) |
| **G-Damage** | Done | Burst damage calculator — hero DB + armor/magic resistance formulas |

---

## Hard Constraints (Non-Functional — ENFORCE THESE)

| Constraint | Target | Consequence of violation |
|-----------|--------|------------------------|
| G-Signal end-to-end latency | p50 ≤ 250ms, **every measured sample ≤300ms** from acquisition/GSI arrival to audible onset | Player dies before warning |
| Whole-app CPU | ≤ 10% normalized by logical CPU capacity, every 1s sample (MVP decision v0.2.0) | Game stutters |
| Whole-app RAM | Aggregate peak Working Set ≤ 900,000,000 bytes, including host/WebView2/feeder/STT/SLM/model processes | Swap thrash |
| FPS impact | ≤ 3% Dota 2 FPS drop | Unacceptable for competitive play |
| **Privacy** | G-Log, G-Memory (including aggregates), CV, Voice audio/transcript local only; own-stat cloud context requires separate opt-in + allowlist | No implicit egress from sign-in/Ask/provider choice |
| **Resilience** | G-Sentry/G-Motion/G-Signal and local Voice/Memory work without cloud; G-Signal has no SLM dependency | Core safety must survive disconnects |
| **Signing key** | `.tauri/` is gitignored | **NEVER commit signing keys** |

---

## Coding Rules

### Rust (src-tauri/)
- Critical path (GSI → G-Signal → cached alert audio) must be **pure Rust** — no cloud, SLM, or webview in the hot path (ADR-03)
- `OutputStream` (rodio) is `!Sync` — lives on dedicated `g-audio` thread, communicate via `mpsc::channel<Cmd>`
- All new modules must follow `G-` naming convention (ADR-01)
- Run `cargo test` before committing — **291 tests** (0 failed, 5 ignored, measured 2026-08-28), all must pass. CI gate is `cargo clippy --all-targets -- -D warnings` (built-ahead modules need `#![allow(dead_code)]`)
- Resource-heavy operations (ONNX inference, screen capture) must respect the CPU/RAM budget
- **Screen capture = DXGI Desktop Duplication** (`dxgi.rs` + `capture.rs`), not WGC (ADR-13 / CR-001). WGC on Win10 stalled at ~0.7 Hz / 8% CPU and crashed on the `WithoutBorder` toggle; DXGI is a GPU copy that lands within one vsync. MVP CV target: Windows x64 build 19045/26100; 1920×1080, 16:9, one primary display, 100% DPI, default HUD/minimap bottom-left, borderless-fullscreen. Other geometries require calibration/evidence before certification. On init failure the app falls back to **GSI-only Lite mode** (no minimap CV; local core continues) and shows a Lite badge; no coverage is not a safe assertion. Old WGC path preserved behind `--features wgc`; default build = DXGI.

### TypeScript (src/)
- **Two UI surfaces** (App.tsx is no longer single-file): `src/src/App.tsx` = the **overlay**
  window (in-game HUD) + window routing; `src/src/CommandDeck.tsx` = the **control** window (bento
  deck) with `Dashboard.tsx`, `companion.ts`, pure live builders in `src/src/live/`, and the
  account system (`auth.ts` / `profile.ts` / `supabase.ts` / `gid.ts` + `AccountPage` / `AuthPanel`
  / `SteamLink`). Live data is Tauri events → builders → merged over `MOCK` (CR-002 / ADR-14).
- Frontend tests: **Vitest** (`pnpm -C src test`) — ~110 tests across the live builders (incl.
  telemetry/weekly/insights/history) + GID codec. Run alongside `tsc --noEmit`.
- Inline styles using the `C` color palette and `panel()` glassmorphism helper
- Settings persisted to `localStorage('gm-settings')` — broadcast to overlay via Tauri `emit('settings', ...)`
- Two windows: `control` (main UI) and `overlay` (transparent, click-through, always-on-top)
- Run `npx tsc --noEmit` to verify — zero errors required

### GID security and web profiles (planned; not shipped)
- Google OAuth remains the sole primary sign-in. Do not add a GID/password login or treat GID/Steam
  as a recovery credential.
- The proposed landing web experience has a public, opt-in profile and a signed-in account center.
  The public surface may show owner-selected display fields and an opt-in `GID Shield` badge only;
  it must never reveal email, phone, recovery contacts, security activity, sessions, or match/CV/G-Log data.
- `GID Shield` means Google primary + TOTP MFA + verified recovery email + verified phone OTP. It
  signals enabled account safeguards, not legal identity verification or gameplay skill validation.
- Recovery is passwordless: recovery-email magic link plus TOTP or phone OTP creates a temporary
  recovery session. A Google identity rebind waits 24 hours and produces security alerts; loss of
  all factors requires manual support review. Phone alone cannot recover or move an account.
- Any MFA, SMS, recovery, notification, or public-profile implementation is **C-3 / HIGH**. Before
  code, migrations, or provider setup: document the threat model, define separate RLS-protected
  private storage (not public `profiles` or client-readable auth metadata), establish consent and
  rate limits, and obtain approval.

### Custom Agent Skills & SOP
We maintain custom AI skills under `.agents/skills/`.


### General
- Specs (PRD, SRS) are in **Thai**. `docs/product/mvp-decisions.md` governs accepted MVP scope,
  access, privacy, and quality; PRD/SRS describe requirements and must align with that contract.
- SemVer: MAJOR.MINOR.PATCH — bump version in **5** places: `src-tauri/tauri.conf.json`, `src/package.json`, root `package.json`, `src-tauri/Cargo.toml` (+ `Cargo.lock`), and `APP_VERSION` in `src/src/app/theme.ts`
- Keep a Changelog format in `CHANGELOG.md`
- Comments only when the WHY is non-obvious; no "what" comments
- No feature flags, no backwards-compat shims — just change the code
- Privacy-first: never add telemetry/analytics or player-data egress beyond the accepted
  `mvp-decisions` contract; its own-stat advice allowlist requires separate opt-in and every other
  listed field/route stays local.

---

## Git & GitHub

Enforcement, not style. Every rule below is either enforced by GitHub branch protection or by
`tools/pr-gate-agent/rules.mjs`, and breaking one costs a CI round trip at minimum.

### Branches

- **`main` is protected. Never commit or push to it directly** — everything lands through a pull
  request, including a documentation-only change. Required status checks are `ci` and
  `pr-gate-agent`; `strict` is on, so your branch must be up to date with `main` at merge time.
  Branch protection has `enforce_admins: false`, so the owner *can* push directly — that is an
  owner escape hatch, not a workflow. It bypasses both gates. Do not use it.
- Naming: `wip/<topic>` for multi-commit work, `fix/<topic>` for a bug fix, `docs/<topic>` for
  documentation. Existing examples: `wip/cr034-gid-iam-completion`, `fix/tts-critical-line-prewarm`.
- **This repo has two remotes** — `origin` (`Freshair129/G-Maiden`) and `rwang`
  (`Freshair129/RWANG`). Always `git push -u origin <branch>` on a new branch. A bare `git push`
  with no upstream can reach the wrong repository.
- Worktrees: `.gitignore` has no `.worktrees/` or `worktrees/` entry, so create worktrees
  **outside** the repo (`git worktree add ../gm-<lane> -b <branch>`). A project-local worktree
  directory would be tracked. If you need one anyway, gitignore it and commit that first.

### Commits

- Conventional commits, `type(scope): subject` — `fix(...)`, `feat(...)`, `docs(...)`, `test(...)`,
  `refactor(...)`, `perf(...)`, `chore:`. Scope with the CR id when the work belongs to one.
- **Never `git add -A`.** Parallel sessions on this repo routinely hold unrelated dirty files.
  Stage explicit paths.
- Never `--no-verify`, and never disable commit signing. `required_signatures` is off, so do not
  add `-S` either — leave signing configuration alone.
- An agent-authored commit carries a trailer naming the agent that wrote it.

### Pull requests

`pr-gate-agent` waits for `ci` to finish (up to 60 minutes — CI includes a cold Tauri native
build) and then fails the PR on any of:

| Finding | Trigger |
| --- | --- |
| `merge-conflict` | PR conflicts with `main` |
| `missing-ci` / `ci-not-green` | the `ci` check is absent or not `success` |
| `empty-diff` | PR exposes no changed files |
| `missing-scope-rationale` | wide-scope PR whose body has no rationale section |

- **Wide-scope** = more than 3 top-level path buckets changed (`docs`, `src`, `src-tauri`,
  `supabase`, `landing`, `tools`, `scripts`, …) **or** any change under `.github/workflows/`.
  Such a PR's body must contain `## Summary`, `## Rationale`, `## Scope`, or a
  `scope-justification:` line. `.github/PULL_REQUEST_TEMPLATE.md` satisfies this by default —
  do not delete its `## Summary` heading.
- Prefer several narrow PRs over one wide one. Narrow PRs also review faster and revert cleanly.
- A **draft** PR relaxes the conflict and CI findings. Open work-in-progress as a draft rather
  than leaving a red non-draft PR sitting on the gate.
- **Do not force-push or amend once a PR is open** — `dismiss_stale_reviews` is on, so a rewrite
  discards the gate's posted review and restarts the cycle.
- `required_approving_review_count` is `0`. That means the automated gate is the only *mandatory*
  reviewer — it is **not** permission to self-merge. The owner merges.
- `required_conversation_resolution` is on: every review thread must be resolved before merge.
- If `ci` fails, fix the cause. Never disable a check to get green.

### Documentation changes

Any change under `docs/`, or to `CLAUDE.md`, `AGENTS.md`, or `tools/doc-graph/`, runs the
doc-graph gate. Run it locally first — it is far cheaper than a CI round trip:

```bash
node tools/doc-graph/ci-gate.mjs
```

- **It regenerates artifacts** — `docs/DOC-GRAPH.json`, `docs/DOC-GRAPH-REPORT.md`,
  `docs/FEATURE-LEDGER.md`, `docs/FEATURE-ORPHAN-REPORT.*`, `docs/atomic_index.jsonl`. Commit them
  **with** the documentation change; a PR that leaves them stale fails.
- A new or edited document needs frontmatter with `title`, `doc_id`, `status`, `version`,
  `updated`, `owner`; `status` from `draft | active | accepted | stable | superseded | historical`;
  and `version` equal to the last row of that document's own `### VRZO v8 runtime correction

VRZO v8 verifies the selected original WAV snapshot and the bundled mixed WAV snapshot separately, then admits exactly one mono48k PCM16 source through rodio. Mixed bytes must match their catalog hash, format and original duration; failure plays original once, suppresses the v8 visual and logs the reason. Lifecycle carries distinct original/played hashes. Silent video is cancelled even during its natural-completion tail. Native GSI owns gameplay pack events when announcer is enabled; Overlay does not issue a second persona clip. Personal events require player SteamID agreement with the active local Steam login (read-only HKCU ActiveProcess.ActiveUser; provider SteamID is not required); unknown identity is silent, owner changes reseed, and aggregate kill jumps do not establish multi-kill timing. Native acoustic/sync and false-event match acceptance remain unverified.

## Changelog` table — that heading
  **exactly**, since a numbered variant like `## 8. Changelog` is not matched.

---

## Release & Update Workflow

**SSOT for this topic is [CLAUDE.md](file:///g:/G-Maiden/CLAUDE.md) → "Release & update workflow".**
Read it before touching versions. The summary below exists only so this file does not contradict it.

> **Retired, do not follow:** this section previously described a tag-triggered `release.yml` that
> published straight to everyone, and an updater endpoint at
> `releases/latest/download/latest.json`. `release.yml` was **deleted** (`d505cf5c`) and the
> endpoint changed (`48c0f6b3`). **Pushing a tag now publishes nothing.**

### How a release is cut
- Two channels — `dev` → `stable` — each with a manifest under
  `release/channels/`. Both workflows are **`workflow_dispatch` only**; a tag is an *input* you hand
  to a workflow, never a trigger.
- `candidate-release.yml` verifies tag↔HEAD lineage, runs clippy/cargo test/eslint/tsc/vitest,
  builds and **signs once**, publishes a GitHub **prerelease**, and opens a PR updating `dev.json`.
  Someone must merge that PR before `dev` moves.
- `promote-release.yml` runs in the `production` environment (required reviewer: the owner),
  defaults to `dry_run: true`, and **re-points the same signed artifact** — promotion never rebuilds
  and never re-signs.
- Bump the version in **5 places**, not 3: `src-tauri/tauri.conf.json`, `src/package.json`, root
  `package.json`, `src-tauri/Cargo.toml` (+ `Cargo.lock`), and `APP_VERSION` in
  **`src/src/app/theme.ts`** (not `App.tsx` — it moved).
- Local `pnpm tauri build` produces installers but **cannot sign** (no private key locally), so it
  is for smoke-testing only — never the release path.

### How users get updates
- The launch auto-check/banner (`useAppUpdate.ts`) goes through the Rust
  commands **`check_channel_update`** / **`install_pending_update`**, never the updater plugin's JS
  `check()`. **The channel goes in the endpoint URL, never in `target`** — the plugin uses one
  `target` string for both the URL template and the `platforms{}` key, so overloading it breaks one
  or the other. Manifests stay keyed by platform id; `channel-manifest.mjs` rejects channel-name keys.
- The desktop currently checks only the signed `stable` updater manifest. The renderer supplies no
  channel or URL; account sign-in does not change update or local-runtime state.
- The accepted MVP target lets local core use the signed stable updater channel without account
  authorization. Code follows that policy, while release-mode native acceptance is still pending; do not say
  runtime acceptance is complete before the offline/revoke matrix is exercised.
- **A commit/push to `main` does NOT reach users** — only a manifest that a workflow wrote and a
  human merged/approved does.

### Batching policy (IMPORTANT — don't churn versions)
- **Small fixes → land on `main` WITHOUT tagging.** Accumulate them. "Land on `main`" still means
  through a pull request (see [Git & GitHub](#git--github)); the point of this rule is *no tag*,
  not *no PR*.
- **Only bump the version + push a tag when the user asks to release**, or when a meaningful batch
  has accumulated. Do not cut a release per fix — that ran 0.7.0→0.7.1→0.7.2 in minutes once and
  burned version numbers needlessly.
- If the user needs an unreleased fix tested in-game, build locally (`pnpm tauri build`) or ask
  before cutting a release.
- **Push a version tag ONLY after the CI run on `main` is green.** Never tag off a commit whose CI
  status is unknown, pending, or red — watch the `CI` workflow finish on the exact commit being
  tagged first. (Root cause + evidence: [[2026-07-10-release-gate-drift-v0.9.0]] (`docs/rca/2026-07-10-release-gate-drift-v0.9.0.md`) — tag
  `v0.9.0` failed three times against pre-existing clippy/eslint/verify-gate debt that a green
  CI-on-main run would have caught before burning a release attempt.)

### Review / verify-gate checklist (must match CI, not a subset)
The pre-lead review gate's definition of "green" must run the **same checks CI runs** — a gate
that only runs a subset of CI will pass changes CI then rejects. Before calling any change ready
to hand off or tag, run all of:
- `cargo test` (Rust, from `src-tauri/`)
- `cargo clippy --all-targets -- -D warnings` (from `src-tauri/`; toolchain pinned by
  `rust-toolchain.toml` at the repo root so local clippy == CI clippy)
- `pnpm -C src exec eslint .` (0 errors — frequently skipped locally; this is what let a
  `prefer-const` error through to `main` in the v0.9.0 RCA)
- `pnpm -C src exec tsc --noEmit` (zero errors)
- `pnpm -C src test -- --run` (Vitest)
- Tauri smoke build, `--no-bundle` (compiles Rust + builds the frontend without needing the
  updater signing secret; `candidate-release.yml` runs this unsigned before the signed build)

**Known-good baseline (2026-08-28)** — a count below these is a regression, not a removed test:
Rust **291 passed** / 0 failed / 5 ignored · desktop Vitest **268 passed** (27 files, ~21 s) ·
landing Vitest **14 passed** (4 files, ~2.3 s) · Deno `supabase/functions/_shared/` **24 passed**.

**Bound every suite with a timeout** so a stall fails loudly instead of hanging — roughly ten times
the baseline: `timeout 300 pnpm -C src test`, 120 s for landing Vitest and Deno, 900 s for a cold
`cargo test`. PowerShell has no `timeout` command; use Git Bash for these. A suite that hits its
ceiling is evidence to capture live (`Get-Process node | Select Id,StartTime,CPU`, and the run's
own output under `DEBUG='vite:*'`), not a known issue to work around.

**Vitest flags are not portable between the two workspaces.** `src/` is on Vitest 1.6.1 / Vite 5;
`landing/` is on Vitest 4.1.10 / Vite 8 / TypeScript 7. `--reporter=basic` works in `src/` and was
removed in Vitest 4, where it fails as a reporter-load stack trace that looks nothing like a bad
flag.

---

## Current State (v0.13.2 shipping)

### What works
- GSI server receives Dota 2 game state on `:3000`
- Transparent overlay with glassmorphism HUD (position: top/left/right/custom)
- HP danger alerts with voice (rising-edge, 8s throttle, belief revision)
- Minimap CV pipeline: DXGI capture → color prefilter → ONNX detector → G-Sentry → G-Motion → G-Signal (borderless-fullscreen required; GSI-only Lite-mode fallback on capture-init failure — ADR-13/CR-001)
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
- **G-Store & Credits (ADR-16 / CR-003)**: virtual wallet schema live on `gstore`; catalog seeded; coin packages seeded (`active=false`). Faucet (`match-share-submit`) and topup (`topup-create` / `payment-webhook`) Edge Functions fully implemented; JWT verification configured in `supabase/config.toml`; candidate legal draft documents prepared.
- **GID security/web profiles are proposed only, not shipped**: TOTP MFA, phone OTP, recovery email,
  security activity/alerts, and an opt-in public profile/badge require the C-3/HIGH contract above.
- **Account behavior**: Google sign-in and Steam linking are optional identity features. The main
  deck, GSI server, and capture start without account authorization; protected account operations
  remain server-authorized. Native release-mode acceptance remains pending.
- rodio audio backend (in-process WAV, <1ms cancel)
- Individual stat toggles (timer, score, HP/Mana, K/D/A, gold/NW)
- Custom overlay positioning with X/Y sliders + profile save/load
- Overlay preview without affecting Dota/GSI status chips
- G-Damage engine with 8-hero database and burst damage calculator
- G-Master advisor (Claude CLI / Anthropic API + Ollama SLM fallback, 30s throttle)
- Companion P0 status: G-Voice two-way PTT/STT/answer is planned and not implemented; G-Memory
  has a partial local reader/snapshot slice. Do not describe either as complete; see
  `docs/features/FEAT-G-VOICE.md` and `FEAT-G-MEMORY.md`.
- G-Log local JSONL logging
- **Announcer packs and VRZO banner:** source integration selects the active pack's actual event clip. For `pack_vrzo_20261028` v0.2.0, a local 15-event/21-variant catalog maps the SHA-256 of the bytes decoded by rodio plus selected event and clip ID to bundled composite WebM. The video is muted; rodio owns audio. Unknown/mismatched clips do not produce this visual. A bounded off-audio-thread lifecycle fences playback/session/pack, gives natural completion at most 1.4 s silent tail, and clears on cancel/preemption/new playback/scope change. A VRZO variant picker previews the exact selected clip in Control when VRZO is equipped, isolated from live match state. Other pack banners retain their existing path. Catalog identity/hash validation does not make a locally imported pack a signed Store pack or grant entitlement. See [[vrzo-banner-validation]] (`docs/operations/vrzo-banner-validation.md`). WebView2 alpha/mute, cold timing, in-game sync and 900 MB resource acceptance remain NOT_RUN.
- **Deck panels live-wired (Phase 2c)**: telemetry footer, weeklyReport, insights, history,
  agentSector.status now use real data (resource-stats / OpenDota / G-Log / GSI); buildAdvisor still MOCK
- **GPU/VRAM/temp telemetry**: bundled headless `gpu-feeder` sidecar (nvidia-smi → POST /telemetry);
  deck footer shows real GPU or "—" when the feeder isn't running
- In-app updater (GitHub Releases + minisign)
- GSI config auto-installer + Dota watchdog
- ~130 Rust unit tests + ~110 Vitest across all modules

### What's next (see [[roadmap]] (`docs/product/roadmap.md`))
- **Phase 3** (v0.6): Piper local neural TTS for Thai voice (SAPI ships today)
- **Phase 4** (v0.7): G-Master Claude CLI/Anthropic API route exists (Gemini specifically deferred);
  accepted MVP cloud-context opt-in/allowlist enforcement and evidence remain open, and G-Voice is local-only
- **Phase 5** (v0.8): Local SLM offline resilience — DONE via Ollama
- **Phase 6** (v0.9): G-Log probability calibration (logs are already JSONL, not SQLite)
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
- G-Log/history/replay, G-Memory including aggregates, CV/enemy fields, raw GSI/GameTick,
  Voice audio/transcript/free-form utterance, account/security data, and local diagnostics stay
  **local only**. G-Master cloud context is off by default and limited to the accepted own-stat
  allowlist after separate opt-in; sign-in, provider choice, and Ask are not consent.
- CV capture is **read-only** — no injection or memory access (Risk R-06)
- GitHub Secrets: `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- No telemetry, no analytics, no crash reporting that sends player data
- Account security/contact data must be private, minimal, RLS-protected, and excluded from public
  profiles, client-readable auth metadata, Vercel Analytics, and all game-data pipelines

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
9. **Account security is C-3/HIGH**: do not implement MFA, phone/SMS, recovery, notifications, or
   public profiles without an approved threat model, private-data/RLS design, and rollback plan

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.4.3b | 2026-10-18 | Documented account-optional local startup and the remaining native acceptance work. |
| 0.4.2b | 2026-10-16 | Removed the retired local review integration and its references. |
| 0.4.1b | 2026-10-12 | Recorded the owner-directed CPU budget update to 10% and the governor's one-second throttle/release policy. |
| 0.4.0b | 2026-10-10 | Added accepted MVP target versus runtime status, required but incomplete Voice/Memory P0, supported matrix, local-only data rules, account-optional startup, and accepted quality limits. |
| 0.3.1b | 2026-08-28 | Corrected the Rust test count to the measured 291, added known-good baselines for all four suites, mandatory timeout ceilings with the capture-live rule, and the cross-workspace Vitest flag-portability warning. |
| 0.3.0b | 2026-08-28 | Added the Git & GitHub section — protected-`main` and PR-only landing, branch naming, the two-remote push hazard, worktree placement, commit conventions, the `pr-gate-agent` failure table with its wide-scope rationale trigger, and the doc-graph regenerated-artifact rule — and disambiguated the batching policy's "commit to `main`" as "no tag", not "no PR". |
| 0.2.1b | 2026-07-22 | Normalized reader-facing product naming while preserving technical identifiers and anchors. |
| 0.2.0b | 2026-07-21 | Added authoritative GMAD delivery, legal-consent, and desktop first-run handoff context for cross-session agents. |
| 0.1.0b | 2026-07-21 | Added governance for proposed GID security, recovery, and privacy-safe web profiles; no implementation is implied. |
| 0.4.4 | 2026-10-28 | Align active RAM target with owner-approved800MB aggregate full Working Set (MVP decision v0.4.0); retain accounting and historical evidence. |
| 0.4.5 | 2026-10-28 | Align active MVP RAM ceiling to owner-approved900MB aggregate Working Set; preserve accounting and historical evidence. |
| 0.4.6 | 2026-10-29 | Document VRZO decoded-clip visual identity, lifecycle, preview, pack trust and remaining native acceptance. |
| 0.4.7 | 2026-10-29 | Record verified v8 mix, single audio owner, personal-event identity and pending native acceptance. |
