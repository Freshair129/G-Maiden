---
version: "2.1.0-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-09T10:32:00+07:00,Codex"
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
s = min(window.innerWidth / 1420, window.innerHeight / 760, 1.4)
```

This means shell polish must be done in stage coordinates first, not screenshot pixels.

## 3. Layer stack

| Layer | Element | Current role |
| --- | --- | --- |
| L0 | Window canvas | transparent desktop window owned by Tauri |
| L1 | `.g-l1-white-glass` | large soft white-glass support plate under the app mass |
| L2 | `.g-deck-panel` | clipped subtract-shell body |
| L3 | `.g-sidebar-fab`, `.g-topbar-fab`, `.g-audio-rail` | floating shell attachments |
| L4 | `.g-power-radial`, `.g-signals-fab` | interaction overlays and status cards |

## 4. Subtract panel path

The panel shape is driven by `FUNG_PANEL_PATH` in `src/src/CommandDeck.tsx`.

Current path:

```svg
M 40,12 H 800 A 20 20 0 0 1 820,32 V 54 A 20 20 0 0 0 840,74
H 1248 A 20 20 0 0 1 1268,94 V 688 A 20 20 0 0 1 1248,708
H 112 A 20 20 0 0 1 92,688 V 350 A 20 20 0 0 0 72,330
H 32 A 20 20 0 0 1 12,310 V 40 A 28 28 0 0 1 40,12 Z
```

Current notch behavior:

| Notch | Status | Opens for |
| --- | --- | --- |
| Top-right | active | topbar FAB |
| Bottom-left side cut | active | sidebar/tool mass |
| Bottom-right | not active in current path | none |

Important: current implementation does **not** use a bottom-right subtract notch in the path.

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
| `--cr6-power-left` | `-34px` |
| `--cr6-power-top` | `626px` |
| `--cr6-power-main-left` | `92px` |
| `--cr6-power-main-top` | `42px` |

### 5.2 L1 white-glass underlay

Current L1 is inset symmetrically:

| Property | Value |
| --- | --- |
| `left` | `24px` |
| `top` | `24px` |
| `right` | `24px` |
| `bottom` | `24px` |
| `border-radius` | `16px` |
| `blur` | `78px` |
| `saturate` | `176%` |

This was recently reduced so it no longer bleeds beyond the visible outer shell edges.

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

| Property | Value |
| --- | --- |
| container x | `-34px` |
| container y | `626px` |
| container w | `184px` |
| container h | `154px` |
| main button size | `46 x 46` |
| action button size | `36 x 36` |

Current actions:

- tray mode
- full quit
- drag window

Known issue: power radial placement still needs polish relative to the bottom-left shell corner.

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

Current dashboard signal cluster:

| Property | Value |
| --- | --- |
| x | `828px` |
| y | `520px` |
| w | `420px` |
| h | `174px` |
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
| Agent card | `808` | `42` | `440` | `354` |
| Sector log | `128` | `418` | `620` | `170` |

## 7. Responsive behavior

- The shell is still a fixed authored composition.
- Responsiveness is done by scaling the whole stage, not by reflowing individual sectors.
- No freeform browser-style responsive collapse is currently part of the implementation.

## 8. Known drift / known gaps

These are intentionally documented so design review uses repo truth:

1. The doc model and code model previously drifted apart on stage size (`1280x720` vs `1420x760` outer stage).
2. The current path has no bottom-right subtract notch, even though some older mock docs referenced one.
3. The old P1-P5 page anchor rail is no longer the active shell object; the current shell uses an audio rail there instead.
4. Power radial placement is not final and remains the main open shell defect.

## 9. Review rule

When shell geometry changes, update these three artifacts together:

1. `src/src/CommandDeck.tsx`
2. `src/src/styles.css`
3. this file plus `assets/cr006-layer-dev-overlay.svg`
