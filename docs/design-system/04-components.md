---
version: "2.1.2-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-10T00:00:00+07:00,Claude"
status: "draft"
attributes:
  domain: "ui-ux"
  scope: "component catalog"
  language: "th/en"
---

# 04 - Components

> Current source of truth:
> [src/src/CommandDeck.tsx](../../src/src/CommandDeck.tsx) and
> [src/src/styles.css](../../src/src/styles.css)

## Index

Shell:
- Topbar FAB
- Profile trigger
- Sidebar FAB
- Power radial
- Audio rail

Dashboard:
- Score header
- Mini stat
- Hero slot
- Agent card
- Signal card

Primitives:
- Status pill
- Button
- Elevation / shadow family

## 1. Topbar FAB

Code:
- `src/src/CommandDeck.tsx`
- `.g-topbar-fab` in `src/src/styles.css`

Current anatomy:

- wordmark: `G-MAIDEN`
- GSI status pill
- ping pill
- profile trigger

Current geometry:

- `446 x 50`
- radius `18`
- right-floating shell attachment inside the top notch zone

Current notes:

- acts as drag surface
- pills and profile trigger are `no-drag`
- window controls are hidden in this shell version

## 2. Profile trigger

Code:
- `.profile-wrap`
- `.profile-trigger`
- `.profile-dropdown`

Current anatomy:

- avatar core
- primary name
- secondary subtitle
- caret

Current dimensions:

- trigger width `126`
- trigger height `34`
- avatar `24 x 24`

Open state:

- dropdown shows Account, Voice Packs, Settings

## 3. Sidebar FAB

Code:
- `.g-sidebar-fab`
- `.g-nav-item`

Current anatomy:

- hidden brand stub
- 8 icon navigation buttons stacked vertically

Current geometry:

- shell `64 x 306`
- active item `42 x 32`

Current role:

- this is tool/page navigation
- it is not the old P1-P5 anchor rail model

## 4. Power radial

Code:
- `.g-power-radial`
- `.g-power-main`
- `.g-power-menu`
- `.g-power-action.*`

Current anatomy:

- main power button
- tray action
- quit action
- drag action

Current behavior:

- clicking main button toggles the radial
- drag action starts `getCurrentWindow().startDragging()`
- tray action hides the window
- quit action invokes `quit_application`

Known issue:

- this is the main remaining shell polish defect
- position and shape are not final relative to the lower-left shell corner

## 5. Audio rail

Code:
- `.g-audio-rail`
- `VolumeRail(...)`

Current anatomy:

- one master slider
- ANN toggle
- SIGNAL toggle

Current geometry:

- `54 x 158`
- transparent shell attachment

Data contract:

- persisted in `localStorage("gm-deck-audio-rail")`
- keys:
  - `master`
  - `annEnabled`
  - `signalEnabled`

## 6. Score header

Code:
- `.gm-score-header`

Current anatomy:

- left team + score
- clock
- right score + team

Current note:

- GSI status was removed from this block and moved into the topbar FAB

## 7. Mini stat

Code:
- `.gm-mini-stat`
- `MiniStat(...)`

Current set in dashboard:

- NW
- GPM
- XPM

Current note:

- standalone PING mini-stat was removed from the stats row
- ping now lives in the topbar pill

## 8. Hero slot

Code:
- `.gm-hero-slot`

Current anatomy:

- slot label
- state
- KDA

Current note:

- still a lightweight shell card for dashboard composition
- not yet a full live-rich card in this shell variant

## 9. Agent card

Code:
- `.gm-agent-card`
- `.gm-card-head`
- `.gm-agent-art`

Current anatomy:

- eyebrow + title
- status pill
- art field
- footer title

Current geometry:

- `440 x 354`

## 10. Signal card cluster

Code:
- `.g-signals-fab`
- `.g-sig`

Current anatomy per card:

- letter tag
- uppercase label
- numeric value
- progress bar

Current set:

- D Enemy Missing
- E Gank Risk
- F Safe Push
- G Vision

Current note:

- cluster is still rendered as a separate stage sibling
- it is not currently cut by a bottom-right subtract notch

## 11. Status pill

Code:
- `.g-status-pill`
- `.g-ping-pill`

Current anatomy:

- icon or dot
- strong label

Current states:

- GSI offline = gray dot
- GSI online = green dot
- ping = signal icon + numeric ms

## 12. Buttons

Current button families:

- nav item buttons
- profile trigger
- power buttons
- volume toggle pills

Shared rules:

- rounded corners
- dark shell fill
- light blue rim
- `no-drag` on interactive targets

## 13. Elevation / shadow family

CR-007 follow-up (Boss feedback 2026-07-09): "ปรับ scale และปรับขอบให้ฟุ้ง" — the shell
pieces read as hard-edged paper cutouts because an earlier flatten pass had set
`box-shadow: none !important` on the FABs. All shell pieces now share one feathered
ambient-shadow family so the stack reads as one floating composition, not stacked cards.

Tokens (`:root` in `src/src/styles.css`) — ค่าปัจจุบันหลัง Boss จูนความฟุ้ง 3 รอบ (2026-07-10):
- `--g-shadow-fab: 0 36px 96px rgba(3,6,12,0.54), 0 10px 32px rgba(3,6,12,0.40)` — large
  FABs: `.g-sidebar-fab`, `.g-topbar-fab`.
- `--g-shadow-tight: 0 24px 60px rgba(3,6,12,0.48), 0 6px 22px rgba(3,6,12,0.36)` — small
  buttons/cards: `.g-power-main`, `.g-power-action`, `.g-sig`.
- panel-rim feather (`.g-panel-rim use`) =
  `drop-shadow(0 56px 140px @.60) + (0 20px 58px @.46) + ice bloom (0 0 74px @.10)`.

ถ้าจะจูนต่อ แก้ 3 จุดนี้ที่เดียว — ห้าม fork ค่าเงาลง component (governance ข้อ 1)

Panel edge: `.g-deck-panel` is clipped by the Subtract path (`clip-path`, plus
`overflow:hidden` + `contain:paint`), so a `box-shadow` — or a `filter` on a
child of the panel — never draws outside the notches. `.g-panel-rim` fixes this
by living as a **`.g-deck-stage` sibling** of `.g-deck-panel` (rendered right
after `</main>` in `CommandDeck.tsx`, same escape pattern as `SignalGrid`),
positioned in stage coordinates to exactly overlay the panel box while reusing
the same `#gSubtractPanelPath` def. As a sibling it sits outside the panel's
clip/overflow/contain, so its 3-layer `filter: drop-shadow(...)` (two dark
ambient layers + a faint ice bloom, same hue family as the FABs above) is the
only thing that actually diffuses the panel edge into the background. Stacking:
`.g-panel-rim` is `z-index: 11` — just above `.g-deck-panel` (`10`) and below
the FAB layer (`32`-`35`), so the sidebar/topbar/power/signal FABs still draw
on top of it.

Rim lines: border/stroke alpha on `.g-sidebar-fab`, `.g-topbar-fab`, `.g-power-main`,
`.g-power-action.*`, `.g-sig`, and the `.g-panel-rim use` stroke were softened
~20-30% so the 1px rim line doesn't fight the new soft shadow.

Not shadowed: `.g-audio-rail` / `.g-volume-rail` stay transparent/borderless — the
prior "drop milky window plate" fix (commit `0eb35042`) deliberately removed their
plate, and a shadow on a fill-less box would reintroduce a hazy floating-rectangle
artifact with nothing backing it. Revisit only if the audio rail gets a real plate
again.

Drag-lag guard: `.is-dragging` (see `startWindowDrag()` in `CommandDeck.tsx`) forces
`box-shadow: none !important` and `filter: none !important` on every element above
(plus `.g-panel-rim use` specifically for the filter) during a native window drag —
WebView2 recomposites these layers on every window-move tick otherwise.

## 14. Removed or superseded component ideas

These appear in older mock/design notes but are not the current active shell:

- P1-P5 anchor rail as the primary left-top shell object
- scoreboard-owned GSI status inside the score header
- standalone PING stat cell in the dashboard stats row
- topbar window controls in the current shell variant

If any of these return, add them back only after implementation and screenshot review.
