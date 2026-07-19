---
title: "ADR: GID — G-Series Account & Identity Layer"
doc_id: "ADR-14-gid-account-identity"
status: "accepted"
version: "1.0.2"
updated: "2026-07-19"
owner: "Boss"
source_of_truth: true
related_docs: ["ADR-10-hybrid-ingestion-resilience", "ADR-11-optin-data-contribution-flywheel", "ADR-12-community-ai-marketplace", "CR-002-Phase2-wire-backend"]
---

# ADR: GID — G-Series Account & Identity Layer

## Status
Accepted · 2026-07-02 · shipped on `main` (merge `170805b8`)

## Context
The command deck was wired to live data (CR-002 / Phase 2a–2b): the self hero card and
stat-bar trends are enriched from the player's **public OpenDota** history. Beyond G-Maiden,
the accepted strategy (**ADR-10** hybrid ingestion, **ADR-11** opt-in data flywheel,
**ADR-12** community marketplace) requires a **user identity** that:

- spans **every product in the G-series ecosystem** (G-Maiden, G-Suite, G-Link, G-Market, …),
  not just this app;
- is stable, unique, and immutable so contributed data / marketplace items / revenue share
  attach to one account forever;
- is **human-facing** (recognizable, brandable, memorable) — a raw UUID is not.

There was no identity layer and no ADR for it. This ADR records the decision.

## Decision

**1. GID is the cross-ecosystem identity.**
`GID` = the human-facing handle used to sign in to *everything* in the G-series. The
**internal key stays a UUID** (Supabase `auth.users.id` = `profiles.id`); the GID is a
separate, pretty, immutable code derived from account facts.

**2. Backend = Supabase `gstore` (shared across the G-series).**
Project `gstore` (ref `wsseitulmcgnolgsrxgh`, ap-southeast-1) — Postgres + Auth — is the
**single account backend for the whole ecosystem**, not a G-Maiden-only DB. Table
`public.profiles` (id uuid → auth.users, email, steamid64, account_id, display_name,
`gid_code`, `generation`, `cohort_seq`) with **RLS** (own-row only). A `gid_counters` table
+ `alloc_cohort_seq()` (SECURITY DEFINER, RLS-locked) allocates per-generation sequences
atomically on signup.

**3. Auth = Google OAuth only (PKCE).**
Sign-in is **Google OAuth** via the system browser, PKCE flow. The redirect lands on
`http://127.0.0.1:3000/auth/callback` — a route on the **existing GSI axum server** (no extra
listener/port) — which emits `oauth-callback`; the webview completes `exchangeCodeForSession`.
Email + phone OTP were built and then **cut** (adoption friction + SMS cost + PII surface).

**4. GID codec ([`src/src/gid.ts`](file:///g:/G-Maiden/src/src/gid.ts)) — single-sourced in TypeScript.**
Format `G-[Generation][Payload][Checksum]`:
- 31-char base31 alphabet, excludes ambiguous `0 1 O I L`.
- [`Generation`](file:///g:/G-Maiden/src/src/gid.ts#L22) ∈ {F Founder, B Close Beta, P Public} — permanent cohort; **Founders are
  identifiable at a glance** as `G-F…` (prestige, per ADR-12 community status).
- `Payload` = base31 of `(registration-day since 2026-01-01)·10⁷ + cohort-sequence`, padded
  ≥5 — encodes only **immutable** data (date + seq), never account state/tier/payment.
- 1-char weighted mod-31 `Checksum` (catches substitution + adjacent transposition).
- Total 8–12 chars; deterministic + reproducible from source, so **any G-app derives the same
  GID** from the same fields; globally unique while `cohort_seq < 10⁷`/generation; immutable.
- The app mints `gid_code` on first sign-in ([`profile.ts`](file:///g:/G-Maiden/src/src/profile.ts), `.is('gid_code',null)` guard) so
  the algorithm lives in **one** place (TS), never duplicated in plpgsql.

**5. Steam identity linking.**
[`resolve_steam_id`](file:///g:/G-Maiden/src-tauri/src/identity.rs#L120) (Rust [`identity.rs`](file:///g:/G-Maiden/src-tauri/src/identity.rs)) turns a raw account_id / SteamID64 / `/profiles/` URL
/ `/id/` vanity (via steamcommunity `?xml=1`, no API key — resolved server-side because
steamcommunity sends no CORS) into `{steamid64, account_id}`. In-game, GSI `player.steamid`
auto-identifies the local player. The 32-bit `account_id` drives the OpenDota enrichment.

**6. Additive, not a gate.**
The deck **works fully signed-out** (MOCK / local play). Signing in only *adds* GID sync +
identity linking. This keeps the local-first experience intact and makes account creation an
explicit opt-in (see Privacy).

## Consequences

### Positive
- One identity across the G-series → foundation for ADR-11 opt-in data attribution and
  ADR-12 marketplace / creator revenue share.
- Memorable, brandable GID with visible Founder status (community prestige).
- Reuses the GSI axum server for the OAuth callback (no new port/dependency on the desktop).
- Codec is deterministic + tested ([`gid.ts`](file:///g:/G-Maiden/src/src/gid.ts), 20 vitest) and portable to other G-apps.

### Negative / Risks
- **PII is now stored** (email from Google; Steam identifiers) in Supabase → PDPA/GDPR-class
  obligations (consent, deletion, retention) once real users exist.
- New hard dependency on Supabase availability for the account features (deck still works
  without it).
- Generation is hardcoded `'F'` in the signup trigger — must be changed to `'B'`/`'P'` when
  cohorts open (consider a config table).

### Privacy reconciliation (updates the "never upload" rule)
The CLAUDE.md/AGENTS.md rule **"G-Log + player match data stay local, never upload"** is
**unchanged and still enforced**: live match state, CV detections, and G-Log JSONL never leave
the machine. The account layer stores only **identity + public identifiers**: email (auth),
`steamid64`/`account_id` (public Steam ids), `display_name`, `gid_code`. Profile enrichment
reads only **public OpenDota** data (gated by the profile's `public` flag). No private match
data is uploaded. Account creation is **opt-in** (additive sign-in), consistent with **ADR-11**.

## Alternatives Considered
| Alternative | Reason Rejected |
| --- | --- |
| No accounts (fully local) | Can't attribute contributed data / marketplace items (ADR-11/12) or span the G-series |
| Local-only UUID as GID | Ugly, not human-facing; no cross-product story |
| Email / phone OTP sign-in | Built then cut — friction, SMS cost, larger PII surface; Google is one-click |
| Steam "Sign in through Steam" (OpenID) | Deferred — heavier Rust callback work; Google covers login now, Steam is linked separately |
| GID generated in plpgsql | Would duplicate the algorithm; kept single-sourced in [`gid.ts`](file:///g:/G-Maiden/src/src/gid.ts) |
| Per-app databases | No shared identity; defeats the cross-ecosystem goal |

## Related Documents
- [[ADR-10-hybrid-ingestion-resilience|ADR-10]] (hybrid ingestion) · [[ADR-11-optin-data-contribution-flywheel|ADR-11]] (opt-in data flywheel) · [[ADR-12-community-ai-marketplace|ADR-12]] (community marketplace)
- [[CR-002-Phase2-wire-backend|CR-002 Phase 2]] (wire-backend) · [`src/src/gid.ts`](file:///g:/G-Maiden/src/src/gid.ts) ·
  [`src/src/auth.ts`](file:///g:/G-Maiden/src/src/auth.ts), [`profile.ts`](file:///g:/G-Maiden/src/src/profile.ts), [`supabase.ts`](file:///g:/G-Maiden/src/src/supabase.ts) ·
  [`src-tauri/src/identity.rs`](file:///g:/G-Maiden/src-tauri/src/identity.rs)

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-07-02 | Accepted — GID cross-ecosystem identity, Supabase `gstore`, Google-OAuth, GID codec, Steam linking, privacy reconciliation |
| 1.0.1 | 2026-07-19 | symbol-link coverage extension (G1.5) |
| 1.0.2 | 2026-07-19 | link/metadata sweep (G1.5) — link `Generation` type |
