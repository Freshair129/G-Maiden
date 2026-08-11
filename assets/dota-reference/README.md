# Dota 2 reference art

Reference captures of Dota 2's own screens, kept for layout and CV work.

**Nothing here is bundled into the app.** `assets/` is a source library, not a
runtime path — anything the app actually serves lives in `src/public/` and is
loaded by URL. Files sit here until something needs them, so that a reference we
already have is not re-sourced later.

| File | Size | Origin | Used by |
| --- | --- | --- | --- |
| `faction-buildings-map.webp` | 1000×959 | Dota 2 wiki — full map with building positions | — (unused) |
| `backdoor-protection-radius.webp` | 1000×1000 | Dota 2 wiki — full map with backdoor-protection radii | — (unused) |

Already in use, for contrast — do not duplicate them here:

| File | Where | Purpose |
| --- | --- | --- |
| `src/public/dota-hud-reference.webp` | G-Maiden + G-AnnStudio | Annotated 16:9 HUD; the Overlay Lab stage backdrop |
| `src/public/dota-minimap-reference.webp` | G-Maiden + G-AnnStudio | Static map shown when the minimap mirror has no CV frame, and the pre-game stage centre |

## Before using one of these

The two unused maps are **whole-map art**, not minimap crops. The deck's
`MinimapMirror` expects a square minimap-shaped image (`region.rs` captures
side == side), so dropping one of these in as a fallback would letterbox or
crop badly — `dota-minimap-reference.webp` is the right shape for that slot.
These are better suited to a full-map view, lane/building diagrams, or as
ground truth when calibrating CV coordinates.

Valve/Dota 2 artwork, kept as development reference material.
