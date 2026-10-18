---
title: "Account Sign-out Failure Contract"
doc_id: "auth-failure-remediation-proposal"
version: "0.3.0"
status: "active"
updated: "2026-10-18"
owner: "Boss"
attributes:
  doc_type: "account-security-contract"
  domain: "account-identity-security"
  change_class: "C-3"
  risk: "HIGH"
---

# Account Sign-out Failure Contract

This document covers account-session cleanup. Signing out of an account does not stop or gate the
local GSI, capture, overlay, or other local-core features.

## Current behavior

The current account sign-out path attempts to revoke the current server session and then always
attempts local session cleanup. Remote failure does not prevent local cleanup. Local cleanup failure
keeps account authentication blocked and exposes a retryable error. Successful local cleanup with
unconfirmed remote revocation shows a persistent warning rather than claiming full server-side
revocation.

## Contract

1. Block new Google sign-in while local cleanup is running or has failed.
2. Attempt current-session server revocation; treat network or authorization failure as
   unconfirmed, not as a reason to skip local cleanup.
3. Clear the local SDK session and its stored authentication material. Do not delete user settings,
   local match data, or G-Log.
4. If local cleanup fails, keep the user signed out in the UI, preserve the retry state, and report
   that local cleanup did not complete.
5. If local cleanup succeeds but remote revocation is unconfirmed, report that distinction across
   account navigation. Do not claim that other sessions were revoked.
6. Requests to sign out other sessions follow their separate server authorization result and do not
   clear this device's local session.

## Acceptance evidence

- A successful remote response and local cleanup yield a signed-out state without a warning.
- Remote failure still runs local cleanup and surfaces an unconfirmed-revocation warning.
- Local storage deletion failure blocks sign-in and permits a cleanup retry.
- A late SDK refresh cannot restore the session after sign-out.
- Account sign-out does not stop or unlock the local desktop runtime.

Relevant source and tests: `src/src/securitySession.ts`, `src/src/auth.ts`,
`src/src/__tests__/authRemediation.test.tsx`, and `src/src/__tests__/securitySession.test.ts`.

## Verification

```powershell
pnpm -C src test -- --run
pnpm -C src exec tsc --noEmit
```

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.3.0 | 2026-10-18 | Replaced obsolete access-gate material with the current account sign-out contract. |
