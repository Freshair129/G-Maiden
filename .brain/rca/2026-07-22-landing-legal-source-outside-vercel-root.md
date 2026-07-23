---
version: "0.3.0b"
title: "RCA: Landing legal imports were outside the Vercel deployment root"
created_at: "2026-07-22T01:12:00+07:00,ATHER"
last_update: "2026-07-22T01:18:30+07:00,ATHER"
status: "beta"
attributes:
  doc_type: "root-cause-analysis"
  domain: "public-landing"
  scope: "Vercel production build for landing legal routes"
---

# RCA — Landing legal source outside Vercel root

## Symptom

The local landing build passed from `G:\G-Maiden\landing`, but Vercel deployment
`6A1FrsuzvUq7g7J1muy7tXcCRn3S` failed with `UNRESOLVED_IMPORT` for both Closed Beta legal documents.
After resolving the imports, direct production requests to `/terms` and `/privacy` returned `404`.

## Evidence

- `landing/src/App.tsx` imported `../../docs/product/closed-beta-terms-of-use-draft.md?raw` and
  `../../docs/product/closed-beta-privacy-notice-draft.md?raw`.
- Local Vite could resolve both files because the complete monorepo exists on disk.
- `.vercel/project.json` links `G:\G-Maiden\landing` as the project root.
- The Vercel builder reported `/vercel/path0/src/App.tsx` and could not resolve paths above
  `/vercel/path0`; only 40 landing deployment files were downloaded.
- `landing/vercel.json` rewrote only `/ops` to the SPA entry; HTTP checks confirmed `/terms` and
  `/privacy` returned `404` while `/ops` returned `200`.

## Root cause

The implementation crossed two deployment boundaries: runtime source inside the standalone landing
project depended on documentation stored outside the Vercel project root, and the two new client-side
routes were not added to the explicit SPA rewrite allow-list. Local build coverage did not reproduce
the uploaded file set or direct-path routing, so it could not detect either production failure.

## Why the issue escaped detection

- The local build ran against the whole monorepo filesystem rather than a Vercel deployment archive.
- No gate asserted that every static import resolved inside `landing/`.
- The legal page change and Vercel project-root contract were reviewed separately.
- Route verification covered `/ops` but did not enumerate every client-side route in `App.tsx`.

## Proposed prevention

1. Keep deployable legal snapshots inside `landing/src/legal/` while retaining `docs/product/` as
   the governance source of truth.
2. Mark the landing files as generated mirrors and verify byte equality with a build-time sync test.
3. Make `App.tsx` import only the in-root snapshots.
4. Run the normal local gates, then verify with an actual Vercel production build.
5. Keep the Vercel SPA rewrite list synchronized with `/ops`, `/terms`, and `/privacy`, and verify
   each route by direct HTTP request after deployment.

## Remediation evidence

- `App.tsx` imports deployable mirrors from `landing/src/legal/`.
- `scripts/verify-legal-mirrors.mjs` blocks local drift and confirms required in-root inputs during
  the isolated Vercel build.
- `vercel.json` rewrites `/ops`, `/terms`, and `/privacy` to the SPA entry.
- Deployment `dpl_J3zyvfRpu3uhnko4yxZTPwWMG2Zi` is `READY`; direct HTTP checks return `200` for
  `/`, `/ops`, `/terms`, and `/privacy`; browser checks confirm Thai text without mojibake.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.3.0b | 2026-07-22 | beta | Recorded verified in-root mirrors, sync gate, route rewrites, READY deployment, and live browser/HTTP evidence. | null | ATHER |
| 0.2.0b | 2026-07-22 | beta | Added the missing SPA rewrite root cause and direct-route verification prevention. | null | ATHER |
| 0.1.0b | 2026-07-22 | beta | Confirmed the deployment-root mismatch and defined an in-root legal snapshot gate. | null | ATHER |
