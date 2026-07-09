# RCA: CR-006 design-system drift from live UI

Date: 2026-07-09
Owner: Codex
Scope: `docs/design-system/*` vs current `CommandDeck` implementation on `main`

## Symptom

- The design-system docs described an older shell model that no longer matched the UI now running in code.
- Layout review risk increased because docs still referenced:
  - a `1280 x 720` single-stage shell as the main authored world
  - a P1-P5 anchor rail on the left side
  - a score-header-owned GSI block
  - a standalone PING stat cell
  - a bottom-right subtract notch model
- The live UI had already moved to:
  - a `1420 x 760` outer stage
  - an audio rail instead of P1-P5 anchors
  - topbar-owned GSI and ping pills
  - current shell constants embedded in CSS

## Evidence

- `src/src/CommandDeck.tsx` uses:
  - `FUNG_PANEL_PATH`
  - stage scaling based on `1420` and `760`
  - `VolumeRail(...)` with `masterVolume`, `annEnabled`, `signalEnabled`
  - topbar status and ping pills
- `src/src/styles.css` defines:
  - `--cr6-*` geometry tokens for shell placement
  - `.g-l1-white-glass` with `left/top/right/bottom: 24px`
  - `.g-audio-rail` as the current left-top shell object
  - `.g-signals-fab` as a separate stage sibling cluster
- `docs/design-system/03-layout.md` and `04-components.md` still described older layout assumptions rather than the current live shell contract.

## Root Cause

The docs were being treated as concept artifacts instead of being kept synchronized with the implementation after multiple rapid shell iterations.

In practice:

1. shell geometry moved fast in code
2. visual debugging happened in CSS and screenshots
3. design-system docs were not updated at the same cadence

That produced a split-brain system:

- code = current truth
- docs = older intended truth

## Why the issue escaped detection

- Builds passed because the problem was documentation drift, not a compile error.
- The UI remained visually testable, so iteration kept happening directly in code.
- Several shell changes were framed as polish or hotfixes, so doc sync lagged behind.
- Older design artifacts still looked plausible enough to avoid immediate correction.

## Proposed prevention

- Treat `docs/design-system/03-layout.md` and `04-components.md` as required update targets for any shell/layout change.
- When shell constants change, update these items together:
  - `src/src/CommandDeck.tsx`
  - `src/src/styles.css`
  - `docs/design-system/03-layout.md`
  - `docs/design-system/04-components.md`
  - `docs/design-system/assets/cr006-layer-dev-overlay.svg`
- Record "known drift / known gaps" explicitly in the docs instead of leaving older mock assumptions in place.
- Prefer implementation-backed coordinates over screenshot-estimated prose.

## Immediate prevention applied

- Layout doc rewritten to current stage/panel/FAB geometry.
- Component catalog rewritten to current shell objects.
- Overlay SVG updated to show the live layer model instead of the retired mock labels.
