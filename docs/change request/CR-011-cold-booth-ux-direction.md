# CR-011: COLD BOOTH — Desktop UX/UI direction for the Command Deck

**Status:** ACCEPTED (owner "อนุมัติทั้งหมด" 2026-07-14 — absorbs and extends [[CR-007-frostline-deck-refresh|CR-007]] FROSTLINE WP-2..6; owner amendment: panel blur returns as the cinematic DEFAULT tier, overriding §H's shipped-parity default)
**Amended by [[CR-013-one-canvas-sitemap-gstore-ios-settings|CR-013 ONE CANVAS]]** (2026-07-16): §C information-architecture + §E core-screens are superseded — nav 8→7 (Build→Live tab, History→Insights tab, +G-Store seat), Settings rebuilt as an iOS split view, and the R1/R2/R3 ONE CANVAS laws added. CR-011's §B direction + §F–§I component/type/color/motion systems stand unchanged.
**Author:** Claude (direction study) for Boss
**Date:** 2026-07-14
**Inputs read:** PRD + SRS (`docs/product/`), design-system SSOT v2.1 (`docs/design-system/00–08`), CR-006 lock + [[CR-007-frostline-deck-refresh|CR-007]] design package, [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) / [`CompanionPages.tsx`](file:///g:/G-Maiden/src/src/CompanionPages.tsx) / [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) / [`styles.css`](file:///g:/G-Maiden/src/src/styles.css) / [`companion.ts`](file:///g:/G-Maiden/src/src/companion.ts) + `live/*`, [[CR-003-account-phase1-wallet-billing|CR-003]] orphan surfaces (Store/Wallet/Ledger/Inventory), sitemap flow board, screen-direction boards, live dev-server DOM.

---

## 0. Ground rules this direction accepts as law

1. **CR-006 shell is locked** (Boss, 2026-07-09): fixed stage `1420×760`, Subtract panel `1280×720` with 3 notches, fillet 28/20, L1 liquid glass, 5 dashboard sectors at fixed coordinates, sidebar/topbar/power/audio-rail geometry. This direction moves **zero px** of shell geometry.
2. **Combat HUD (overlay window) is out of scope** — its contract is [[07-combat-hud|07-combat-hud.md]]. Only shared tokens flow to it, never visible-value changes.
3. **NFR gate:** CPU ≤2.5%, RAM ≤400MB, overlay FPS ≤3%, G-Signal ≤300ms. Every visual decision below is written against it.
4. **Boss already rejected** freeform resizable grids and a bolt-on inspector shell ([[CR-007-frostline-deck-refresh|CR-007]] §4). The desktop requirements (resizable panels, inspector, density) are satisfied *inside* this ruling — see §J/§N.

---

## 1. What the codebase and docs actually say (inference)

### 1.1 What kind of product G-Maiden is
Not a dashboard, not a chat app. It is a **real-time match instrument with a persona**: a
voice-first co-pilot whose most important output (G-Signal voice interrupt) happens while the
user cannot look at the app. The Command Deck is a *booth* — the place the match is watched
from, prepared in, and reviewed in — while the actual live surface is a click-through overlay
with its own frozen contract.

### 1.2 Primary user
A competitive Thai Dota 2 player, mid-match, deck minimized or on a second monitor.
Three interaction distances:
- **2 m / 200 ms** — mid-match glance at the second monitor: score, momentum, annunciators.
- **60 cm / seconds** — pre-match readiness, post-round check.
- **60 cm / minutes** — between matches: debrief, packs, store, settings, authoring.
Secondary: streamer (mask + on-camera looks); tertiary: pack author (Voice editor).

### 1.3 Workflows that matter (ranked)
1. First run → GSI ready (make-or-break onboarding; today buried in Settings).
2. Pre-match readiness glance ("will Maiden work this game?").
3. In-match peripheral glance (signals, momentum, minimap mirror).
4. Post-match debrief (G-Log exists; UI barely surfaces it).
5. Voice pack manage/activate/buy (the moat: G-AnnStudio + CR-003 economy).
6. Overlay layout editing; 7. Account/GID/Steam; 8. Settings/quality/quota.

### 1.4 Screens that exist / should exist
Exist: Dashboard, Live, Companion, Voice, Build (scaffold), Insights, History, Settings,
Account (hidden in a dropdown). **Built but orphaned:** Store, Wallet, Ledger, Inventory,
TopupModal, MatchShareCard (CR-003 — no nav entry at all). Should exist: a debrief state
(not a page — a *phase*), a command palette, one merged economy home, a first-run readiness
flow that isn't a settings card.

### 1.5 What is currently generic, weak, or inconsistent (brutal list)
- **Four styling systems**: deck CSS classes (ice), account/store classes, CR-003 inline
  navy/cyan (`#64c7ff/#31d0a0/#24344e` — a *second* blue), App/overlay inline ice. Two blues,
  two green/red pairs, class-vs-inline split, no TH/EN copy rule.
- **Domain pages are SaaS bento**: [`CompanionPages.tsx`](file:///g:/G-Maiden/src/src/CompanionPages.tsx) is eyebrow + card-shell + stat-box
  grids — the exact card-grid grammar the shell was built to escape.
- **The agent card is an empty marketing block**: a big art void labeled "Tactical AI".
  The persona — the product's core — has zero UI evidence beyond it.
- **Dead chrome**: a permanent "—" ping pill (GSI has no ping; the tooltip admits it),
  "VOLUM" typo, emoji icons (👤🎙⚙) beside a stroke icon set, decorative minimap orbs.
- **Type is OS-default**: Segoe UI everywhere, 800-weight on everything, 8.5px micro
  that dies below scale 1.0. No luxury, no voice.
- **Glass without meaning**: blur on shell *and* interior cards; a fixed compositing tax
  (the [[CR-007-frostline-deck-refresh|CR-007]] quality-tier problem) and, honestly, decorative glassmorphism.
- **The deck doesn't know time**: same UI before/during/after a match ([[CR-007-frostline-deck-refresh|CR-007]] #4).
- **No keyboard layer, no context menus, no density modes, no long-task states.**
- The old screen-direction board (sidebar + card grid + oversized character hero) is the
  generic ghost that still haunts secondary pages. It should be formally retired.

### 1.6 Design opportunities (what only this app can do)
- The persona **speaks and corrects itself** — belief revision is a functional requirement.
  No other desktop app can show "what I said, and where I was wrong" as UI.
- **Hysteresis thresholds, confidence, staleness** exist in the backend (signal latch
  0.65/0.40, CV Lite mode, NO_SENSOR sentinels) — honesty can be a visual signature.
- **The match has phases** (GSI knows) — the app can *change itself* instead of being browsed.
- The locked Subtract shell is already a memorable, non-generic silhouette — the interior
  just hasn't earned it yet.

---

## 2. Five directions (explored before choosing)

> Scoring: usability / originality / desktop ergonomics / visual memorability /
> implementation feasibility / fit with G-Maiden (locked shell, NFR, persona, Thai-first).

### D1 — COLD BOOTH (broadcast observatory)
- **Concept name:** Cold Booth — the caster booth that runs itself.
- **Interaction metaphor:** a broadcast control room for a match *you are inside*. Seats
  (fixed sectors) with tally lights; a rundown that follows match phases; Maiden as the
  on-air talent whose every utterance is logged.
- **Layout model:** the locked CR-006 stage as the console. Interior sectors become
  **matte instruments** set into the glass shell (two materials, not one).
- **Navigation model:** existing icon rail (8 seats) + phase axis (automatic content
  switching standby→prep→live→debrief) + `Ctrl+K` Maiden Line palette across both.
- **Desktop behavior:** tray-first lifecycle; unfocused deck dims to "house lights" glance
  mode; job chips for long tasks; native-feel context menus; future always-on-top gadget
  (CR-007's noted follow-up).
- **Visual language:** ice/lime kept; glass restricted to shell + FABs; interiors opaque
  ink with hairlines; tally dots; engineering ticks on bars; Plex Sans Thai Looped + Plex Mono.
- **Motion language:** broadcast grammar — hard cuts between pages, stepped tally changes,
  300 ms bar fills, ink-strikethrough for belief revision, no choreography.
- **Component personality:** annunciators, rundown rows, lower-third labels, quiet toasts.
- **Non-generic because:** tally-light state logic, an utterance ledger with visible
  retractions, and threshold ticks on live bars exist in no companion app; the metaphor is
  native (the PRD literally says "live shoutcaster at your side"), not imported.
- **Implementation difficulty:** Medium — extends CR-007 WPs on the locked shell.
- **Scores:** usability **9** · originality **8** · ergonomics **8** · memorability **8** ·
  feasibility **9** · fit **10** → **52**

### D2 — AURORA INSTRUMENT (avionics cluster)
- **Concept:** the deck as a cockpit instrument cluster: engraved bezels, LED steps,
  needle damping, matte black, zero glass.
- **Metaphor:** pilot's annunciator panel; pages are "modes" on a rotary selector.
- **Layout:** fixed instruments (compatible with locked sectors) but shell glass removed.
- **Navigation:** mode knob + palette. **Desktop:** excellent glanceability, poor hierarchy
  for authoring/store surfaces.
- **Visual:** phosphor ice on matte; mono-heavy. **Motion:** needle physics, LED quantization.
- **Personality:** stern, mechanical. **Non-generic:** no cards at all.
- **Difficulty:** High — discards L1 liquid glass (violates the CR-006 lock) and reads
  colder than the persona allows.
- **Scores:** 8 · 8 · 8 · 8 · 5 · 6 → **43**

### D3 — RYLAI'S TABLE (tactical cartography)
- **Concept:** a commander's frost-etched map table; the minimap mirror becomes a large
  centerpiece with intel annotations; sectors orbit the map.
- **Metaphor:** war-room table. **Layout:** radical center-map recomposition.
- **Navigation:** spatial + palette. **Desktop:** strong for one screen, weak for eight.
- **Visual:** cartographic contours, marker trails. **Motion:** parallax table depth.
- **Personality:** dramatic, intel-agency. **Non-generic:** very.
- **Difficulty:** Very high — breaks every locked sector; worse, it over-promises data the
  system honestly lacks (own-game CV gives sparse enemy identity; a hero-sized map of `—`
  violates Honest State every minute).
- **Scores:** 6 · 9 · 6 · 9 · 3 · 5 → **38**

### D4 — THE SCRIBE'S LEDGER (editorial match-document)
- **Concept:** the match as a document Maiden writes in real time; typeset event ledger,
  folio columns, debrief-first.
- **Metaphor:** live manuscript. **Layout:** two-column folio + timeline spine.
- **Navigation:** chapters = phases. **Desktop:** superb for review, poor at 2 m — prose
  doesn't glance.
- **Visual:** typography-led, hairlines, near-monochrome. **Motion:** text settle, ink
  strikethrough (its best idea). **Personality:** literary, calm.
- **Non-generic:** belief-revision ink is a one-of-a-kind signature.
- **Difficulty:** Medium-high; fails the peripheral-first principle for live play.
- **Scores:** 6.5 · 9 · 7 · 8.5 · 6 · 7 → **44**

### D5 — CRYOSTAT (metrology instrument)
- **Concept:** a precision measurement instrument (cryogenics lab = ice brand): readouts
  with tolerances, calibration language, confidence intervals as engineering whiskers.
- **Metaphor:** lab bench. **Layout:** specimen plates in the locked sectors.
- **Navigation:** unchanged rail + palette. **Desktop:** good density story.
- **Visual:** porcelain-on-void, crosshair ticks, hyper-restraint. **Motion:** sample-and-
  hold, instrument settle. **Personality:** exact, impersonal.
- **Non-generic:** measurement-uncertainty as first-class UI.
- **Difficulty:** High polish cost; the persona (gentle, meme-aware) has no room — the
  product becomes credible but loveless.
- **Scores:** 7 · 8.5 · 7.5 · 7.5 · 6 · 6.5 → **43**

### Verdict

| Direction | Usab. | Orig. | Ergo. | Memor. | Feas. | Fit | Σ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **D1 Cold Booth** | 9 | 8 | 8 | 8 | 9 | 10 | **52** |
| D4 Scribe's Ledger | 6.5 | 9 | 7 | 8.5 | 6 | 7 | 44 |
| D2 Aurora Instrument | 8 | 8 | 8 | 8 | 5 | 6 | 43 |
| D5 Cryostat | 7 | 8.5 | 7.5 | 7.5 | 6 | 6.5 | 43 |
| D3 Rylai's Table | 6 | 9 | 6 | 9 | 3 | 5 | 38 |

**Chosen: D1 COLD BOOTH**, deliberately annexing the strongest organ from each loser:
D4's belief-revision ink + utterance ledger, D5's tolerance ticks/honest whiskers,
D2's annunciator discipline, and D3's live-map ambition *scaled to honest data*
(the existing minimap mirror stays a mirror; markers only when CV really has them).
The losers fail for structural reasons (lock violations, honesty violations, persona
erasure), not taste.

---

## A. Product UX thesis

**G-Maiden's user is absent during the product's most important moments.** The deck must
therefore be designed to be *glanced at, not used* while live, and *used, not glanced at*
between matches — two different interfaces sharing one geometry. The design resolves this
with three commitments:

1. **Seats, not pages.** Every kind of information has one fixed seat (the locked sectors +
   annunciators). Content changes with match phase; position never does. Peripheral vision
   is the primary API.
2. **The persona is evidence, not decoration.** Maiden appears as what she said, when, with
   what confidence, and where she corrected herself — an on-air record, not an anime panel.
3. **Honesty is the luxury.** `—` over fake zeros, visible thresholds, visible staleness,
   visible fallbacks (LOCAL SLM chip). Quiet, credible surfaces make the one loud signal
   (lime) mean something.

Award-level principles extracted (not copied) from adjacent *domains*, not apps:
broadcast tally/rundown discipline (state at a glance, fixed seats), avionics annunciators
(alarm hierarchy, dark-cockpit "quiet until abnormal"), and metrology (tolerances shown,
never implied). No visual quotation from any existing product.

## B. Final design direction

**COLD BOOTH** on the locked CR-006 shell:

- **Two materials, strictly assigned.**
  - *Console glass* (the only blur): the Subtract panel, FABs, palette, menus. Blur per
    quality tier (§H). Rim + feathered shadow as today.
  - *Instrument matte*: every interior sector/card — opaque ink fill, 1 px hairline,
    no blur, no shadow. This is the single biggest visible change: the interior stops
    competing with the shell, GPU cost drops, and glass regains meaning (shell floats,
    instruments are *set into* it).
- **Tally system**: a 6 px square LED beside each seat title. off = idle · ice = armed
  (phase active, no data yet) · lime = on-air (receiving live data) · danger = alarm.
  Lime remains forbidden everywhere else.
- **Phase axis**: standby → prep → live → debrief (auto from GSI, manual override). Seats
  swap content per CR-007 WP-5's table, extended in §E.
- **On-air console** (the agent sector reborn): Maiden's presence as an utterance ledger —
  last line typeset large, prior lines below, each with time + trigger chip
  (SIGNAL/MASTER/ANN) + backend chip (CLOUD/LOCAL SLM). Belief revision renders the
  retracted words struck through in danger-red ink with the correction following. Persona
  portrait stays small (32 px núcleo in the header), never a hero image.
- **Honest instrumentation**: bars carry threshold ticks (e.g. the G-Signal latch at
  0.40/0.65) and baseline whiskers (player NW/GPM vs own OpenDota baseline). The dead ping
  pill becomes a real **feed-age readout** (`GSI 480ms` = time since last tick; `—` offline).
- **Typography as the luxury layer**: IBM Plex Sans Thai Looped + IBM Plex Mono, bundled
  locally (WP-3), weight discipline replacing today's 800-everywhere.

## C. Information architecture

```
Command Deck (control window)
├─ 1 Booth        (dashboard; phase-aware seats)        Ctrl+1
├─ 2 Live Match   (objectives, visibility, feeds)       Ctrl+2
├─ 3 Packs        (Voice inventory ▸ Store ▸ editor)    Ctrl+3   ← merges Voice + orphaned Store/Inventory
├─ 4 Build        (advisor; marked scaffold until real) Ctrl+4
├─ 5 Insights     (baselines, weekly, posture)          Ctrl+5
├─ 6 History      (G-Log sessions → debrief view)       Ctrl+6
├─ 7 Account      (GID, Steam, profile ▸ Wallet ▸ Ledger) Ctrl+7 ← wallet economy lives with identity
└─ 8 Settings     (overlay, voice, quality, hotkeys, GSI setup, quota)  Ctrl+8
Orthogonal axes:
├─ Phase: standby → prep → live → debrief (content, never layout)
└─ Maiden Line (Ctrl+K): verbs across everything
```
Changes vs today: **Companion page dissolves into Settings** (it is settings); **Account
enters the rail** (today it hides in a dropdown); **Store/Inventory/Wallet/Ledger get homes**
(today: unreachable). Profile dropdown remains as a shortcut (Account / Packs / Settings) —
same destinations, no third axis. Overlay window IA untouched.

## D. Main window layout

Geometry = CR-006, verbatim ([[03-layout|03-layout.md]] §5–6). What changes is *rolecast*:

| Zone (locked geometry) | Booth role | Tally |
| --- | --- | --- |
| Score header `128,42,640,48` | Scoreline + **phase chip** + clock | live |
| Stats row `128,98,478,42` | NW/GPM/XPM vs baseline whiskers | live |
| Momentum strip | signed momentum + phase label (exists) | live |
| Battle grid `128,148,640,260` | 10 hero seats + minimap mirror | live |
| Agent card `808,86,440,354` | **On-air console** (utterance ledger) | on-air |
| Sector log `128,418,620,170` | Event feed + companion state quartet | live |
| Signal notch `840,532,428,176` | Annunciators D/E/F/G | alarm |
| Sidebar FAB / topbar FAB / audio rail / power radial | unchanged | — |

Interior-only degrees of freedom (geometry-safe): density mode paddings, per-seat content
per phase, inspector slide-over *inside* the panel clip world on list pages (§F.8).

## E. Core screens

- **Booth · standby**: seats teach — score header `— --:-- —`; battle grid becomes the
  readiness rundown (GSI config ✓ · Dota detected ✓ · overlay armed ✓ · voice pack ✓ ·
  volume ✓ — each row actionable); on-air console shows Maiden idle line + last session
  summary; annunciators dark. This *is* onboarding — first run and every launch share it.
- **Booth · prep** (draft detected): rundown flips to draft intel (Draft-CV roster when
  present, else `—`), baseline stats arm (ice tallies).
- **Booth · live**: as §D; heroes populate (ally full; enemy identity/missing only — the
  honest own-game limit), annunciators live, utterances stream.
- **Booth · debrief** (auto once per match end): score header shows result; stats row shows
  deltas vs baseline; battle grid becomes match timeline (G-Log events); on-air console
  shows the **revision record** (predictions made / corrected — ink strikethroughs);
  sector log offers "save share card" (existing MatchShareCard) + "open History".
- **Live Match**: objective board (real data only; today's hardcoded Roshan strings become
  `—` until wired), visibility board, dual feeds. Same matte instruments, no card-shell bento.
- **Packs**: banner-first inventory grid (a pack *is* an image + sound), fixed-height pager
  (keep CR-003's no-scroll rule), Store tab with shard/coin prices (glyphs, not 💎🪙 emoji),
  Editor entry for authors. Activate = tally blink + toast.
- **Insights / History**: metrology styling — baseline whiskers, tolerance language;
  History rows open a debrief view of that session (reuses debrief seats).
- **Account**: identity (GID plate, Steam link) + Wallet/Ledger sub-tabs (CR-003 surfaces,
  re-tokened). GID rendered as an engraved mono plate — it is the brand's serial number.
- **Settings**: quality tier (cinematic/balanced/eco), density, crisp-text snap, hotkey
  sheet, GSI setup card (promoted), quota (existing), overlay/voice behavior (from the old
  Companion page), updater.

## F. Component system

All components ship the full state set: default / hover / focus-visible / active / selected
/ disabled / loading / error (+ drag/drop where applicable). Shared rules: hover = fill
+4% ice alpha (never scale), focus = 2 px ice ring outside, selected = ice hairline + 8%
fill, disabled = 40% text + no hover, drag = lift shadow tier-2 + 98% opacity, drop target
= dashed ice hairline.

1. **Seat** (sector frame): matte instrument, header = micro label + tally + optional
   action; body free.
2. **Annunciator** (D–G): letter tag, label, mono value, bar with threshold ticks; alarm
   state = lime fill + 600 ms glow decay; never blinks continuously.
3. **Stat cell**: label / mono value / baseline whisker (▲▼ vs avg); `—` state built-in.
4. **Rundown row**: status glyph + text + trailing action; the checklist/timeline/feed atom.
5. **Utterance row**: time (mono) + trigger chip + text (Thai); revision variant with
   struck span; context menu: replay clip · copy text.
6. **Hero seat**: portrait ground (existing), name, state, KDA; context menu: OpenDota
   profile · copy name.
7. **Tally pill / status pill**: GSI, feed-age, LOCAL SLM, LIVE.
8. **Inspector slide-over**: 320 px, right edge, inside panel clip; opens on selection in
   Packs/History/Ledger (details, never a modal); Esc closes, F6 reaches.
9. **Maiden Line palette** (§M), **context menu** (token-styled, keyboard navigable,
   z `--g-z-pop`), **job chip** (§K), **toast** (bottom-center, 3 s, quiet).
10. **Buttons**: primary (ice-700 fill) / quiet (hairline) / danger (danger fill, confirm
    pattern) — verb+object labels ("Activate pack", "ติดตั้งแพ็ก"), one shape family, no
    ghost-card border+shadow pairing.
11. **Forms**: single input family (the Steam link input is the reference), inline
    validation under the field.

Copy rule (ends the TH/EN split): **chrome labels = English uppercase micro** (plate
language: NW, GPM, ON AIR, FEED); **sentences, persona, empty states, confirmations = Thai**.
Numbers always mono tabular.

## G. Typography system

- **UI**: IBM Plex Sans Thai Looped (bundled woff2, no CDN) — weights 400/500/600.
- **Data**: IBM Plex Mono — 400/500; all numerals, clocks, ids, GID plate.
- **No display face.** Two families total.

| step | px | face/weight | use |
| --- | --- | --- | --- |
| micro | 10 | Sans 600, caps, +0.6 px tracking | seat labels, chips |
| caption | 11 | Sans 500 | meta, sublabels |
| body | 12 | Sans 400/500 | UI text, nav, rows |
| data | 13 | Mono 500, tabular | stat values |
| body-lg | 14 | Sans 500 / Mono 400 | utterance text, clock |
| title | 17 | Sans 600 | seat headings (was 800 — demoted) |
| score | 21 | Mono 500 | scoreboard |
| signal | 32 | Mono 500 | annunciator value |

Thai body line-height 1.6 (loops need air), labels 1.2. `text-wrap: balance` on headings.
Floors match [[CR-007-frostline-deck-refresh|CR-007]] WP-3 (micro 8.5→10, caption 9→11). Hierarchy comes from
size+weight steps ≥1.2 ratio, not from color.

## H. Color / token system (v3, OKLCH)

Keep every hue identity (void/ice/lime unchanged to the eye); re-express in OKLCH with
`--g-*` aliases so no component breaks ([[CR-007-frostline-deck-refresh|CR-007]] WP-2). New/changed roles only:

```css
:root {
  /* materials */
  --g-void:        oklch(0.13 0.01 265);           /* ≈#06070A */
  --g-instrument:  oklch(0.17 0.015 262);          /* NEW: matte sector fill (≈#0B0E16) */
  --g-hairline:    oklch(0.75 0.05 250 / 0.10);    /* sector/inner lines */
  /* console glass keeps --g-glass-a/b/rim; ONLY shell + FAB + pop layers may blur */

  /* accents (unchanged hues, restated) */
  --g-ice-500:  oklch(0.85 0.09 240);   /* brand, nav, focus, selection */
  --g-lime-500: oklch(0.87 0.19 128);   /* ON-AIR / alarm ONLY */

  /* semantic + economy */
  --g-safe / --g-ok / --g-warn / --g-danger  (as v2)
  --g-coin: oklch(0.82 0.10 85);        /* NEW: economy gold — never a status color */

  /* text (contrast-fixed) */
  --g-text:     oklch(0.96 0.01 250);
  --g-text-dim: oklch(0.78 0.03 250);   /* raised until ≥4.5:1 on --g-instrument */
  --g-text-mute:oklch(0.60 0.03 250);   /* decorative only, never information */
}
.gq-cinematic { --blur-console: 30px; --blur-l1: 78px; }
.gq-balanced  { --blur-console: 16px; --blur-l1: 36px; }
.gq-eco       { /* no backdrop-filter anywhere; pre-baked gradients */ }
```

Rules: lime appears only as tally-on-air, annunciator alarm, and LIVE badge. Ice carries
brand/interaction. Semantics never used decoratively. One blue — the [[CR-003-account-phase1-wallet-billing|CR-003]] navy/cyan
inline palette is migrated to these tokens and deleted. Contrast measured per tier before
merge ([[CR-007-frostline-deck-refresh|CR-007]] acceptance #3 stands).

## I. Motion / interaction system

Broadcast grammar; state, never decoration (product register):

| event | motion | time |
| --- | --- | --- |
| page switch | hard cut + 90 ms opacity settle (no slide) | 90 ms |
| tally change | instant color step, then glow decay | 0 + 600 ms |
| bar / momentum fill | ease-out | 300 ms |
| belief-revision ink | strike draws L→R, correction fades in | 240 + 160 ms |
| palette / menus | fade + 0.98→1 scale, ease-out-quart | 140 ms |
| hover/focus | color/fill only | 120 ms |
| skeleton | shimmer 1.2 s loop, appears after 200 ms delay | — |
| ambient streak | deck only, `gq-cinematic` only | 14 s |

Digits never tween (sample-and-hold, tabular). Nothing animates continuously in live phase
except the alarm glow decay. `prefers-reduced-motion`: everything → instant or ≤80 ms
crossfade; ambient/ink-draw disabled (strike appears complete). During native window drag,
the existing `.is-dragging` shadow/filter kill stays law.

## J. Desktop behavior rules

- **Lifecycle**: close = tray (existing); tray icon carries a tally (idle/live/alarm dot).
  Never steal focus: match end doesn't raise the window — it arms the debrief and marks tray.
- **Glance mode ("house lights")**: when GSI is live and the window is unfocused for >10 s,
  interior dims 12% while score/momentum/annunciators lift one type step — content-only,
  zero geometry. Any input restores instantly.
- **Resizable panels — the honest version**: the shell is a fixed instrument (Boss ruling);
  what resizes is (a) the window (stage scale-to-fit), (b) density mode, (c) the future
  **Gadget window** (separate always-on-top `420×180` mini-annunciator: D–G + volume +
  GSI, from [[CR-007-frostline-deck-refresh|CR-007]] §4's noted idea) — that is the piece users actually want to keep small
  on top of other work.
- **Context menus** everywhere data lives (§F list); Shift+F10 / Menu key opens them from
  keyboard focus.
- **Inspector** = in-panel slide-over (§F.8), never a shell change, never a modal.
- **Drag**: topbar/void = window drag (existing guards stay); pack import = drop zone on
  Packs with full-seat dashed target; layout editor drag unchanged.
- **Multi-window/DPI**: remember bounds per monitor; Tauri scale factor respected; crisp-
  text snap (§N) for fractional scales.

## K. Empty / loading / error / success states

- **Empty teaches** (standby *is* the empty state): every seat's standby content names the
  action that fills it — e.g. History: "ยังไม่มีแมตช์ — เล่นกับ Maiden หนึ่งเกมแล้วกลับมาดูสรุปที่นี่".
- **Loading**: in-seat skeleton (shape of the real content), 200 ms appearance delay; never
  a centered spinner; OpenDota fetches show skeleton whiskers.
- **Error**: inline in the owning seat (danger hairline + Thai sentence + retry verb).
  Global banner only for engine-offline. **GSI offline is not an error** — it is standby.
- **Success**: quiet — tally blink + toast for user actions ("เปิดใช้แพ็กแล้ว"); no confetti,
  no full-screen states.
- **Long-running jobs** (pack import/validation, OAuth browser wait, updater download,
  OpenDota sync): a **job chip** docks in the topbar (label + thin progress + cancel where
  possible); origin surface shows the same progress inline; Maiden Line lists active jobs.
  Failure keeps the chip with a danger dot until acknowledged.

## L. Keyboard shortcut model

In-app (global hotkeys Ctrl+Alt+S / Alt+↑↓ / Alt+M unchanged):

| key | action |
| --- | --- |
| `Ctrl+K` | Maiden Line palette |
| `Ctrl+1..8` | pages in rail order |
| `Ctrl+Tab / Ctrl+Shift+Tab` | cycle pages |
| `F6 / Shift+F6` | cycle seat focus within a page |
| `↑↓ / Enter` | row navigation / open in lists |
| `Space` | preview (pack clip, announcer event) |
| `Ctrl+D` | density toggle |
| `Esc` | close palette/menu/inspector, then nothing (never quits) |
| `Shift+F10` | context menu at focus |
| `?` (`Ctrl+/`) | shortcut sheet overlay |
| `F2` | rename (overlay profile, pack) |

Every palette entry displays its binding; the sheet is generated from one registry
(single source, no drift).

## M. Command palette — "Maiden Line"

- **Invocation**: Ctrl+K; floats top-center over the stage (560 px, max 7 rows), console-
  glass material — one of the few blur-permitted surfaces.
- **Grammar**: verb-first, bilingual match (typing "voice", "เสียง", or "pack" all hit
  "เปลี่ยน voice pack…"). Sections: Actions · Pages · Packs · Jobs · Settings.
- **Phase-aware ranking**: after a match ends, "เปิด debrief" ranks first; in standby,
  "ติดตั้ง GSI config" and "ทดสอบเสียง" lead.
- **Destructive entries** (quit, uninstall pack, clear logs): first Enter arms the row
  (turns danger, label becomes "ยืนยัน — <verb>"), second Enter executes. No modal.
- **Persona, restrained**: placeholder rotates Maiden lines ("ให้ช่วยอะไรดีคะ?"); results stay
  strictly functional. No chat input, no free-text AI — this is a command line, not a chatbot.

## N. Responsive resizing behavior

- Stage scale `s = min(w/1420, h/760, 1.0)` stays (downscale-only, Boss-tuned). Letterbox
  void fills the remainder; ambient only in cinematic tier.
- **Crisp text** (opt-in, WP-2): snap s to 1.0/0.875/0.75 with letterbox — no fractional
  rim blur.
- **Window minimum** 710×398 (s=0.5 floor); below-threshold content (micro type at s<0.75)
  is why the floors in §G exist.
- Maximize/fullscreen: stage centers at 1.0, void breathes; no stretch, no reflow.
- The Gadget window (§J) is the answer for "tiny always-visible G-Maiden", not shrinking
  the deck below legibility.

## O. Implementation plan (on the current codebase)

Phases are independently shippable, batch to `main` untagged (release policy stands).
Every phase gates on: `tsc --noEmit`, eslint, vitest, contrast check, and
[`tests/perf/src/bin/perf_cpu_tree.rs`](file:///g:/G-Maiden/tests/perf/src/bin/perf_cpu_tree.rs) before/after (eco must *reduce*, cinematic must not
regress — [[CR-007-frostline-deck-refresh|CR-007]] acceptance #2).

1. **P1 Materials & tokens** (~2–3 d): OKLCH `:root` v3 + aliases in `styles.css`; interior
   de-glass (sector styles → `--g-instrument` matte); Plex bundling + type floors; icon
   cleanup (emoji → `DeckIcons` strokes); "VOLUM"→"VOLUME"; ping pill → feed-age readout.
2. **P2 Honest booth** (~3–5 d): agent card → on-air console (new [`live/utterances.ts`](file:///g:/G-Maiden/src/src/live/utterances.ts)
   builder + tests, fed by existing advice/gank/announcer events); threshold ticks +
   baseline whiskers in stats/annunciators (extend `buildSignals`/`buildBaselines`);
   tally dots; Alert Deck real feed polish.
3. **P3 Time** (~3–4 d): [`live/phase.ts`](file:///g:/G-Maiden/src/src/live/phase.ts) state machine + per-seat phase content + debrief
   composition; phase chip + tray tally.
4. **P4 Hands** (~3–4 d): [`MaidenLine.tsx`](file:///g:/G-Maiden/src/src/MaidenLine.tsx), shortcut registry + sheet, [`ContextMenu.tsx`](file:///g:/G-Maiden/src/src/ContextMenu.tsx),
   F6 seat focus, inspector slide-over primitive.
5. **P5 Economy & IA** (~2–3 d): rail swap (Companion→Account), Packs page merge
   (VoiceInventory + StorePage + InventoryTab), Account hosts WalletTab/LedgerTab;
   migrate CR-003 inline navy/cyan to tokens (delete the second palette).
6. **P6 Comfort** (~2 d): density modes, quality-tier switcher UI, crisp-text snap,
   job chips, glance mode.
7. **P7 Docs sync**: 02/03/04/05 + new 09 (booth model), README → v3.0.0-draft
   (governance §5).

## P. Files/components to change first

1. [`src/src/styles.css`](file:///g:/G-Maiden/src/src/styles.css) — token block v3, materials split, kill duplicate palettes (§H).
2. [`src/src/CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) — seat headers + tally, on-air console mount, feed-age pill.
3. [`src/src/companion.ts`](file:///g:/G-Maiden/src/src/companion.ts) + [`src/src/live/`](file:///g:/G-Maiden/src/src/live/) — [`phase.ts`](file:///g:/G-Maiden/src/src/live/phase.ts), [`utterances.ts`](file:///g:/G-Maiden/src/src/live/utterances.ts), whisker fields
   in [`buildSignals`](file:///g:/G-Maiden/src/src/live/buildSignals.ts)/[`buildBaselines`](file:///g:/G-Maiden/src/src/live/buildBaselines.ts) (pure builders + vitest, matching house pattern).
4. [`src/src/CompanionPages.tsx`](file:///g:/G-Maiden/src/src/CompanionPages.tsx) — de-bento to seat/rundown grammar; Companion page dissolves.
5. [`src/src/DeckIcons.tsx`](file:///g:/G-Maiden/src/src/DeckIcons.tsx) — complete the stroke set (companion/history/account glyphs).
6. New: [`src/src/MaidenLine.tsx`](file:///g:/G-Maiden/src/src/MaidenLine.tsx), [`src/src/ContextMenu.tsx`](file:///g:/G-Maiden/src/src/ContextMenu.tsx), [`src/src/shortcuts.ts`](file:///g:/G-Maiden/src/src/shortcuts.ts).
7. [`src/src/VoicePacksPage.tsx`](file:///g:/G-Maiden/src/src/VoicePacksPage.tsx) + [`StorePage.tsx`](file:///g:/G-Maiden/src/src/StorePage.tsx) + [`InventoryTab.tsx`](file:///g:/G-Maiden/src/src/InventoryTab.tsx) — Packs merge.
8. [`src/src/AccountPage.tsx`](file:///g:/G-Maiden/src/src/AccountPage.tsx) + [`WalletTab.tsx`](file:///g:/G-Maiden/src/src/WalletTab.tsx) + [`LedgerTab.tsx`](file:///g:/G-Maiden/src/src/LedgerTab.tsx) — economy home + re-token.
9. `docs/design-system/*` — sync per governance.
Untouched: overlay window ([`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) overlay tree, [`FullOverlay.tsx`](file:///g:/G-Maiden/src/src/overlay/FullOverlay.tsx)), Rust critical path,
shell geometry constants.

## Q. Final anti-generic audit (brutal pass)

| Risk | Verdict |
| --- | --- |
| Purple/blue AI gradients | Absent. One blue (ice), one signal (lime), OKLCH-disciplined. |
| Left sidebar + card grid | Rail survives *because it is the locked shell's notch-integrated FAB* (earned, not default). Card grids survive only in Packs, where the item is literally a banner image. Domain-page bento is removed (§F/§E). |
| Meaningless glassmorphism | Resolved structurally: blur only on shell/FAB/pop layers; interiors matte. Glass now encodes depth ("floats over the game"), with quality tiers for the NFR. |
| Fake analytics charts | None. Every bar/whisker maps to a real builder value; no-data = `—` + empty track. Hardcoded Vision 40% and Roshan strings die in P2. |
| Marketing hero sections | The agent-art void (the last hero-section survivor) becomes the utterance ledger. The old character-hero mood board is formally retired (§1.5). |
| Mobile-first spacing | Fixed-px authored stage, density modes, desktop hit targets. |
| AI assistant bubble UI | Maiden Line is a command line; utterances are a broadcast log, not a chat thread. No bubbles, no typing indicator. |
| Dribbble decoration | Motion budget is 8 rows long and state-bound; ambient exists only in cinematic tier on the deck. |
| Linear/Notion/Raycast cloning | The palette is table-stakes plumbing, but the identity carriers — Subtract silhouette, tally logic, annunciators, revision ink, phase-driven seats — exist in none of those products. |
| Remaining honest debts | Segoe→Plex must be FPS-measured before touching the overlay font (07 contract). Build Advisor stays visibly "scaffold" until its data is real — an honest label beats a fake screen. Icon rail + palette are conventional by choice (product register: earned familiarity where the user is mid-task). |

---

*Relationship to [[CR-007-frostline-deck-refresh|CR-007]]: this direction adopts WP-1 (done), WP-2/3/4 as Phases 1–2,
extends WP-5 as Phase 3, WP-6 as Phase 4, and adds Phases 5–6 (IA/economy + comfort)
that CR-007 scoped out. If accepted, CR-007's open WPs close into this document.*

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| — | 2026-07-19 | symbol-link coverage extension (G1.5) |
