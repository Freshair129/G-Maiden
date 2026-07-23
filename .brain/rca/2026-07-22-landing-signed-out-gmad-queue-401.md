---
version: "0.1.0b"
created_at: "2026-07-22T01:22:00+07:00,ATHER"
last_update: "2026-07-22T01:22:00+07:00,ATHER"
status: "beta"
superseded_by: null
attributes:
  doc_type: "root-cause-analysis"
  domain: "closed-beta-landing"
  scope: "signed-out GMAD queue UX"
---

# RCA — Signed-out GMAD queue check exposed an SDK error

## Symptom

On production, a signed-out user who selected “เช็กสิทธิ์ของฉัน” received the technical message
`Edge Function returned a non-2xx status code`; the browser console and network log showed a `401`
from `check-gmad-queue`.

## Evidence

- Playwright reproduced the error on `https://g-maiden-landing.vercel.app/` with clean browser storage.
- `useGmadAccess.check()` invoked the protected Function without checking for a Supabase session.
- The Function correctly has `verify_jwt=true`, so the platform rejected the request before the
  handler could return its friendly `signed_out` state.

## Root Cause

The Landing relied on a protected server endpoint to classify a state that the client can safely
determine before making a request: whether an issuer session access token exists. The resulting
platform-level `401` was passed through as a generic SDK error.

## Why the issue escaped detection

Contract tests covered queue-state normalization and download gating but did not exercise the
signed-out UI-to-Function boundary on production.

## Proposed prevention and applied correction

- Check for an issuer session access token before invoking `check-gmad-queue`.
- Render the existing `signed_out` state with the Google sign-in CTA and make no Function request.
- Retain `verify_jwt=true` and server-side user validation; the client check is UX only, not trust.
- Keep a production signed-out browser case in the release verification matrix.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-22 | beta | Documented and corrected the signed-out queue request leaking a platform 401 into the UI. | null | ATHER |
