---
title: "Account and GID UX"
doc_id: "08-account-gid"
status: "active"
version: "1.5.0"
updated: "2026-11-03"
owner: "Boss"
---

# Account and GID UX

This document describes account surfaces as optional identity features. They do not gate local
desktop startup, GSI setup, capture, or overlay use. The account uses Google OAuth as its sign-in
method; GID and Steam identifiers are not credentials or recovery factors.

## Account entry points

| Surface | Behavior |
| --- | --- |
| Profile trigger | Shows the signed-in profile or a guest state and links to Account. |
| Account page | Owns Google OAuth, identity display, and Steam linking. |
| Insights that need account data | Explain the missing account link and offer navigation to Account. |
| Command palette | Provides sign-in, copy-GID, Steam-link, and sign-out actions when available. |

## Google sign-in

Google OAuth uses the system browser and the local callback endpoint. The UI reports waiting,
success, cancellation, timeout, and callback failure inline. A failed sign-in leaves local-only
features available. Session and identity checks remain server-side for protected account
operations.

### Waiting-state timeout and retry

The native pending callback gate expires after 10 minutes. The WebView also needs a finite wait
state so closing the system browser cannot leave sign-in stuck at “Opening…” indefinitely. Allow
2 seconds after the native gate deadline for a loopback expiry error to reach the WebView.
Bound Supabase sign-in setup and PKCE code exchange to 60 seconds each so a stalled provider call
cannot leave the UI busy forever. These deadlines are UI feedback only; they do not fence a session
commit already running inside the shared Supabase client.

**Acceptance criteria**

- Starting Google sign-in shows a busy/waiting state while the system browser is active.
- Sign-in setup and code exchange each end their UI busy state after 60 seconds if the provider
  call does not resolve.
- A callback success or callback error received before the UI deadline clears the waiting state
  and its timer.
- If no callback or error arrives by 602 seconds, the UI shows an inline timeout and enables
  retry.
- Native callback and error events carry an SDK-supported per-attempt correlation value. Do not
  invent or overwrite the OAuth protocol `state` parameter. An event for another attempt is ignored
  and cannot consume or clear the current attempt.
- An account identity change before callback exchange invalidates the pending attempt.
- Code exchange runs in attempt-isolated auth storage. A timed-out or superseded exchange cannot
  publish its session to the app; promote a session into the shared client only while the attempt
  and captured account generation remain current.
- A callback from a timed-out or invalidated attempt is ignored by the WebView and is not
  exchanged for a session.
- Timeout changes only sign-in feedback: it does not sign out, clear existing credentials, or
  block guest/local features.
- UI deadlines do not cancel in-flight Supabase requests. Until attempt-isolated exchange is
  implemented, do not treat a timeout as protection against a late SDK session commit.

**Success criteria**

- Fake-timer tests cover setup/exchange/callback deadlines, stale event rejection, account-switch
  invalidation, and callback completion; native tests prove a mismatched state does not consume
  the current gate.
- Existing OAuth callback, profile-session isolation, and friend-session/consent tests remain
  green.
- No live provider sign-in or account mutation is required for these source checks.

### Verified integration blockers

- The installed `@supabase/supabase-js` 2.110.0 SDK returns an authorization URL with no `state`
  parameter in a network-free `signInWithOAuth` probe. The current `oauthStateFromAuthorizationUrl`
  therefore rejects that real SDK URL before opening the browser. Do not put a synthetic value in
  the OAuth `state` parameter.
- The installed PKCE exchange saves the returned session and emits `SIGNED_IN` inside the SDK
  operation before `exchangeCodeForSession` resolves. A local timeout cannot stop that shared-client
  session mutation; the current flow is not session-isolated after exchange starts.
- Supabase documents an experimental `sb_flow_id` PKCE option for carrying a supported flow ID
  through the redirect. The installed 2.110.0 package does not expose it. Using it also requires an
  authorized redirect allow-list entry that accepts the added callback query parameter.

Until these blockers are resolved, source-level UI timeout checks do not establish working or
session-safe Google login. The bounded next design is to use a supported callback flow ID, exchange
inside a per-attempt client with isolated secure storage, and promote only a still-current session
to the shared client. Verify and authorize the Supabase redirect allow-list change before enabling
that callback contract.

## GID display

- Format: `G-[Generation][Payload][Checksum]`.
- The GID is a stable identity handle. The Supabase UUID remains internal.
- Display the GID in Account with a copy action; shortened profile surfaces may show a compact
  version.
- The generation marker `B` remains parseable for existing identifiers and is displayed as
  `Legacy` for compatibility.

## Steam linking

Account holders may link a public Steam profile. Invalid, private, or unavailable profiles receive
clear inline states. Unlinking removes the account association from the UI; local match data and
desktop setup remain available.

## Privacy and security

- Keep raw match, capture, and G-Log data local.
- Do not use a GID, Steam ID, installer, or URL as authentication proof.
- Do not add password login, recovery factors, public profiles, or account-data sharing without
  their separate approved security and privacy design.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.2.0 | 2026-10-18 | Replaced retired access-gate flow with the current optional account contract. |
| 1.3.0 | 2026-11-03 | Specify finite Google OAuth waiting-state feedback and retry without changing the native callback gate or saved credentials. |
| 1.4.0 | 2026-11-03 | Bound OAuth setup and exchange feedback, correlated native callback events, and fenced stale attempts after account changes. |
| 1.5.0 | 2026-11-03 | Record SDK callback and shared-session commit blockers; require supported flow correlation and isolated exchange before login is considered session-safe. |
