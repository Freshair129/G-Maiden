# RCA: CR-006 subtract rim layout instability

Date: 2026-07-09
Owner: Codex
Validated by: Claude Code Opus
Scope: CommandDeck CR-006 subtract-notch shell, topbar FAB, sidebar/power cluster, and stage scaling

## Symptom

- Top-right topbar FAB still overlaps the panel edge instead of sitting cleanly inside the subtract notch.
- Bottom-left power button still looks detached from the left cluster and appears clipped or offset.
- The left edge previously kept getting cut off even after multiple rounds of width, blur, and offset tweaks.

## Evidence

- `src/src/styles.css` contains two separate shell systems for the same selectors:
  - Older block around `4130-4256` defines:
    - `.g-deck-stage`
    - `.g-sidebar-fab`
    - `.g-topbar-fab`
    - `.g-deck-panel`
    - `.g-deck-panel.has-signals`
    - `.g-deck-panel .surface`
  - Later CR-006 block around `4357-4720` redefines the same selectors with `!important` and a different layout model.
- The older block uses a fluid rectangular shell and CSS `clip-path: polygon(...)` driven by `--ntw/--nth/--nbw/--nbh`.
- The later block uses a fixed `1280x720` SVG path clip (`FUNG_PANEL_PATH` in `src/src/CommandDeck.tsx`) plus hardcoded FAB coordinates.
- `src/src/CommandDeck.tsx` renders sibling layout pieces:
  - `.g-l1-white-glass`
  - `.g-sidebar-fab`
  - `.g-power-radial`
  - `.g-topbar-fab`
  - `.g-audio-rail`
  - `.g-deck-panel`
- `src/src/CommandDeck.tsx` stage scaling was recently corrected from `1368` to `1420`, which fixed one scaling bug but not the deeper geometry mismatch.
- Current geometry is inconsistent:
  - Stage = `1420x760`
  - Panel clip world = `1280x720`
  - Topbar FAB = fixed absolute box
  - Power radial = separate fixed absolute box
  - Left notch and top-right notch are encoded in the path, but the FAB positions are encoded elsewhere and do not derive from that same path data.

## Root Cause

The real root cause is not “bad pixel nudging.” It is **multiple active layout contracts describing the same shell at the same time**.

There are three competing geometry systems:

1. Legacy deck shell CSS:
   - fluid edges
   - polygon notch math
   - FABs pinned relative to an older shell model

2. CR-006 shell CSS:
   - fixed `1280x720` subtract path
   - hardcoded absolute FAB coordinates
   - heavy `!important` overrides

3. Stage scaling model:
   - outer stage is `1420x760`
   - inner shell/path/panel content is authored in `1280x720`

Because these systems are not unified, the notch, panel, topbar, power cluster, and scale transform do not share a single source of truth. Manual tweaks can improve one screenshot while another rule block or coordinate space still disagrees.

## Why repeated fixes failed

- Fixes were applied to symptoms, not to the contract mismatch.
- Changing a FAB offset does not move the subtract notch.
- Changing the notch path does not move the FAB that is supposed to live inside it.
- `!important`-heavy overrides made it hard to tell which rule block was actually in control.
- Older shell rules still leaked properties where the newer block did not explicitly override everything.
- Screenshot-based adjustment was done in rendered pixels, while the layout is scaled from stage coordinates. That made visual corrections drift across window sizes.
- `overflow: hidden`, `clip-path`, and `contain: paint` hid overshoot, so the bug looked like a minor alignment issue instead of a structural geometry mismatch.

## Proposed prevention

- Keep exactly one shell definition for:
  - `.g-deck-stage`
  - `.g-deck-panel`
  - `.g-sidebar-fab`
  - `.g-topbar-fab`
  - `.g-power-radial`
- Remove the older duplicate shell block once the CR-006 model is accepted.
- Define notch geometry once and derive both:
  - the SVG clip/stroke path
  - the sibling FAB positions
- Use one coordinate world only:
  - either make the full shell `1280x720`
  - or introduce an explicit centered inner frame inside `1420x760`
- Add a geometry-check step before screenshot review:
  - topbar must fit inside notch bounds
  - power cluster must align with left notch bounds
  - left and right overflow must be zero at the chosen stage size
- Avoid further “override stacking.” Consolidate the shell into one authoritative block before more visual tuning.

## Immediate next step

Before any more cosmetic tweaks:

1. delete or neutralize the legacy shell block
2. promote one shell block as authoritative
3. bind notch dimensions and FAB offsets to the same constants
4. then resume polish
