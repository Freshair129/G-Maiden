---
version: "2.0.0b"
title: "CR-028: G-Maiden 3D Hero Production Handoff"
doc_id: "CR-028-gmaiden-3d-hero-production-handoff"
created_at: "2026-07-21T22:15:00+07:00,ATHER"
last_update: "2026-07-22T00:43:21+07:00,ATHER"
updated: "2026-07-22"
owner: "Boss"
approved_by: "Boss"
approved_date: "2026-07-21"
status: "superseded"
superseded_by: "CR-029-gmaiden-art-first-2-5d-hero-replacement"
attributes:
  doc_type: "change-request"
  domain: "3d-content-pipeline"
  scope: "Completion of original G-Maiden Hero asset through reviewed GLB landing handoff"
  language: "th"
  related_docs:
    - "docs/change request/CR-023-gmaiden-original-3d-hero-scroll-narrative.md"
    - "docs/change request/CR-024-gmaiden-3d-studio-and-portable-blender.md"
    - "docs/change request/CR-026-mpfb2-character-authoring-and-guarded-image-to-3d-import.md"
---

# CR-028 — G-Maiden 3D Hero Production Handoff

> **Superseded 2026-07-22:** Owner UAT rejected the MPFB Hero's visible quality. The recorded
> visual-pass claim below is retained as failed audit history and is not a current acceptance
> decision. See CR-029 and `.brain/rca/2026-07-22-mpfb-hero-visual-acceptance-failure.md`.

## Decision requested

Approve the bounded completion of the original **G-Maiden Ice Mage** Hero from the existing
review-pending Blender source into one reviewed, web-ready handoff package. The owner approved
autonomous execution on 2026-07-21 through MPFB2 authoring, agent-run visual/technical review,
landing integration, production build, browser QA, and Vercel production deployment. This does
**not** approve ComfyUI integration, image-to-3D provider use, or Valve/Dota source material.

## Initial evidence and gap

The Studio has editable `.blend` source, two original concept references, previews, a functional
desktop shell, and a successful frontend production build. It has no reviewed GLB, baked idle
clip, static fallback, or landing integration. The existing cinematic base is a technical study
and must be replaced or substantially reworked rather than promoted unchanged.

## Classification

| Area | Complexity | Risk |
| --- | --- | --- |
| Original character, rights evidence, rig/animation, web handoff | C-3 | High |

## Approved production sequence

1. Create or rework an original adult humanoid mesh in Blender from the approved G-Maiden model
   sheet. Direct mesh modelling is permitted. MPFB2 may be used only after CR-026 is separately
   approved and its provenance packet is complete.
2. Produce original clothing, hair, materials, UVs, and textures. Do not reuse Valve/Dota,
   Crystal Maiden, Witcher, Tiny, or third-party game material.
3. Create a minimal humanoid armature and one non-gameplay idle loop of 4–8 seconds. Bake the clip
   into the GLB; no runtime physics, audio, or animation controller is permitted.
4. Produce one compressed `landing-hero-v1` GLB and one static PNG/WebP fallback. Keep all source
   `.blend`, texture source, and review records under the Studio project; exports never overwrite
   source.
5. Run budget and integrity checks, record hashes and an agent review decision. When every gate
   passes, integrate the asset into the landing Hero and deploy it to the already-linked Vercel
   production project without another approval prompt.

## Handoff contract

| Artifact | Required state | Limit / rule |
| --- | --- | --- |
| `source/gmaiden-ice-mage-final-v1.blend` | Editable, review-pending until owner sign-off | Original source and local audit record required |
| `exports/gmaiden-ice-mage-landing-hero-v1.glb` | Review-pending inspection artifact | ≤ 3,000,000 bytes; one baked idle clip |
| `exports/gmaiden-ice-mage-landing-fallback-v1.webp` | Review-pending inspection artifact | ≤ 2,000,000 bytes; same silhouette and CTA-safe framing |
| `exports/gmaiden-ice-mage-landing-hero-v1.manifest.json` | Immutable review record | SHA-256, source paths, texture list/sizes, animation count/duration, provenance and reviewer decision |

The manifest starts with `review-pending` and `landing_publish: false`. Under the 2026-07-21 owner
delegation, the primary agent may set `landing_publish: true` only after recording passing visual,
rights, format, animation, performance-budget, build, and browser-QA evidence.

## Acceptance criteria

| ID | Criterion |
| --- | --- |
| AC-01 | Final mesh, materials, textures, rig, and fallback are original G-Maiden work with a complete provenance record. |
| AC-02 | GLB validates and contains exactly one baked idle clip of 4–8 seconds. |
| AC-03 | GLB is ≤ 3 MB and transferred textures are ≤ 2 MB total. |
| AC-04 | Fallback image is ≤ 2 MB, visually recognisable, and does not contain text or CTA content. |
| AC-05 | Source, export, manifest, hashes, and visual review evidence remain under `G:\G-Maiden-3D-Studio\workspace\gmaiden-ice-mage`. |
| AC-06 | Blender background inspection, landing typecheck/build, browser QA, and Vercel production build succeed without altering G-Maiden game-client code. |
| AC-07 | The delegated primary agent records passing visual and technical review evidence before landing code, deployment, or publication begins. |

## Explicit exclusions

- CR-027 ComfyUI bridge and any model/node download or generation.
- Image-to-3D services, API keys, external upload, automated import, and cloud processing.
- Analytics, gameplay/client changes, or user data.
- Use of Valve/Dota names, images, models, textures, logos, voices, or derivative prompts.

## Final execution evidence — 2026-07-21

| Gate | Result |
| --- | --- |
| Source | `source/gmaiden-ice-mage-mpfb-final-v14.blend`; MPFB anatomy base and game-engine rig with original G-Maiden palette, frost core, orb, lighting, and idle composition. |
| Rights/provenance | MPFB2 2.0.16 authoring code is GPL-3.0-or-later; MakeHuman system assets are CC0. No Valve, Dota 2, Crystal Maiden, Witcher, Tiny, or third-party game asset is present. |
| GLB | `exports/gmaiden-ice-mage-landing-hero-v14.glb`, 1,625,728 bytes, SHA-256 `3ca35cc702b7eae2cd07168fe0c27278b2d9a50e42e35b7e3ae08e166ed97d23`. |
| Fallback | `exports/gmaiden-ice-mage-landing-fallback-v14.webp`, 34,400 bytes, SHA-256 `28184edc4d7ba45e2360b8bf0174a1aee5e33e34d37084744320ffecd3839d9a`. |
| Import/animation | Blender 4.5.12 re-imported 16 objects, 1 armature, and exactly one `GMAIDEN_MAIDEN_GUARD_IDLE_6S` action with a 4.81-second exported duration. |
| Agent review | Manifest state is `agent-reviewed`, `landing_publish: true`, with passing rights, format, visual, transfer-budget, and CTA-safe composition decisions under the owner's delegation. |
| Landing runtime | Three.js and GLTFLoader are lazy-loaded; fine-pointer WebGL gets the baked idle plus bounded cursor/scroll response. Touch, reduced-motion, unsupported WebGL, and load errors retain the WebP fallback. CTA and Countdown remain semantic HTML outside the canvas. |
| Local verification | `pnpm run typecheck` and `pnpm run build` passed; Three is emitted as a separate lazy chunk. Desktop, 390×844 mobile, and reduced-motion UAT passed without horizontal overflow or CTA/Countdown overlap. |
| Production | Vercel CLI production build passed and aliased deployment `H7ToSbAXBXoD8T9NZFtFfnXS6wAP` to `https://g-maiden-landing.vercel.app/`. Production browser QA found the GLB canvas ready, one active canvas, visible countdown/CTA, and no horizontal overflow. |

All CR-028 acceptance criteria pass. The production alias now serves the reviewed v14 source under
the stable landing filenames `gmaiden-ice-mage-landing-hero-v1.glb` and
`gmaiden-ice-mage-landing-fallback-v1.webp`.

## Superseded prototype evidence — 2026-07-21

The local Blender production run created the required review-pending technical package under
`G:\G-Maiden-3D-Studio\workspace\gmaiden-ice-mage`:

| Artifact | Result |
| --- | --- |
| Source | `source/gmaiden-ice-mage-final-v1.blend` created locally. |
| GLB | `exports/gmaiden-ice-mage-landing-hero-v1.glb`, 523,400 bytes, SHA-256 `40d7e50174ab8030156c1ddfee4f8fbbd03dd6d221682fceeed82fa4b17e2808`. |
| Fallback | `exports/gmaiden-ice-mage-landing-fallback-v1.webp`, 14,072 bytes, SHA-256 `bc389e466bce29ee1345f531a53d8777046e329628d9ddbb56195a59b55e6cb9`. |
| Animation | Blender glTF importer validated one `GMAIDEN_IDLE_BAKED_6S` clip, 4.81 seconds after export. |
| Safety | Manifest remains `review-pending` with `landing_publish: false`. |

This earlier package passed the format, budget, and safety checks. It did **not** pass the semi-realistic art
quality target: the current procedural mesh reads as a stylised technical prototype. AC-01 and
AC-07 were open at that point, so that prototype was not integrated. Approved CR-026 and the final
v14 evidence above supersede this block; the old files remain only as audit history.

## Rollback

Keep source and audit records. If review fails, mark only the export manifest as `rejected`, move
the exact export files to `exports/quarantine/<date>/`, and return to the Blender source; do not
delete provenance evidence or alter the existing landing.

## Approval gates

1. Approve this CR-028 production scope.
2. Complete and inspect the review-pending source/export package.
3. The delegated primary agent accepts or rejects the asset package against this CR and CR-023.
4. If accepted, implement CR-023's WebGL, fallback, accessibility, browser-QA, and production
   deployment gates without another approval prompt.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 2.0.0b | 2026-07-22 | superseded | Retracted the unsupported visual-pass decision after owner UAT and superseded the production MPFB handoff with CR-029. | null | ATHER |
| 1.1.1b | 2026-07-21 | accepted | Added the pinned doc-graph `updated` and approval metadata and mapped the approved beta lifecycle to canonical `accepted`; no requirement changed. | null | ATHER |
| 1.1.0b | 2026-07-21 | beta | Completed the reviewed MPFB v14 GLB/fallback handoff, landing WebGL/fallback runtime, build and responsive browser gates, and Vercel production deployment. | null | ATHER |
| 1.0.0b | 2026-07-21 | beta | Owner expanded the approved scope through autonomous MPFB2 authoring, delegated asset review, landing integration, QA, and Vercel production deployment. | null | ATHER |
| 0.2.0b | 2026-07-21 | beta | Produced and importer-validated a review-pending GLB/fallback/idle technical package; it remains blocked because the stylised source fails the semi-realistic art-quality gate. | null | ATHER |
| 0.1.0b | 2026-07-21 | candidate | Proposed the bounded, local original-asset production and review handoff required to finish the 3D Hero package. | null | ATHER |
