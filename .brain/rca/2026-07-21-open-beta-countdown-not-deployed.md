---
version: "0.1.1b"
title: "RCA: Open Beta countdown absent from production landing"
created_at: "2026-07-21T16:30:00+07:00,ATHER"
last_update: "2026-07-21T16:45:00+07:00,ATHER"
status: "beta"
attributes:
  doc_type: "root-cause-analysis"
  domain: "landing-release"
  scope: "Open Beta countdown production visibility"
---

# RCA — Open Beta countdown absent from production landing

## Symptom

The user could not see the approved Open Beta countdown in the landing Hero section.

## Evidence

- Local source `landing/src/App.tsx` contains `OPEN_BETA_AT`, the live countdown renderer, and the
  corrected GMAD Closed Beta heading.
- Local validated build produced `landing/dist/assets/index-BN7ZjEUC.js`.
- On 2026-07-21, `https://g-maiden-landing.vercel.app/` returned HTTP 200 and referenced
  `index-CzRwZDFm.js`, a different deployed bundle.

## Root cause

The countdown change was built locally but was not deployed to the Vercel production project.
Production therefore continued serving the previous bundle. This is a delivery-state failure, not
a React rendering, Hero layout, or countdown-timer defect.

## Why it escaped detection

Local typecheck/build and source inspection were performed, but there was no production bundle
comparison or browser UAT after the change because deployment was intentionally not performed in
the prior step.

## Proposed prevention

For every landing change intended for UAT, require: local build -> Vercel production deploy ->
HTTP bundle identity check -> browser verification of the requested visible element.

## Fix and verification

The validated landing build was deployed to Vercel production as `dpl_3PUgivyfjtFrAR3vbYuz6zYFzJmR`.
The production alias now returns `index-BN7ZjEUC.js`, and that bundle contains the countdown,
elapsed Open Beta state, and corrected GMAD Closed Beta heading.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.1b | 2026-07-21 | beta | Deployed to Vercel production and verified the live bundle contains all requested Hero/GMAD copy. | null | ATHER |
| 0.1.0b | 2026-07-21 | beta | RCA created from local and production bundle evidence; deployment fix pending. | null | ATHER |
