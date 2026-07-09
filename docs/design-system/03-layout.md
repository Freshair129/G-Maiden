---
version: "2.2.4-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-10T00:00:00+07:00,Claude"
status: "draft"
attributes:
  domain: "ui-ux"
  scope: "layout geometry, dimensions, responsive"
  language: "th/en"
---

# 03 - Layout

> Current implementation source of truth:
> [src/src/CommandDeck.tsx](../../src/src/CommandDeck.tsx) and
> [src/src/styles.css](../../src/src/styles.css)

## 1. Current layout contract

CR-006 is currently implemented as a layered desktop shell with:

- one outer fixed stage
- one L1 white-glass underlay
- one clipped main shell panel
- three floating shell attachments:
  - topbar FAB
  - sidebar/tool FAB
  - power radial cluster
- one dashboard-owned signal card cluster

This is the geometry that exists in code now. The old "P1-P5 anchor rail" mock is no longer the active shell model.

## 2. Coordinate systems

There are two active coordinate spaces:

| Space | Size | Purpose |
| --- | --- | --- |
| Stage | `1420 x 760` | outer placement world for all shell siblings |
| Panel clip world | `1280 x 720` | subtract-path shell panel and its rim |

Scaling is applied to the whole stage:

```ts
s = min(window.innerWidth / 1420, window.innerHeight / 760, 1.0)
```

The upper clamp was `1.4` until CR-007 follow-up (Boss feedback 2026-07-09): on a
1920x1080 screen that resolved to ~1.35x, upscaling every 1px rim/text into a fat
blurry line ("chunky" feedback). The clamp is now `1.0` — the stage only ever scales
*down* to fit a smaller window, never up past its authored 1420x760 size, so rims and
text stay crisp at 1:1 on anything 1420x760 or larger.

This means shell polish must be done in stage coordinates first, not screenshot pixels.

## 3. Layer stack

| Layer | Element | Current role |
| --- | --- | --- |
| L0 | Window canvas | transparent desktop window owned by Tauri |
| L1 | `.g-l1-white-glass` | low-alpha support plate under the app mass, clamped to the panel envelope; no backdrop blur |
| L2 | `.g-deck-panel` | clipped subtract-shell body |
| L2r | `.g-panel-rim` | stage-sibling rim overlay (not a panel child — the panel's clip/overflow/contain would eat its drop-shadow); overlays the panel box, `z-index:11` |
| L3 | `.g-sidebar-fab`, `.g-topbar-fab`, `.g-audio-rail` | floating shell attachments |
| L4 | `.g-power-radial`, `.g-signals-fab` | interaction overlays and status cards |

## 4. Subtract panel path

The panel shape is driven by two constants in `src/src/CommandDeck.tsx`, selected per tab:
`d={tab === "dashboard" ? FUNG_PANEL_PATH_SIGNALS : FUNG_PANEL_PATH}`. Only the dashboard tab
renders the G-Signal cluster (`SignalGrid`), so only the dashboard tab gets the bottom-right
notch — every other tab keeps the plain (no-notch) path, avoiding a stray hole where nothing
fills it. Both constants feed the same `<path id="gSubtractPanelPath">`, so the `clipPath` and
the `.g-panel-rim` `<use>` always stay in sync automatically.

Base path (`FUNG_PANEL_PATH`, all non-dashboard tabs):

```svg
M 40,12 H 800 A 20 20 0 0 1 820,32 V 54 A 20 20 0 0 0 840,74
H 1248 A 20 20 0 0 1 1268,94 V 688 A 20 20 0 0 1 1248,708
H 112 A 20 20 0 0 1 92,688 V 350 A 20 20 0 0 0 72,330
H 32 A 20 20 0 0 1 12,310 V 40 A 28 28 0 0 1 40,12 Z
```

Dashboard path (`FUNG_PANEL_PATH_SIGNALS`, CR-007 WP-1 — adds the bottom-right notch):

```svg
M 40,12 H 800 A 20 20 0 0 1 820,32 V 54 A 20 20 0 0 0 840,74
H 1248 A 20 20 0 0 1 1268,94 V 488 A 20 20 0 0 1 1248,508
H 836 A 20 20 0 0 0 816,528 V 688 A 20 20 0 0 1 796,708
H 112 A 20 20 0 0 1 92,688 V 350 A 20 20 0 0 0 72,330
H 32 A 20 20 0 0 1 12,310 V 40 A 28 28 0 0 1 40,12 Z
```

Only the segment between the top-right notch and the sidebar notch changed (the old single
`V 688 A 20 20 0 0 1 1248,708` corner fillet became a 3-arc corner cut: `V 488 A…1248,508
H 836 A…816,528 V 688 A…796,708`). All new arcs use r=20 (matching every other notch fillet;
only the outer top-left corner uses r=28). The cut opens directly to the panel's true right
edge (local x=1268) and bottom edge (local y=708) — no new wall needed there — and adds two
new interior walls: top wall at local y=508, left wall at local x=816, each 12px clear of the
signal-cluster rect (panel-local x828..1256, y520..696) — the same 12px rhythm as the
top-right notch's topbar gap (topbar bottom y62 vs notch floor y74). Right/bottom margins land
at 12px too because the cluster's `.g-signals-fab` box was widened 420→428px and heightened
174→176px (a few-px nudge, position unchanged) to exactly fill the notch on all four sides.

Current notch behavior:

| Notch | Status | Opens for |
| --- | --- | --- |
| Top-right | active | topbar FAB |
| Bottom-left side cut | active | sidebar/tool mass |
| Bottom-right | active (dashboard tab only, via `FUNG_PANEL_PATH_SIGNALS`) | signal cluster (D/E/F/G) |

`SignalGrid` was moved out of `.g-deck-panel` to be a `.g-deck-stage` sibling (like the topbar/
sidebar FABs and the power radial) — it must render outside the clipped panel, otherwise the
panel's own `clip-path` would clip the cards away along with the rest of the notch void.

## 5. Current shell geometry

### 5.1 Stage shell constants

From `src/src/styles.css`:

| Token | Value |
| --- | --- |
| `--cr6-panel-left` | `12px` |
| `--cr6-panel-top` | `12px` |
| `--cr6-panel-width` | `1280px` |
| `--cr6-panel-height` | `720px` |
| `--cr6-topbar-left` | `834px` |
| `--cr6-topbar-top` | `24px` |
| `--cr6-topbar-width` | `446px` |
| `--cr6-sidebar-left` | `26px` |
| `--cr6-sidebar-top` | `354px` |
| `--cr6-power-left` | `35px` |
| `--cr6-power-top` | `672px` |
| `--cr6-power-main-left` | `0px` |
| `--cr6-power-main-top` | `0px` |

### 5.2 L1 white-glass underlay

CR-007 follow-up (post WP-1): L1 is clamped to the panel's own envelope in stage coordinates
(`--cr6-panel-left/top` = `12px`, `--cr6-panel-width/height` = `1280x720`, so the panel's
real right/bottom edges sit at `x1292`/`y732` in the `1420x760` stage) instead of an inset-24
box off the stage edges, which used to overshoot the panel by up to 104px on the right and
below — spilling a frosted plate into the dead margin outside the shell silhouette.

| Property | Value |
| --- | --- |
| `left` | `12px` |
| `top` | `12px` |
| `right` | `128px` |
| `bottom` | `28px` |
| `border-radius` | `16px` |
| `backdrop-filter` | none |

Backdrop blur was removed entirely: with window-level acrylic gone (see §6, if present, or
`tauri.conf.json`), CSS `backdrop-filter` on a transparent Tauri window only blurs
webview-internal layers, and nothing else renders behind L1 — so the blur was pure
compositing cost with no visual effect other than drag lag. The fill alphas were also lowered
(max `~0.06`, down from `~0.1`) so the plate reads as a faint depth cue through the panel's
subtract notches rather than a bright/milky surface.

### 5.3 Topbar FAB

| Property | Value |
| --- | --- |
| x | `834px` |
| y | `24px` |
| w | `446px` |
| h | `50px` |

Current topbar contents:

- brand wordmark
- GSI status pill
- ping pill
- profile trigger

Window controls are currently hidden in this shell variant.

### 5.4 Sidebar/tool FAB

| Property | Value |
| --- | --- |
| x | `26px` |
| y | `354px` |
| w | `64px` |
| h | `306px` |

Current sidebar is tool navigation, not page anchors.

### 5.5 Power radial cluster

CR-007 follow-up (Boss feedback 2026-07-09) replaced the WP-1 arc/claw layout with a proper corner
FAB directly under the sidebar — the slot the old wireframe reserved for its "P5" pill. The old
WP-1 container overflowed the stage bottom by 8px (`y620 + 148 = 768 > 760`) and floated the
cluster off to the side of the sidebar rather than under it; both are fixed here.
`tmp-power-radial-check.html` is **superseded** — do not use it as a reference anymore.

**Main button derivation** — centered on the sidebar column and tucked 12px below it:

- sidebar spans stage `x26..90` (center `x = 26 + 64/2 = 58`)
- main button is `46x46`, so centered means `left = 58 - 46/2 = 35` -> stage `x35..81`
- sidebar bottom edge is stage `y = 354 + 306 = 660`; +12px gap -> main button `y672..718`

**Action row** — 3 actions (`36x36`) fan RIGHT of the main button (not an arc) in a single
compact row, vertically centered on the main button's center (`y = (672+718)/2 = 695`, so
action top/bottom = `695 -/+ 18 = 677/713`), with 12px gaps: `tray` at local `left=58`
(`46 + 12`), `quit` at `left=106` (`58 + 36 + 12`), `drag` at `left=154` (`106 + 36 + 12`).
Container is sized tight to exactly this: `190 x 46` (main's own height, since every action's
local top/bottom, `5..41`, sits inside `0..46`).

| Property | Value |
| --- | --- |
| container x | `35px` |
| container y | `672px` |
| container w | `190px` |
| container h | `46px` |
| main button size | `46 x 46`, at container-local `0,0` |
| action button size | `36 x 36`, at container-local top `5px` |

Current actions (container-local offsets, JSX order tray/quit/drag left-to-right):

- tray mode — `58,5`
- full quit — `106,5`
- drag window — `154,5`

Final absolute (stage) rects, open state — all within `0..1420 x 0..760`:

| Element | x | y | w | h |
| --- | --- | --- | --- | --- |
| container | 35 | 672 | 190 | 46 |
| main | 35 | 672 | 46 | 46 |
| tray | 93 | 677 | 36 | 36 |
| quit | 141 | 677 | 36 | 36 |
| drag | 189 | 677 | 36 | 36 |

`.g-power-menu`'s `transform-origin` tracks the main button's own center in container-local
space: `23px 23px` (was `127px 75px`).

**Material** — per Boss feedback #3, `.g-power-main` and `.g-power-action` no longer use a
translucent `linear-gradient`; they now use the exact same opaque fill + rim as
`.g-sidebar-fab`'s winning (`!important`) rule below: `background: #0a0e15; border: 1px solid
rgba(150, 185, 230, 0.2);`. A transparent Tauri window can't give per-element `backdrop-filter`
anything real to blur, so matching the sidebar's solid material (instead of trying to fake more
blur) is what makes the whole left column read as one frosted-dark family.

**Panel-void relationship (verified against `FUNG_PANEL_PATH`)** — the panel's clip path is
walked in its own `1280x720` local space, then offset by the panel's stage position
(`--cr6-panel-left/top = 12,12`) to get stage coordinates. Tracing the path's vertices gives the
panel's true (notch-free) bounding box as stage `x24..1280, y24..720` — so **the panel's
stage-space bottom edge is `y720`**, not `y708` (that `708` is the *local*, pre-offset number).
The sidebar/tool notch is not a separate hole — the path's own left boundary bows inward from
`x24` to `x104` for `y362..700`, i.e. **there is no panel material under the sidebar's own
footprint, all the way down through the power cluster's row (`y672..718`)** — the same void the
sidebar FAB itself already floats over. Concretely: `tray` (`x93..129`) straddles the void wall
(roughly `x93..104` void, `x104..129` panel mass), while `quit` (`x141..177`) and `drag`
(`x189..225`) sit entirely past `x124` (the wall's max extent at the very bottom fillet) and are
fully over panel mass. This means the main button and part of `tray` are **not** "over the dark
shell mass" in the literal sense — they float in the same void as the sidebar — but since they
now share the sidebar's opaque material, that reads as intentional rather than as a floating
error. Widening the gap enough to clear the wall for `tray` too (~44px instead of 12px) was
rejected as it breaks the "compact row" requirement and the fixed main-button position.

### 5.6 Audio rail

The old P1-P5 page anchor rail has been replaced by a compact audio rail:

| Property | Value |
| --- | --- |
| x | `42px` |
| y | `40px` |
| w | `54px` |
| h | `158px` |

Contents:

- one vertical master volume slider
- ANN toggle
- SIGNAL toggle

### 5.7 Signal cards

CR-007 WP-1: `SignalGrid` moved from a `.g-deck-panel` child to a `.g-deck-stage` sibling (see
§4) so it renders inside the new bottom-right notch instead of being clipped away with it. Its
position is now given directly in stage coordinates; size was nudged +8px/+2px (position
unchanged) to land with an even 12px margin on all four notch sides.

| Property | Value |
| --- | --- |
| x | `840px` |
| y | `532px` |
| w | `428px` (was 420px) |
| h | `176px` (was 174px) |
| grid | `2 x 2` |

Cards:

- D = Enemy Missing
- E = Gank Risk
- F = Safe Push
- G = Vision

## 6. Dashboard sector geometry

Current dashboard sectors inside `.gm-fung-layout`:

| Sector | x | y | w | h |
| --- | --- | --- | --- | --- |
| Score header | `128` | `42` | `640` | `48` |
| Stats row | `128` | `98` | `478` | `42` |
| Battle grid | `128` | `148` | `640` | `260` |
| Agent card | `808` | `86` | `440` | `354` |
| Sector log | `128` | `418` | `620` | `170` |

> Agent card `y` was `42` until CR-007 follow-up (Boss feedback 2026-07-10): at `y42` its top
> 32px sat inside the topbar-notch void (notch floor is panel-local `y74`), so the panel
> `clip-path` chopped its top-right corner. Moved to `y86` (notch floor + 12px rhythm); the
> right column below is empty so height/width are unchanged, the card just shifts down.

## 7. Responsive behavior

- The shell is still a fixed authored composition.
- Responsiveness is done by scaling the whole stage, not by reflowing individual sectors.
- The stage scale is clamped to a max of `1.0` (§2) — it only ever scales down for a
  window smaller than 1420x760; it never scales up past authored size.
- No freeform browser-style responsive collapse is currently part of the implementation.

## 8. Known drift / known gaps

These are intentionally documented so design review uses repo truth:

1. The doc model and code model previously drifted apart on stage size (`1280x720` vs `1420x760` outer stage).
2. ~~The current path has no bottom-right subtract notch...~~ **Resolved by CR-007 WP-1** — see §4 (`FUNG_PANEL_PATH_SIGNALS`) and §5.7.
3. The old P1-P5 page anchor rail is no longer the active shell object; the current shell uses an audio rail there instead.
4. ~~Power radial placement is not final...~~ **Resolved by CR-007 WP-1** — see §5.5 for final numbers.

## 9. Review rule

When shell geometry changes, update these three artifacts together:

1. `src/src/CommandDeck.tsx`
2. `src/src/styles.css`
3. this file plus `assets/cr006-layer-dev-overlay.svg`
