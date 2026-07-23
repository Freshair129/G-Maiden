---
title: "RCA: cinematic base assembly does not meet semi-realistic character quality"
date: "2026-07-21"
status: "open"
scope: "G-Maiden 3D Studio / gmaiden-ice-mage"
---

# RCA — cinematic base realism gap

## Symptom

The render from `gmaiden-ice-mage-cinematic-base-v2.blend` is a valid editable 3D source assembly,
but it still reads as a stylized primitive figure rather than the approved semi-realistic cinematic
target.

## Evidence

- Source: `G:\G-Maiden-3D-Studio\workspace\gmaiden-ice-mage\source\gmaiden-ice-mage-cinematic-base-v2.blend`.
- Render: `G:\G-Maiden-3D-Studio\workspace\gmaiden-ice-mage\previews\gmaiden-ice-mage-cinematic-base-v2.png`.
- The scene has a real 15-bone armature, separate mesh/curve construction parts, materials and
  lighting, but no retopologized facial mesh, UV unwrap, skin/hair/cloth texture set, skin weights,
  or baked maps.
- The approved visual target is `source\reference\gmaiden-cinematic-target-v2.png`; visual
  comparison shows that the source cannot reproduce its facial, cloth, or material detail.

## Root cause

The implemented method is deterministic Blender primitive/curve assembly. It is suitable for
blocking, silhouette review, and technical pipeline validation, but it is not a character-authoring
method capable of producing semi-realistic anatomy, facial topology, simulated cloth, hair cards,
or PBR texture detail.

## Why it escaped earlier detection

The earlier acceptance gate verified that a `.blend` source and render were created, not that the
render met the later-approved semi-realistic art-direction benchmark. The first visual target was
created only after the primitive pipeline had been selected.

## Proposed prevention and next decision

Do not treat primitive-generated source as production character art. Before another landing attempt,
choose and approve one of these provenance-recorded routes:

1. Human artist workflow in Blender: sculpt → retopo → UV → texture → rig → bake → review.
2. An approved image-to-3D/base-mesh provider or locally installed character-authoring tool, with
   licence/provenance review before any export.

Either route must produce a review packet containing source, wireframe, texture list, armature,
turntable, GLB size inspection, and static fallback before CR-023 landing integration.
