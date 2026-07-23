---
version: "1.3.3b"
created_at: "2026-07-21T22:05:37+07:00,ATHER"
last_update: "2026-07-22T13:45:00+07:00,ATHER"
status: "beta"
attributes:
  doc_type: "visual-qa"
  domain: "public-landing"
  scope: "CR-029 Hero, CR-030 scroll narrative, and CR-031 layered wind motion"
---

# Landing Design QA

## Final result

**final result: passed**

CR-029 Hero art replacement remains approved, CR-030 remains deployed, and CR-031 passes its
remediated layered Hero wind-motion verification gates on the production alias
`https://g-maiden-landing.vercel.app/` with deployment `dpl_DyVx7P5VzCkYQAqbQHwx1BKJsrsV`.

## Source and implementation evidence

| Evidence | Artifact |
| --- | --- |
| Approved cinematic target vs desktop render | `landing/qa/hero-approved-target-comparison-v1.png` |
| Desktop production key art vs `1440x900` render | `landing/qa/hero-desktop-comparison-v1.png` |
| Mobile production key art vs `390x844` render | `landing/qa/hero-mobile-comparison-v1.png` |
| Final desktop viewport | `landing/qa/hero-desktop-1440x900-v2.png` |
| Final desktop viewport (localized-layer fix) | `landing/qa/hero-desktop-1440x900-v3.png` |
| Final laptop viewport | `landing/qa/hero-desktop-1366x768-v1.png` |
| Final mobile viewport | `landing/qa/hero-mobile-390x844-v3.png` |
| Final mobile viewport (localized-layer fix) | `landing/qa/hero-mobile-390x844-v4.png` |
| Compact mobile viewport | `landing/qa/hero-mobile-320x568-v1.png` |
| Mobile menu state | `landing/qa/mobile-menu-390x844-v1.png` |
| Previous production desktop | `landing/qa/production-hero-desktop-1440x900.png` |
| Previous production mobile | `landing/qa/production-hero-mobile-390x844.png` |
| Current production desktop | `landing/qa/production-hero-desktop-1440x900-v2.png` |
| Current production mobile | `landing/qa/production-hero-mobile-390x844-v2.png` |

## Visual comparison

| Area | Decision |
| --- | --- |
| Face and eyes | Passed - facial proportions stay stable under motion and no longer show warped duplicate-plane skew. |
| Hair and silhouette | Passed - readable silver hair, cloak, shoulder armor, and full-body silhouette stay aligned with the approved target without blob-like ghosting. |
| Costume and material | Passed - blue-black armor, cloth, metal edges, and frost lighting preserve the cinematic direction. |
| Composition | Passed - desktop keeps the left text-safe zone; mobile maintains a clear top-to-bottom conversion flow. |
| Countdown safe zone | Passed - the lower-right countdown zone does not cover the subject face or torso at the required viewports. |
| Typography | Passed - Thai-first hierarchy remains dominant and countdown numerals keep tabular spacing. |
| Spacing | Passed - navigation, Hero copy, actions, proof, and countdown remain separated at desktop and mobile targets. |
| Color | Passed - neutral black scrims, ice-blue highlights, and blue CTA styling match the landing token system without flattening the key art. |
| Image quality | Passed - source WebP dimensions load correctly and do not blur, stretch, or fall back to a canvas state. |
| Copy | Passed - the watch-your-back positioning remains conservative and avoids overclaim language. |

## Responsive and interaction checks

| Check | Result |
| --- | --- |
| `1440x900` | Passed - desktop art loads with no horizontal overflow and no canvas runtime. |
| `1366x768` | Passed - headline, CTA, proof, and countdown remain readable. |
| `390x844` | Passed - portrait art loads and the countdown begins below the subject hand and torso. |
| `320x568` | Passed - primary copy and GID CTA stay visible without horizontal overflow. |
| Mobile menu | Passed - body scroll locks on open, closes on `Escape`, and returns focus to the menu trigger. |
| Reduced motion | Passed - `prefers-reduced-motion: reduce` disables decorative transforms and animation while preserving content order. |
| Pointer/input | Passed - Hero media remains passive, `aria-hidden`, and `pointer-events: none`; semantic CTA, countdown, and navigation stay above it. |

## CR-030 motion QA

| Check | Result |
| --- | --- |
| Single scroll controller | Passed - one landing-root progress hook drives Hero exit depth and beacon progress; the Hero media component no longer registers its own scroll listener. |
| Hero exit depth | Passed - desktop scroll produces a short composited fade and raise on art, scrim, and copy without pinning or blocking native page scroll. |
| Open Beta beacon | Passed - the right-side countdown card reads as a live CTA with a bounded ice-signal sweep and a shrinking diagnostic underline tied to the same progress variable. |
| G-Maiden access reveal | Passed - the G-Maiden access section stays readable before reveal; entering the viewport adds only a brightness and lift enhancement and does not gate the queue form or buttons. |
| Feature rails reveal | Passed - feature rails remain visible by default and gain one-time focus treatment through `IntersectionObserver` after entering view. |
| Coarse pointer path | Passed - touch and coarse pointers keep the static layout and skip decorative scroll transforms. |
| Reduced motion path | Passed - reduced motion keeps the same content and CTA order while decorative Hero and beacon motion are disabled. |
| Overflow and layout | Passed - CR-030 adds no horizontal overflow and no new fixed or pinned layer that captures scroll. |

## CR-031 layered Hero QA

| Check | Result |
| --- | --- |
| Layer separation | Passed - Hero renders as one stable base plus localized hair, cloth, and frost passes instead of broad moving duplicate planes. |
| Hair wind motion | Passed - hair edge pass shows the strongest sway response without deforming the face or torso. |
| Cloth motion | Passed - cloth edge pass follows with a heavier lag than the hair pass, so the scene reads as wind rather than rigid translation. |
| Frost atmosphere | Passed - foreground frost pass reads as wind and depth, not as a noisy overlay. |
| Static mobile path | Passed - mobile collapses to the static base Hero image with layered overlays hidden. |
| Reduced motion path | Passed - reduced motion collapses to the base Hero image and removes decorative layered drift. |

## Iteration history

1. Rejected the MPFB model after owner UAT because stock geometry and materials failed the approved visual target.
2. Generated separate desktop and mobile original key art and replaced Three.js with semantic `<picture>` media.
3. Moved the countdown into a clipped signal-beacon treatment and added a direct Closed Beta CTA.
4. Added bounded pointer parallax and then consolidated scroll behavior into one landing-root controller for CR-030.
5. Promoted the G-Maiden access section and feature rails into visible-by-default sections with observer-enhanced reveal states only.
6. Replaced the first CR-031 whole-frame duplicate strategy after owner UAT with localized edge-mask motion to remove facial skew and slab-like ghosting.

## Acceptance mapping

CR-029 AC-01 through AC-08 pass. CR-030 AC-01 through AC-06 pass. CR-031 AC-01 through AC-06 pass.

Production evidence for this turn:

- Vercel deployment `dpl_DyVx7P5VzCkYQAqbQHwx1BKJsrsV` reached `READY` and is aliased to `https://g-maiden-landing.vercel.app/`.
- Browser QA confirmed the production alias at desktop `1440x900` and mobile `390x844`.
- Production console logs returned no warnings or errors during the verification pass.
- Route checks returned `200` for `/`, `/terms`, and `/privacy`.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 1.3.3b | 2026-07-22 | beta | Normalized reader-facing QA naming from GMAD reveal to G-Maiden access reveal while preserving historical implementation evidence. | null | ATHER |
| 1.3.2b | 2026-07-21 | beta | Replaced the CR-031 duplicate-plane Hero with localized edge-mask motion, recorded local QA captures `v3/v4`, and verified production deployment `dpl_DyVx7P5VzCkYQAqbQHwx1BKJsrsV`. | null | ATHER |
| 1.3.1b | 2026-07-21 | beta | Recorded production deployment `dpl_AYsCHDHXCnMrqh8JSUrGKwe9uZsW`, layered Hero desktop/mobile verification, and clean-console route checks for CR-031. | null | ATHER |
| 1.3.0b | 2026-07-21 | beta | Added CR-031 layered Hero QA coverage for base, hair, cloth, frost, and static fallback behavior. | null | ATHER |
| 1.2.1b | 2026-07-21 | beta | Recorded production deployment `dpl_FBRMXBotAhv68G8WGF3juKckaJ19`, desktop/mobile browser verification, clean console, and route checks for CR-030. | null | ATHER |
| 1.2.0b | 2026-07-21 | beta | Added CR-030 motion QA coverage for hero exit, beacon CTA, GMAD reveal, feature rails, and static accessibility paths. | null | ATHER |
| 1.1.0b | 2026-07-21 | beta | Added production deployment, alias, live responsive captures, legal-route checks, and clean-console evidence for CR-029. | null | ATHER |
| 1.0.0b | 2026-07-21 | beta | Recorded source/render comparison, responsive layout, menu, reduced-motion, and final visual decision for CR-029. | null | ATHER |
