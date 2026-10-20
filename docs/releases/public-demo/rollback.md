---
title: "G-Maiden Public Demo Rollback"
doc_id: "rollback"
status: "active"
version: "0.2.0"
updated: "2026-10-18"
owner: "Boss"
---

# Public Demo Deployment and Rollback

## Scope

This runbook covers the informational landing page and its deterministic `/demo` experience. It
does not cover desktop runtime, GSI, account services, or release-channel promotion.

## Pre-deploy checks

1. `pnpm test`
2. `pnpm typecheck`
3. `pnpm build`
4. Open the landing and `/demo` on desktop and mobile viewports.
5. Verify playback, restart, timeline, captions, mute, keyboard navigation, and reduced motion.
6. Confirm the demo uses synthetic data and makes no live-game or account requests.
7. Check that analytics does not transmit URL query, fragment, account data, or game data.

## Rollback triggers

- A route prevents the landing or demo from loading.
- Demo controls fail in a supported browser.
- A client-side secret or account/game data appears in a public bundle or network request.
- Mobile layout blocks essential content or keyboard access.

## Rollback procedure

1. Identify the deployment immediately before the problematic change.
2. Promote the prior deployment or revert the reviewed change.
3. Verify `/` and `/demo` load on desktop and mobile.
4. If data escaped the documented boundary, stop the affected data flow and open a separate
   security incident.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.2.0 | 2026-10-18 | Removed retired enrollment and authentication steps from the demo rollback plan. |
