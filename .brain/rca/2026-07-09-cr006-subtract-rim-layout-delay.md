# RCA: CR-006 subtract rim layout took multiple iterations

Date: 2026-07-09
Owner: Codex
Scope: CommandDeck CR-006 FUNG-style subtract shell, sector grid, transparent window, and rim-cropped layout

## Symptom

The CommandDeck layout required many iterations before the concave/subtract rim behaved like the FUNG reference. The visible symptoms were:

- The "เว้า" notch shape appeared close in some screenshots but the full app still showed a rectangular black surface outside the rim.
- The topbar and sidebar were sometimes positioned as if they belonged to a rectangular app shell, not as FAB siblings around a single clipped panel.
- Signal cards and the right-side sector floated outside the intended grid or created extra unused space.
- Attempts to make the panel glass/transparent made the rim correct but reintroduced unwanted background bleed.

## Evidence

- `src/src/CommandDeck.tsx` originally rendered the existing `Dashboard` inside `.g-deck-panel` while also trying to wrap that dashboard in a FUNG-like shell. That meant the old dashboard grid and the new FUNG sector grid were competing.
- `src/src/styles.css` had older `.g-deck-stage`, `.g-deck-panel`, `.g-sidebar-fab`, `.g-topbar-fab`, and `.g-anchor-rail` rules around the Command Deck shell, then additional CR-006 overrides appended later. The final visual depended on CSS cascade order rather than one authoritative layout model.
- The early panel implementation used a dynamic JS-generated `clip-path: path(...)` based on panel width/height. FUNG uses a fixed `1280x720` SVG path with the same path for `clipPath` and rim stroke.
- `src-tauri/tauri.conf.json` control window was not transparent initially. Even when the panel rim was clipped, the WebView/control surface still painted a full rectangular background.
- Later fixes made the control window transparent, but `.deck-v3.g-deck` and `.g-deck-bg` still painted a viewport-sized black background until explicitly removed.

## Root Cause

The root cause was mixing two layout models:

1. The legacy G-Maiden CommandDeck model: rectangular viewport shell, dynamic clipping, and Dashboard content that assumes a normal rectangular card grid.
2. The FUNG model: one fixed coordinate system (`1304x744` stage), one clipped `1280x720` panel path, and topbar/sidebar/power controls as sibling FABs outside the clipped material.

Because these two models were active at the same time, each fix corrected one visual layer while another layer kept painting or positioning as a rectangle. The concave rim itself was not the only problem; the WebView window surface, CSS background layer, content grid, and FAB positioning also had to follow the same coordinate contract.

## Why the issue escaped detection

- I treated the early screenshots as a CSS positioning problem instead of first freezing the coordinate contract and deleting the old rectangular assumptions.
- I ported the visible shape before porting the full FUNG composition model: fixed stage, fixed app panel, sibling FABs, single path for clip and stroke, and transparent outside-window behavior.
- I optimized locally by adding override CSS instead of first reducing competing rules. That made screenshots improve incrementally but hid the fact that multiple layers still disagreed.
- I did not separate "window transparency" from "sector material transparency" early enough. These are different controls: the window must be transparent outside the rim, while sector F can be opaque or glass inside the rim.

## Proposed prevention

- For subtract-shape UI work, define a coordinate contract before code:
  - Stage size
  - App panel size and offset
  - Clip path source
  - Rim path source
  - Which elements are clipped children vs sibling FABs
  - Which layer owns the background
- Use one path source for both `clipPath` and rim stroke. Do not mix dynamic path generation with a fixed SVG spec unless the spec says the path is responsive.
- Keep window transparency and material transparency as separate acceptance criteria.
- Add a screenshot-review checklist for CR-006:
  - No rectangular viewport background outside the subtract rim
  - Topbar sits in the top-right notch as a sibling FAB
  - Sidebar and power button sit in the left notch as sibling FABs
  - Signal cards are panel-owned unless a bottom-right notch is explicitly reintroduced
  - Sector F material state is explicit: transparent on/off
- Avoid layering override CSS indefinitely. Once a visual direction is accepted, consolidate shell rules so the next edit changes one authoritative block instead of fighting the cascade.

## Current corrective action

- The control window is transparent in `src-tauri/tauri.conf.json` so pixels outside the rim can disappear.
- `.deck-v3.g-deck` and `.g-deck-bg` no longer paint the full viewport.
- The FUNG path is used for both panel clipping and the rim stroke.
- Sector F transparency has been turned off: internal material surfaces are now opaque, while the window outside the rim remains transparent.
