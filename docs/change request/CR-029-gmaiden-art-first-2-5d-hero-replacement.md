---
version: "1.1.0b"
title: "CR-029: G-Maiden Art-First 2.5D Hero Replacement"
doc_id: "CR-029-gmaiden-art-first-2-5d-hero-replacement"
created_at: "2026-07-22T00:43:21+07:00,ATHER"
last_update: "2026-07-22T01:18:30+07:00,ATHER"
updated: "2026-07-22"
owner: "Boss"
approved_by: "Boss"
approved_date: "2026-07-22"
status: "accepted"
superseded_by: null
attributes:
  doc_type: "change-request"
  domain: "public-landing"
  scope: "Replace the rejected MPFB Hero with provenance-recorded cinematic 2.5D media"
  language: "th"
  related_docs:
    - "docs/change request/CR-023-gmaiden-original-3d-hero-scroll-narrative.md"
    - "docs/change request/CR-028-gmaiden-3d-hero-production-handoff.md"
    - ".brain/rca/2026-07-22-mpfb-hero-visual-acceptance-failure.md"
---

# CR-029 — G-Maiden Art-First 2.5D Hero Replacement

## Approved decision

Boss approved replacing the visually rejected MPFB Hero with an art-first 2.5D landing treatment
inspired by the interaction architecture inspected in `D:\dota`: high-quality cinematic media is
the visible source of truth while pointer and scroll input apply bounded presentation motion.

Only the interaction approach may be reused. Images, videos, branding, and remote media from
`D:\dota` are not G-Maiden production assets and must not be copied.

## Classification

| Area | Complexity | Risk |
| --- | --- | --- |
| Public Hero media, provenance, responsive composition, motion and production deployment | C-3 | High |

This change does not alter Google OAuth, GID, queue, Terms, entitlement, Supabase, the desktop app,
or the Open Beta timestamp.

## Production contract

1. Create separate original desktop and mobile G-Maiden key art from the approved cinematic target.
   Store the generation prompt, tool, date, source-reference hash, output hashes, and review state.
2. Replace the Three.js/GLB Hero runtime with semantic `<picture>` media. Fine pointers may apply
   bounded parallax; scroll may apply a passive exit transform. The media must never capture input.
3. Keep headline, CTA, GID state, navigation, and countdown as semantic HTML.
4. Keep the countdown in a dedicated composition zone. It must not cover the face or torso at the
   tested desktop and mobile viewports.
5. Touch, reduced-motion, missing media, and constrained devices receive a static image without
   required motion. No autoplay audio, external media CDN, or runtime image generation is allowed.
6. Remove the rejected GLB and fallback from the landing production path. Retain Studio source and
   provenance evidence; do not delete audit history.

## Motion contract

- Fine-pointer desktop: at most `1.5deg` rotation-equivalent and `24px` media translation, smoothed
  through `requestAnimationFrame`.
- Scroll: passive translate/scale/opacity only during Hero exit; no scroll pinning or hijacking.
- Ambient idle: slow scale/breathing or light drift only; no character-body deformation claim.
- `prefers-reduced-motion: reduce`: disable pointer, idle, and scroll transforms.

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-01 | Desktop and mobile art are original G-Maiden outputs with prompt, tool, hashes, reference role, and production-use review recorded. |
| AC-02 | No Valve/Dota/Crystal Maiden asset or `D:\dota` media is shipped. |
| AC-03 | MPFB GLB/fallback and Three.js are absent from the landing production runtime. |
| AC-04 | Hero, Thai copy, GID CTA, and countdown are readable at `1440x900`, `1366x768`, `390x844`, and `320x568` without horizontal overflow. |
| AC-05 | Countdown does not cover the character's face or torso in captured desktop/mobile evidence. |
| AC-06 | Pointer and scroll motion are bounded, decorative, passive, and disabled by reduced motion. |
| AC-07 | Landing typecheck/build pass and visual QA compares the approved target with the rendered implementation in one evidence artifact. |
| AC-08 | Vercel production deploy succeeds and the live alias is browser-verified after deployment. |

## Rollback

If the new media or composition fails visual QA, redeploy the last known-good landing bundle without
restoring the rejected MPFB asset. Keep the Hero on a dark branded media fallback until replacement
art passes the same gate.

## Implementation evidence

- Responsive source/render comparison and interaction checks: `landing/design-qa.md` (`final result: passed`).
- Landing typecheck, 4 Vitest tests, production build, and Three/WebGL absence gate passed.
- CodeDoc Aligner passed for `HeroMedia25D.tsx` and `index.css` against this CR.
- Vercel production deployment: `dpl_J3zyvfRpu3uhnko4yxZTPwWMG2Zi` (`READY`).
- Live alias: `https://g-maiden-landing.vercel.app/`; direct `/`, `/ops`, `/terms`, and `/privacy`
  requests return `200`, and a fresh production browser tab reports no warnings or errors.

## Out of scope

- Repairing or improving the MPFB model in this change.
- Shipping a true 3D character, extracted game model, Dota footage, or `D:\dota` media.
- Changes to account, download, legal, email, Supabase, desktop login, or game-client code.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 1.1.0b | 2026-07-22 | accepted | Completed art provenance, semantic 2.5D integration, responsive visual QA, reduced-motion/menu checks, CodeDoc alignment, and production deployment. | null | ATHER |
| 1.0.0b | 2026-07-22 | accepted | Owner approved the art-first 2.5D replacement, visual evidence gate, rollback, and Vercel deployment scope. | null | ATHER |
