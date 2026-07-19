---
version: "2.2.1-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-19,Claude"
status: "draft"
attributes:
  domain: "ui-ux"
  scope: "component catalog"
  language: "th/en"
---

# 04 - Components

> Current source of truth:
> [`src/src/CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx),
> [`src/src/MaidenLine.tsx`](file:///g:/G-Maiden/src/src/MaidenLine.tsx),
> [`src/src/shortcuts.ts`](file:///g:/G-Maiden/src/src/shortcuts.ts), and
> [`src/src/styles.css`](file:///g:/G-Maiden/src/src/styles.css)

## Index

Shell:
- Topbar FAB
- Profile trigger
- Sidebar FAB
- Power radial
- Audio rail

Dashboard:
- Score header
- Phase chip
- Mini stat
- Hero slot
- Agent card (shell)
- Tally dot
- ON AIR console
- Feed-age pill
- Readiness rundown
- Debrief timeline
- Signal card

Command surfaces:
- Maiden Line palette
- Shortcut sheet

Primitives:
- Status pill
- Button
- Elevation / shadow family

## 1. Topbar FAB

Code:
- [`src/src/CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx)
- [`.g-topbar-fab`](file:///g:/G-Maiden/src/src/styles.css#L4432) in `src/src/styles.css`

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
- [`.profile-wrap`](file:///g:/G-Maiden/src/src/styles.css#L1958)
- [`.profile-trigger`](file:///g:/G-Maiden/src/src/styles.css#L1963)
- [`.profile-dropdown`](file:///g:/G-Maiden/src/src/styles.css#L2026)

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
- [`.g-sidebar-fab`](file:///g:/G-Maiden/src/src/styles.css#L4406)
- [`.g-nav-item`](file:///g:/G-Maiden/src/src/styles.css#L4422)

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
- [`.g-power-radial`](file:///g:/G-Maiden/src/src/styles.css#L4840)
- [`.g-power-main`](file:///g:/G-Maiden/src/src/styles.css#L4850)
- [`.g-power-menu`](file:///g:/G-Maiden/src/src/styles.css#L4874)
- [`.g-power-action.*`](file:///g:/G-Maiden/src/src/styles.css#L4893)

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
- [`.g-audio-rail`](file:///g:/G-Maiden/src/src/styles.css#L5121)
- [`VolumeRail(...)`](file:///g:/G-Maiden/src/src/CommandDeck.tsx#L43)

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
- [`.gm-score-header`](file:///g:/G-Maiden/src/src/styles.css#L5251)

Current anatomy:

- left team + score
- clock
- right score + team
- phase chip (see next entry) — absolutely positioned, own containing block

Current note:

- GSI status was removed from this block and moved into the topbar FAB
- interior fill is now `var(--g-instrument)` + `var(--g-hairline)` border (CR-011 §B
  two-material rule — instrument matte, no blur/shadow); was translucent glass

## 6b. Phase chip

Code:
- [`.gm-phase-chip`](file:///g:/G-Maiden/src/src/styles.css#L5315) + 4 state modifiers `.gm-phase-chip-standby/prep/live/debrief`
- [`PhaseChip(...)`](file:///g:/G-Maiden/src/src/CommandDeck.tsx#L42) in [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx)
- phase state machine: [`src/src/live/phase.ts`](file:///g:/G-Maiden/src/src/live/phase.ts) [`stepPhase()`](file:///g:/G-Maiden/src/src/live/phase.ts#L71)

Current anatomy:

- single uppercase pill, right-edge of `.gm-score-header`, vertically centred
  (`right: 10px; top: 50%; transform: translateY(-50%)`)
- label text = `STANDBY` / `PREP` / `LIVE` / `DEBRIEF` (`PHASE_LABEL` map)

Current states:

- `standby` — muted (`--g-text-mute` on `--g-hairline` border), GSI offline (or a
  prior debrief survives Dota closing)
- `prep` — ice tint (draft/hero-select/loading states)
- `live` — lime tint (`--g-lime-500` / `--g-lime-soft` / `--g-lime-line`) — the one
  place on this chip lime is allowed, matching the "lime = on-air" rule
- `debrief` — ice-300 tint, dimmer background (post-game, sticky until next prep/live)

Layout note:

- `.gm-score-header > strong:last-of-type` reserves an 80px `padding-right` lane so a
  long right-team name can never run under the absolutely-positioned chip (CR011-P3
  merge-fix)
- geometry of `.gm-score-header` itself is untouched (03-layout.md numbers stand) —
  this is purely an additive absolutely-positioned child

Phase machine rules (order of precedence, `stepPhase()`):

1. GSI offline → `standby`, except a prior `debrief` survives (finished-match context
   stays honest even after Dota closes)
2. A recognized live state (`DOTA_GAMERULES_STATE_PRE_GAME` /
   `..._GAME_IN_PROGRESS`) or `inGame` → `live`
3. A recognized draft/hero-selection/loading state → `prep`
4. A recognized post-game state → `debrief`
5. Anything else while GSI stays online: previous `live` → `debrief` (disconnect
   without an explicit POST_GAME tick); previous `debrief` → stays `debrief`;
   otherwise → `standby`

## 7. Mini stat

Code:
- [`.gm-mini-stat`](file:///g:/G-Maiden/src/src/styles.css#L5362)
- [`MiniStat(...)`](file:///g:/G-Maiden/src/src/CommandDeck.tsx)

Current set in dashboard:

- NW
- GPM
- XPM

Current note:

- standalone PING mini-stat was removed from the stats row
- ping now lives in the topbar pill

## 8. Hero slot

Code:
- [`.gm-hero-slot`](file:///g:/G-Maiden/src/src/styles.css#L5424)

Current anatomy:

- slot label
- state
- KDA

Current note:

- still a lightweight shell card for dashboard composition
- not yet a full live-rich card in this shell variant

## 9. Agent card (shell)

Code:
- [`.gm-agent-card`](file:///g:/G-Maiden/src/src/styles.css#L5761) — the frozen box (geometry untouched by CR-011)
- [`.gm-card-head`](file:///g:/G-Maiden/src/src/styles.css#L5784), [`.gm-agent-art`](file:///g:/G-Maiden/src/src/styles.css#L5804) — **superseded**, see §14

Current anatomy:

- the `440 x 354` box now hosts the **ON AIR console** (§9b) as its sole content —
  `OnAirConsole(...)` renders inside `.gm-agent-card` via `gm-onair-*` classes only,
  the box's own geometry/border/background rule is untouched
- `.gm-card-head` / `.gm-agent-art` (eyebrow+title / status pill / static art field)
  are dead CSS as of CR-011 P2 — no longer rendered by any component; see §14

Current geometry:

- `440 x 354`
- interior fill is `var(--g-instrument)` + `var(--g-hairline)` border (two-material
  rule) — overflow:hidden since on-air content is length-variable (long G-Master
  advice must clip, never spill into the sector log below)

## 9a. Tally dot

Code:
- [`.gm-tally`](file:///g:/G-Maiden/src/src/styles.css#L5970) (base, 6x6px rounded square) + [`.gm-tally-onair`](file:///g:/G-Maiden/src/src/styles.css#L5980) (state modifier)
- used in: ON AIR console header, [`.gm-sector-log`](file:///g:/G-Maiden/src/src/styles.css#L5819) `<h3>` headers (Alert Deck /
  Companion State)

Current anatomy:

- a small LED-style square, off by default (`background: #1b2434`)
- `onair` state: lime fill (`--g-lime-500`) + glow-decay pulse
  (`gm-tally-decay` keyframe, 0.6s ease-out, one-shot on mount) — respects
  `prefers-reduced-motion: reduce` (animation off)

Current logic:

- driven directly off `gsiOnline` (GSI connected = tally on) — CR-011 §B specifies
  4 states (off/armed/on-air/alarm); the shipped build only wires 2 (off/on-air) —
  ice "armed" and danger "alarm" states are not yet implemented

## 9b. ON AIR console

Code:
- [`OnAirConsole(...)`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) in `CommandDeck.tsx`
- [`.gm-onair`](file:///g:/G-Maiden/src/src/styles.css#L5993), `.gm-onair-head`, `.gm-onair-title`, `.gm-onair-end`,
  `.gm-onair-chip` (+ `-cloud`/`-local`), `.gm-onair-agent`, `.gm-onair-now`
  (+ `-meta`/`-text`), `.gm-onair-empty`, `.gm-onair-log`, `.gm-onair-row`
  (+ `-time`/`-chip`/`-text`), `.gm-onair-retract`, `.gm-onair-pack`
- data: `CompanionData.utterances` ([`src/src/live/utterances.ts`](file:///g:/G-Maiden/src/src/live/utterances.ts) [`buildUtterances()`](file:///g:/G-Maiden/src/src/live/utterances.ts#L74))

Current anatomy (CR-011 §B "the agent sector reborn as an utterance ledger"):

- **header**: tally dot + "ON AIR — MAIDEN" title + backend chip
  (`CLOUD` / `LOCAL SLM`, derived from the newest MASTER-sourced utterance's
  `meta === "ollama"`) + agent-sector name
- **now block**: the newest utterance, large — time + source label
  (`SIGNAL`/`MASTER`/`ANN`) meta line, then the text. **Belief revision**: if
  `kind === "revision"` and a `retracted` string exists, renders
  `<s class="gm-onair-retract">{retracted}</s> <b>{text}</b>` — the struck-through
  words ahead of the correction, in danger-red strikethrough
  (`text-decoration: line-through 1px rgba(244,63,94,0.85)`)
- **pack suffix**: announcer-sourced lines with a `meta` value append
  `" — แพ็ก {meta}"` in muted text (`.gm-onair-pack`)
- **empty state**: honest copy when no utterance yet this session — never a fake
  placeholder line
- **log**: remaining utterances (oldest-first-after-newest), each row = time +
  source chip + text, same revision-strikethrough treatment per row

Current states:

- backend chip: `gm-onair-chip-cloud` (ice-500) / `gm-onair-chip-local` (ice-300)
- source chip tone: `gm-onair-row-chip-signal` (warn) / `-master` (ice-300) /
  `-announcer` (coin gold)
- list area clips (`overflow: hidden`) rather than growing the frozen box

## 9c. Feed-age pill

Code:
- [`FeedAgePill(...)`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) in [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) (function name is new; the DOM class is
  the pre-existing [`.g-ping-pill`](file:///g:/G-Maiden/src/src/styles.css#L5011) — reused, not renamed)
- lives in the topbar FAB (see §1 Topbar FAB)

Current anatomy:

- icon (signal-bars glyph) + numeric value, no text label (topbar is a fixed
  446px `contain:paint` box — a "FEED" label risks clipping the profile trigger)
- ticks its own local 1s `setInterval` (not `useCompanionData`) so only this pill
  re-renders every second, not the whole deck

Current logic (honest replacement for the old permanent "—" ping readout — GSI has
no real ping field at all):

- offline, or no snapshot yet → `—`
- online, age < 1000ms → `<1s`
- online, age ≥ 1000ms → `{seconds}s`, capped display at `99`
- tooltip explicitly says "sync ข้อมูลล่าสุดจาก backend (GSI ไม่มีค่า ping จริง)" —
  `updatedAt` stamps on ANY snapshot rebuild (incl. resource-stats), not GSI ticks
  alone, so the copy never claims a GSI-specific ping

## 9d. Readiness rundown

Code:
- [`ReadinessRundown(...)`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) in [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx)
- `.gm-battle-alt`[`.gm-rundown`](file:///g:/G-Maiden/src/src/styles.css#L5488), `.gm-rundown-note`, `.gm-rundown-list`,
  `.gm-rundown-row` (+ `.ready` modifier), `.gm-rundown-glyph`, `.gm-rundown-label`,
  `.gm-rundown-value`

Current anatomy — phase-axis content swap (CR-011 §E, CR011-P3):

- replaces the hero-column + minimap content of `.gm-battle-grid` during `standby`/
  `prep` phases; the grid's own geometry (`.gm-battle-grid`, 640x276, 3-column
  170/1fr/170 track) is untouched — `.gm-battle-alt` spans it full-width/height,
  `overflow: hidden`
- optional draft note banner ("กำลังดราฟต์ — รอเข้าเกม") when in a draft/hero-select
  state
- 5 checklist rows, each: status glyph (`✓` ice / `—` muted) + label + value —
  built ONLY from data the deck genuinely has: GSI connection, active voice pack,
  G-Signal on/off, ANN announcer on/off, master volume. A user's deliberate
  "off" toggle renders `"ปิด"`/`"ปิดเสียง"` (a choice), never the same `"—"` used
  for genuinely-absent capability — this distinction is an explicit Opus-gate rule

## 9e. Debrief timeline

Code:
- [`DebriefTimeline`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) render block in [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) (reads [`list_match_logs`](file:///g:/G-Maiden/src-tauri/src/main.rs) /
  [`read_match_log`](file:///g:/G-Maiden/src-tauri/src/main.rs) Tauri commands — [`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs))
- [`.gm-debrief`](file:///g:/G-Maiden/src/src/styles.css#L5555), `.gm-debrief-head`, `.gm-debrief-title`, `.gm-debrief-back`,
  `.gm-debrief-empty`, `.gm-debrief-list`, `.gm-debrief-row` (+ `-time`/`-chip`/
  `-text`), `.gm-debrief-row-chip-{gank,revision,missing,start,other}`

Current anatomy — phase-axis content swap for `debrief`:

- header: "สรุปแมตช์ล่าสุด" title + "back to live" button (`onBackToLive`)
- most-recently-archived match's timeline, most-recent-first: time (mono) + a
  tone-coded kind chip (`GANK` warn / `แก้คำทำนาย` danger / `หาย` text-dim /
  `เริ่ม` ice-300 / other muted) + text
- loading / no-log-yet empty states are explicit copy, not a blank box (the
  no-log state points the user at the History page)

## 10. Signal card cluster

Code:
- [`.g-signals-fab`](file:///g:/G-Maiden/src/src/styles.css#L4490)
- [`.g-sig`](file:///g:/G-Maiden/src/src/styles.css#L4495)

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

## 10a. Maiden Line palette

Code:
- [`src/src/MaidenLine.tsx`](file:///g:/G-Maiden/src/src/MaidenLine.tsx#L62) (default export)
- [`.gm-palette-backdrop`](file:///g:/G-Maiden/src/src/styles.css#L6115), [`.gm-palette`](file:///g:/G-Maiden/src/src/styles.css#L6157), `.gm-palette-input`, `.gm-palette-list`,
  `.gm-palette-section` (+ `-label`), `.gm-palette-row` (+ `.selected`/`.danger`),
  `.gm-palette-row-label`, `.gm-palette-row-hotkey`, `.gm-palette-empty`

Current anatomy (CR-011 §L/§M, CR011-P4a-01):

- floats in **window space** — `position: fixed`, mounted as a sibling of
  `.g-deck-stage` in [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx), never inside the scaled/clipped stage;
  z `--g-z-pop`
- console-glass material (`var(--g-blur-console)`) — one of only two surfaces
  (with the shortcut sheet) permitted to blur outside the shell
- top-center float, `18vh` from the top, `560px` wide, max height `360px`
- filter input (bilingual placeholder "ให้ช่วยอะไรดีคะ?") + three sections in
  fixed order: **Actions**, **Pages**, **Settings**
- each row: Thai label (primary display text) + optional mono hotkey chip
  (`Ctrl+1`..`Ctrl+8` for page entries)
- page-list entries are generated FROM [`shortcuts.ts`](file:///g:/G-Maiden/src/src/shortcuts.ts) `PAGES` (single source —
  the page list + Thai labels used to be hand-copied in three places and had
  already drifted before this fix)

Current states:

- row hover / `.selected` (arrow-key or mouse) / `.danger` (armed destructive —
  Quit) — arming re-labels the row `"ยืนยัน — {label}"` and requires a second
  Enter/click to actually run; any selection change, filter edit, or blur
  disarms it
- phase-aware ranking (`rankBoost()`): boosts "เปิด debrief" to the top of
  Actions during `debrief` phase, and "ทดสอบเสียง"/"ไปที่ Settings" during
  `standby` — ties keep stable original order
- empty state: "ไม่พบคำสั่งที่ตรงกัน"

Keyboard: `ArrowUp`/`ArrowDown` move selection, `Enter` runs/arms, `Escape`
disarms-then-closes (never both in one press).

## 10b. Shortcut sheet

Code:
- shortcut-sheet render block in [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) (registry from
  [`src/src/shortcuts.ts`](file:///g:/G-Maiden/src/src/shortcuts.ts) [`buildRegistry()`](file:///g:/G-Maiden/src/src/shortcuts.ts#L137))
- [`.gm-sheet-backdrop`](file:///g:/G-Maiden/src/src/styles.css#L6116), `.gm-sheet`, `.gm-sheet-head`, `.gm-sheet-close`,
  `.gm-sheet-section-label`, `.gm-sheet-row`, `.gm-sheet-row-combo`

Current anatomy:

- floats in window space, centered (unlike the top-anchored palette), same
  console-glass material, `420px` wide, max height `min(72vh, 560px)`
- two sections: **"In-app"** (rows generated from `buildRegistry()` — single
  source, never hand-copied) and **"Global (ทำงานแม้อยู่ในเกม)"** (the
  `tauri_plugin_global_shortcut` hotkeys from [`main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs), listed as
  [`GLOBAL_HOTKEYS`](file:///g:/G-Maiden/src/src/CommandDeck.tsx#L52) in [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx))
- each row: Thai label + mono combo chip (e.g. `Ctrl+K`, `Ctrl+Alt+S`)

Registry scope note (honesty rule): [`shortcuts.ts`](file:///g:/G-Maiden/src/src/shortcuts.ts)'s `buildRegistry()` only
carries bindings actually wired (as of CR011-P4b-01: `Ctrl+K`, `Ctrl+1`..`8`,
`Ctrl+/` + `?`, `F6`/`Shift+F6` seat-focus cycling, `Shift+F10` context menu,
`Esc`) — it must never list a binding the build doesn't honor yet
(`Ctrl+Tab`/`Space`/`Ctrl+D`/`F2` belong to later, not-yet-shipped waves).

## 10c. Context menu

Code:
- [`src/src/ContextMenu.tsx`](file:///g:/G-Maiden/src/src/ContextMenu.tsx) ([`ContextMenu`](file:///g:/G-Maiden/src/src/ContextMenu.tsx#L100) + [`useContextMenu`](file:///g:/G-Maiden/src/src/ContextMenu.tsx#L51))
- [`.gm-menu-*`](file:///g:/G-Maiden/src/src/styles.css#L6299) in `styles.css`

Current anatomy:

- window-space popup at cursor / focused target, viewport-clamped (measured
  via `useLayoutEffect` before first paint — no overflow flash)
- material: **instrument matte + hairline** (NOT blur — menus are small, per
  the two-material rule), z `--g-z-pop`, 120ms fade, reduced-motion instant
- keyboard: ↑↓ wrap, Enter runs, Esc/Tab closes; focus enters on open and
  returns to the invoker on close; `role="menu"`/`menuitem`

Current targets (all read/act honestly — no item that cannot truly act):

- hero seat: copy hero name (OpenDota link deliberately omitted — no reliable
  npc-short→id mapping exists; a sometimes-wrong link violates honest state)
- utterance row: copy text (revision rows prefix the retracted claim)
- annunciator card: G-Signal sensitivity Low/Med/High (invokes
  [`set_cv_signal_sensitivity`](file:///g:/G-Maiden/src-tauri/src/main.rs), syncs `gm-settings.signalSensitivity` so the
  legacy Settings panel never disagrees; active level disabled) + test alert

## 11. Status pill

Code:
- [`.g-status-pill`](file:///g:/G-Maiden/src/src/styles.css#L5011)
- `.g-ping-pill` (see §9c Feed-age pill — same DOM class, new honest content)

Current anatomy:

- icon or dot
- strong label

Current states:

- GSI offline = gray dot
- GSI online = green dot
- feed-age (v3, was "ping") = signal-bars icon + `—`/`<1s`/`{n}s` — see §9c;
  GSI carries no real ping/latency field, so this is honestly a sync-age reading,
  never a fake ms number

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
- [`--g-shadow-fab`](file:///g:/G-Maiden/src/src/styles.css#L30)`: 0 36px 96px rgba(3,6,12,0.54), 0 10px 32px rgba(3,6,12,0.40)` — large
  FABs: `.g-sidebar-fab`, `.g-topbar-fab`.
- [`--g-shadow-tight`](file:///g:/G-Maiden/src/src/styles.css#L31)`: 0 24px 60px rgba(3,6,12,0.48), 0 6px 22px rgba(3,6,12,0.36)` — small
  buttons/cards: `.g-power-main`, `.g-power-action`, `.g-sig`.
- panel-rim feather (`.g-panel-rim use`) =
  `drop-shadow(0 56px 140px @.60) + (0 20px 58px @.46) + ice bloom (0 0 74px @.10)`.

ถ้าจะจูนต่อ แก้ 3 จุดนี้ที่เดียว — ห้าม fork ค่าเงาลง component (governance ข้อ 1)

Panel edge: [`.g-deck-panel`](file:///g:/G-Maiden/src/src/styles.css#L4448) is clipped by the Subtract path (`clip-path`, plus
`overflow:hidden` + `contain:paint`), so a `box-shadow` — or a `filter` on a
child of the panel — never draws outside the notches. [`.g-panel-rim`](file:///g:/G-Maiden/src/src/styles.css#L4759) fixes this
by living as a **`.g-deck-stage` sibling** of `.g-deck-panel` (rendered right
after `</main>` in [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx), same escape pattern as `SignalGrid`),
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

Not shadowed: `.g-audio-rail` / [`.g-volume-rail`](file:///g:/G-Maiden/src/src/styles.css#L5135) stay transparent/borderless — the
prior "drop milky window plate" fix (commit `0eb35042`) deliberately removed their
plate, and a shadow on a fill-less box would reintroduce a hazy floating-rectangle
artifact with nothing backing it. Revisit only if the audio rail gets a real plate
again.

Drag-lag guard: [`.is-dragging`](file:///g:/G-Maiden/src/src/styles.css#L4701) (see [`startWindowDrag()`](file:///g:/G-Maiden/src/src/CommandDeck.tsx#L582) in [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx)) forces
`box-shadow: none !important` and `filter: none !important` on every element above
(plus `.g-panel-rim use` specifically for the filter) during a native window drag —
WebView2 recomposites these layers on every window-move tick otherwise.

## 14. Removed or superseded component ideas

These appear in older mock/design notes but are not the current active shell:

- P1-P5 anchor rail as the primary left-top shell object
- scoreboard-owned GSI status inside the score header
- standalone PING stat cell in the dashboard stats row
- topbar window controls in the current shell variant
- **Agent card art field** (`.gm-card-head`, `.gm-agent-art` — eyebrow/title,
  status pill, static art field, footer title): superseded by the **ON AIR
  console** (§9b) inside the same frozen `.gm-agent-card` box, CR-011 §B
  "the agent sector reborn as an utterance ledger... instead of a static art
  block." The CSS rules for `.gm-card-head`/`.gm-agent-art` still exist in
  `styles.css` but no component renders them anymore.

If any of these return, add them back only after implementation and screenshot review.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 2.2.0-draft | 2026-07-19 | changelog table added per Step-5 SOP (G1.5) |
| 2.2.1-draft | 2026-07-19 | symbol-link coverage extension (G1.5) |
