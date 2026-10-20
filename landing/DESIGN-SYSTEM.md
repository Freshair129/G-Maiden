---
title: "G-Maiden Landing Design System"
doc_id: "landing-design-system"
version: "1.0.0"
updated: "2026-10-18"
status: "active"
owner: "Boss"
---

# G-Maiden Landing Design System

## Purpose

The landing page explains G-Maiden and offers a deterministic public demo. It is an informational
surface; it does not enroll users, issue identities, or control desktop access.

## Page structure

1. A responsive Hero with approved artwork, product summary, and links to the demo and feature list.
2. A local MP4 demonstration section.
3. A development-status section that separates the local runtime, optional account features, and
   evidence required before release claims change.
4. Four feature rails for G-Sentry/G-Motion, G-Signal, G-Master, and G-Sensory/G-Log.
5. A privacy statement describing the local handling of raw match and capture data.
6. `/demo` and `/public-demo`, which render the synthetic deterministic scenario.

The page structure and visible copy live in `landing/src/App.tsx`; the interactive scenario lives
in `landing/src/PublicDemo.tsx`.

## Visual rules

- Use the dark, ice-blue palette defined by CSS custom properties in `landing/src/index.css`.
- Keep the Hero open and media-led; keep feature rails readable without turning them into a dense
  card grid.
- The primary action opens the public demo. The secondary action moves to the feature section.
- Keep Thai product copy clear and avoid claims that imply hidden-game information or guaranteed
  predictions.
- Preserve the static Hero path for touch and reduced-motion users. Decorative motion must never
  capture pointer input or block native scrolling.

## Accessibility and responsive behavior

- Navigation links and controls need visible keyboard focus.
- The mobile menu closes with `Escape`, restores focus to its trigger, and locks body scrolling only
  while open.
- Honor `prefers-reduced-motion`; keep all content and actions available when motion is disabled.
- Support widths from 320px upward without horizontal overflow. Recheck the Hero, video, roadmap,
  feature rails, and demo controls at desktop and mobile sizes.

## Privacy boundary

- The public demo uses synthetic scenario data and does not read local files, screen contents, or a
  Dota process.
- Landing analytics, when enabled in production, is limited to redacted aggregate page views.
  Query strings and fragments are removed; no custom account or game events are sent.
- Account sign-in is optional to desktop local-core use and is not a landing or demo requirement.

## Acceptance checks

- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass in `landing/`.
- Browser review covers the desktop and mobile layout, keyboard menu, playback controls, and reduced
  motion.
- Any production-readiness claim includes current deployment evidence; old screenshots and deploy
  identifiers alone are not current acceptance.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-10-18 | Replaced retired enrollment and launch-countdown guidance with the current public-demo design. |
