# RCA — GMAD desktop Terms handoff loop

## Symptom

Desktop first-run stopped at `terms_required`. Clicking the CTA opened the landing `/terms` page, but that page only offered `Return to G-Maiden landing`, so re-checking in desktop returned to the same blocked state.

## Evidence

- Desktop `terms_required` state opened `https://g-maiden-landing.vercel.app/terms` from [`src/src/GmadFirstRunGate.tsx`](file:///g:/G-Maiden/src/src/GmadFirstRunGate.tsx).
- Production `/terms` rendered a read-only legal page with no form controls, no checkboxes, and no accept action; only a return link existed in [`landing/src/App.tsx`](file:///g:/G-Maiden/landing/src/App.tsx).
- Actual Terms receipt creation happened only inside the GMAD download flow via `accept-closed-beta-terms` in [`landing/src/gmad.ts`](file:///g:/G-Maiden/landing/src/gmad.ts).
- The receipt function required both `required_terms_accepted=true` and `age_requirement_confirmed=true`, so a read-only `/terms` page could never satisfy the desktop entitlement gate.

## Root Cause

The desktop-first-run contract and the landing implementation diverged:

- Desktop correctly treated landing as the acceptance surface for current Terms.
- Landing implemented receipt capture only inside the `#gmad` download card, not on `/terms`.

That made the desktop CTA point to a page that could never produce the server receipt required to leave `terms_required`.

## Why it escaped detection

- Desktop tests preserved blocked states but did not exercise the end-to-end recovery path `terms_required -> landing acceptance -> re-check -> eligible`.
- Landing tests covered download gating rules but did not verify that `/terms` itself was a functional acceptance surface for desktop handoff.
- Visual verification previously confirmed that the legal document rendered, but not that the page could record acceptance.

## Fix

1. Upgraded landing `/terms` into a functional acceptance surface:
   - signed-out users now get a Google sign-in CTA that returns to the same Terms page;
   - signed-in users can check required Terms + age confirmations;
   - the page calls `accept-closed-beta-terms` directly and shows success guidance for returning to desktop.
2. Added a desktop handoff context query (`?from=desktop`) to make the landing copy explicitly guide the user back to the app for re-check.
3. Added landing tests for the Terms acceptance gating contract.

## Proposed prevention

- Add one integration/UAT case that starts from desktop `terms_required`, completes landing acceptance, and verifies desktop re-check reaches `eligible`.
- Treat `/terms` as a release-critical surface in landing QA, not just a legal-content mirror.
- Keep desktop handoff routes and landing acceptance routes under one shared acceptance checklist whenever CR-021/CR-022 behavior changes.
