---
version: "2.1.0-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-09T10:32:00+07:00,Codex"
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

## 13. Removed or superseded component ideas

These appear in older mock/design notes but are not the current active shell:

- P1-P5 anchor rail as the primary left-top shell object
- scoreboard-owned GSI status inside the score header
- standalone PING stat cell in the dashboard stats row
- topbar window controls in the current shell variant

If any of these return, add them back only after implementation and screenshot review.
