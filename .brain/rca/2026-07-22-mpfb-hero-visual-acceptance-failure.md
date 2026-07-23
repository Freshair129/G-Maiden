---
version: "0.1.0b"
title: "RCA: MPFB landing Hero passed technical gates but failed the approved visual target"
created_at: "2026-07-22T00:43:21+07:00,ATHER"
last_update: "2026-07-22T00:43:21+07:00,ATHER"
status: "beta"
attributes:
  doc_type: "root-cause-analysis"
  domain: "public-landing"
  scope: "CR-028 MPFB Hero visual acceptance and production promotion"
---

# RCA — MPFB Hero visual acceptance failure

## Symptom

The production landing renders a technically valid animated humanoid, but the visible result reads
as a bald MPFB/MakeHuman mannequin in a generic office-like dress. It does not meet CR-023's
approved semi-realistic cinematic G-Maiden target. On narrow viewports the countdown also covers a
large portion of the character.

## Evidence

- User UAT screenshot on 2026-07-22 shows flat skin, pale emissive eyes, weak hair silhouette,
  generic fitted clothing, bare feet, and countdown/subject competition.
- The deployed GLB contains the stock MPFB objects `female_elegantsuit01`, `ponytail01`, and the
  unsculpted `GMAIDEN_MPFB_BASE_CC0` body.
- The GLB contains image textures only for skin diffuse, eyebrow, and eyelashes. Hair, clothing,
  eyes, metal, and frost use constant material factors; there are no normal, roughness, or authored
  detail maps for the character costume.
- `create_gmaiden_mpfb_final.py` replaces the eyes with an emissive cyan material and exports the
  stock elegant suit under a single flat cloth material.
- The source manifest initially recorded `pending-visual-review` and `landing_publish: false`, but
  CR-028 later recorded a visual pass without a target-versus-production comparison.

## Root cause

MPFB was treated as a finished character-authoring pipeline when it was only a rigged humanoid base.
The production pass changed colors and added small procedural accessories, but did not perform the
custom sculpt, clothing construction, hair authoring, UV/texturing, material baking, or art-directed
pose work required by the approved target.

The process failure was the visual gate: format validation, animation presence, byte budgets, build
success, and browser visibility were incorrectly allowed to stand in for visual fidelity. CR-028's
recorded visual pass was therefore unsupported.

## Why the issue escaped detection

- The reviewer was also the producing agent; no independent visual comparison gate remained.
- Browser QA checked canvas readiness, overflow, and CTA visibility rather than character quality.
- The accepted criteria did not require the approved reference and production screenshot to appear
  in one comparison artifact at matching desktop and mobile viewports.
- Owner UAT occurred only after the asset had been promoted and deployed.

## Approved prevention

CR-029 replaces the production MPFB Hero with provenance-recorded original cinematic key art and a
2.5D media runtime. Future Hero promotion requires:

1. side-by-side source-target and implementation evidence at `1440x900` and `390x844`;
2. an explicit visual decision covering face, hair, costume, silhouette, crop, and UI-safe zones;
3. mobile and reduced-motion evidence;
4. owner screenshot approval before a new true-3D character can replace the 2.5D production Hero.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-22 | beta | Confirmed the asset-authoring and visual-gate root causes and linked the approved CR-029 prevention. | null | ATHER |

