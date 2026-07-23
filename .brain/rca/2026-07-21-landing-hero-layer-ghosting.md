---
version: "0.1.0b"
title: "RCA: Landing Hero layered full-frame duplicates caused ghosting and facial skew"
created_at: "2026-07-21T05:28:00+07:00,ATHER"
last_update: "2026-07-21T05:28:00+07:00,ATHER"
status: "beta"
attributes:
  doc_type: "root-cause-analysis"
  domain: "landing-hero-motion"
  scope: "CR-031 Hero layer separation visual regression"
---

# RCA — Landing Hero layered full-frame duplicates caused ghosting and facial skew

## Symptom

Owner UAT reported that the Hero still looked like one blob, the face looked warped, and the page
felt visually skewed even though the layered motion code was already deployed.

## Evidence

- `landing/src/HeroMedia25D.tsx` rendered three duplicate copies of the same full Hero image for
  base, hair, and cloth layers.
- `landing/src/index.css` applied independent `clip-path`, translate, rotate, and scale transforms
  to those duplicate full-frame layers.
- Browser QA on 2026-07-21 showed the hair and cloth layers were active on desktop, but the visual
  result still read as a single deformed body plane rather than true separated motion.
- The owner screenshot showed the face and torso stretching under those duplicated transforms.

## Root cause

CR-031 initially separated motion by duplicating the entire Hero image into several transformed
planes and masking them broadly. Because those masks still carried large parts of the same face,
torso, and silhouette, small transform differences between layers created ghosting, warped facial
proportions, and an oversized slab-like read.

This was not an art-source failure. It was a layer-authoring strategy failure.

## Why it escaped detection

The first pass verified that multiple layers were moving and that mobile/reduced-motion fallbacks
worked, but it did not enforce a stronger visual acceptance check for facial proportion integrity
and silhouette cleanliness under live motion.

## Proposed prevention

For future Hero-motion work, ban whole-frame duplicate planes unless the artwork is actually cut
into authored parts. Reuse the approved Hero art only as:

1. one stable base silhouette plane
2. localized masked edge passes
3. separate atmospheric overlays

Owner UAT must explicitly check face, shoulder line, and torso alignment before visual QA is marked
passed.

## Fix and verification

The remediation keeps one stable base Hero image, converts hair and cloth motion into localized
edge-mask passes plus atmospheric highlights, and preserves the frost layer as a separate screen
blend. Local QA at `1440x900` and `390x844` on 2026-07-21 confirmed:

- no horizontal overflow
- desktop Hero face and torso remain proportionally stable
- hair and cloth motion remain decorative instead of deforming the full body
- mobile still collapses to the static single-image path

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-21 | beta | Recorded the root cause of Hero ghosting and the localized-edge remediation strategy. | null | ATHER |
