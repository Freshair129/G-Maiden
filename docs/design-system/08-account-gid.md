---
title: "Account and GID UX"
doc_id: "08-account-gid"
status: "active"
version: "1.3.0"
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

**Acceptance criteria**

- Starting Google sign-in shows a busy/waiting state while the system browser is active.
- A callback success or callback error received before the UI deadline clears the waiting state
  and its timer.
- If no callback or error arrives by 602 seconds, the UI shows an inline timeout and enables
  retry.
- A callback from a timed-out attempt is ignored by the WebView and is not exchanged for a
  session.
- Timeout changes only sign-in feedback: it does not sign out, clear existing credentials, or
  block guest/local features.

**Success criteria**

- Fake-timer tests cover timeout, late-callback rejection, and callback completion before the
  deadline; existing OAuth callback and session-fencing tests remain green.
- No live provider sign-in or account mutation is required for these source checks.

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
