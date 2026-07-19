---
version: "0.1.0b"
created_at: "2026-06-23T22:51:10+07:00,ATHER,pending"
last_update: "2026-07-19T00:00:00+07:00,Claude"
status: "candidate"
superseded_by: null
attributes:
  domain: "ui-ux"
  scope: "G-Maiden Control Dashboard + Overlay"
  language: "th"
---

> **Superseded for current Command Deck implementation (2026-07-19).** สำหรับ tokens อ่าน
> [[02-tokens]] · geometry อ่าน [[03-layout]] · Deck components อ่าน [[04-components]] · IA อ่าน
> [[05-sitemap-ia]]. เอกสารนี้เก็บไว้เพื่อ provenance ของ Iceglass และหลักคิดยุค Overlay เท่านั้น
> — โดยเฉพาะ **ห้าม**ใช้ inline `C` palette เป็นจุดตั้งต้นของ Deck (R3: `C` เป็น Overlay-only).
# G-Maiden Iceglass Design System

> **⚠️ ต่อยอดแล้วที่ `docs/design-system/` (SSOT v2 "Command Deck HUD").** ไฟล์นี้เป็นต้นทาง Iceglass
> (palette/persona/principles ยังใช้ได้) แต่ shell layout ถูก supersede ด้วย Subtract-glass shell —
> token/layout/component ล่าสุดยึด [[design-system/README|docs/design-system/README.md]]

> Candidate design system for the G-Maiden control dashboard and in-game overlay.
> Source intent: PRD/SRS require a premium dark dashboard and transparent ice-glass overlay.
> Visual direction: adapt the supplied dark premium game-launcher reference into a Maiden-specific command deck, not a direct Red Dead/red-warm clone.

---

## 1. Purpose

เอกสารนี้กำหนด UX/UI system กลางสำหรับ G-Maiden เพื่อให้หน้า Control, Overlay, Settings, Onboarding, และ future web/stream views ใช้ภาษาเดียวกัน:

- Control dashboard = **Maiden Command Deck**: หนักแน่น, premium, card-based, เหมือน game companion hub
- In-game overlay = **Maiden Combat HUD**: เบา, โปร่ง, peripheral-first, ไม่แย่งสมาธิจาก Dota 2
- Design tokens ต้องต่อยอดจาก implementation ปัจจุบันใน [`src/src/App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) ([`C`](file:///g:/G-Maiden/src/src/App.tsx#L187), [`panel(op)`](file:///g:/G-Maiden/src/src/App.tsx#L276), glassmorphism)
- ทุก UI decision ต้องไม่ละเมิด NFR: FPS drop <=3%, CPU <=2.5%, RAM <=400MB, และไม่บัง minimap/skill bar/stats panel

## 2. Source References

### Parent docs

- [[product-requirements|docs/product/product-requirements.md]]
- [[software-requirements-specification|docs/product/software-requirements-specification.md]] โดยเฉพาะ SRS §3.5 และ §4.1
- [[engineering-spec|docs/architecture/engineering-spec.md]] §2.5 และ §7
- [[technical-design-document|docs/architecture/technical-design-document.md]] §7

### Peer docs

- [[FEAT-G-SENSORY|docs/features/FEAT-G-SENSORY.md]]
- [[FEAT-G-SIGNAL|docs/features/FEAT-G-SIGNAL.md]]
- [[FEAT-G-PERSONA|docs/features/FEAT-G-PERSONA.md]]
- [[2026-06-23-audit-gsi-setup-overlay-settings-th|docs/audits/2026-06-23-audit-gsi-setup-overlay-settings-th.md]]

### Visual reference interpretation

Reference pack: `docs/architecture/assets/design-references/`.

ภาพอ้างอิงที่ผู้ใช้ให้มีคุณลักษณะสำคัญ:

- Shell แบบ rounded desktop app, dark premium, game launcher feeling
- Left navigation rail, right social/status rail, large hero card, compact activity cards
- Strong media card, rich shadows, large radius, high contrast call-to-action
- Statistics ring card and download/progress strip

G-Maiden ต้องแปลงสิ่งเหล่านี้เป็น:

- ice / arcane / tactical companion ไม่ใช่ western red theme
- hero media card เป็น current match / current hero / danger context
- statistics ring เป็น resource + safety + signal confidence dashboard
- right rail เป็น persona, voice, party, stream, and local privacy indicators
- metrics/HUD references (`ref-11` to `ref-16`) ให้ใช้กับ resource cards, signal confidence, activity stats, and compact overlay widgets.
- agent character creator references (`ref-17` to `ref-19`) ให้ใช้กับ future G-Persona / Maiden avatar customization screens.
- deck/storefront/hero-select references (`ref-20` to `ref-25`) ให้ใช้กับ future profile hub, agent roster, persona selection, and premium commerce-style dashboard shells.

## 3. Product Surfaces

| Surface | Goal | Visual density | Interaction |
| --- | --- | --- | --- |
| Control Dashboard | ตั้งค่า, ดูสถานะ, preview overlay, update, inspect modules | Medium-high | Full controls |
| In-game Overlay | เตือนภัยและให้ข้อมูลเฉพาะที่ต้องใช้ตอนเล่น | Low | Mostly passive, click-through |
| Onboarding | ทำให้ GSI พร้อมใช้งานเร็ว | Low-medium | Guided steps |
| Post-match / Coach | Review decisions and improvement areas | Medium | Report + drilldown |
| Stream Mode | Broadcast-safe assistant surface | Medium | Mask sensitive data |

Rule: ห้ามเอา full dashboard chrome ไปวางใน overlay ระหว่างเล่นเกมจริง.

## 4. UX Principles

1. **Combat-first**
   - ตอนเล่นเกม ผู้ใช้ควรรับรู้ danger state ได้ใน 1 glance.
   - UI ที่ไม่เกี่ยวกับการรอดชีวิตหรือ action ถัดไปต้องลด priority.

2. **Peripheral-first**
   - Overlay ต้องอ่านได้จากหางตา: สี, position, rhythm สำคัญกว่าข้อความยาว.
   - Passive stats ปิดเป็นค่าเริ่มต้นถูกต้องแล้ว เพราะ Dota มี UI หลักอยู่แล้ว.

3. **Trustworthy status**
   - แยก `Config installed` ออกจาก `Live data connected`.
   - ห้ามใช้ copy ที่ทำให้ผู้ใช้เข้าใจว่า setup สำเร็จทั้งที่ยังไม่มี GSI post จริง.

4. **Glass with restraint**
   - ใช้ glassmorphism เป็น surface language แต่ไม่ใส่ blur/glow หนักจนชน FPS budget.
   - Dashboard ใช้ effect ได้มากกว่า overlay.

5. **Maiden is gentle, not noisy**
   - Visual tone ต้องนุ่ม ฉลาด และ confident.
   - Danger state ชัดได้ แต่ไม่ควร panic ตลอดเวลา.

6. **Privacy is visible**
   - Local-only, no-egress, stream masking, and memory controls ต้องมีสถานะที่มองเห็นได้.

## 5. Design Tokens

### 5.1 Color

Tokens must start from current implementation and can be promoted into a shared token module later.

| Token | Value | Usage |
| --- | --- | --- |
| `bg.base` | `#08090c` | App background |
| `bg.deck` | `#12090b` | Optional dashboard depth layer only |
| `surface.panel` | `rgba(18,20,28,0.72)` | Default glass panel |
| `surface.panelStrong` | `rgba(18,20,28,0.86)` | Dashboard cards / modal body |
| `surface.modal` | `rgba(18,20,28,0.94)` | Blocking dialog |
| `brand.ice` | `#8fd4ff` | Primary Maiden accent |
| `brand.iceDeep` | `#3f7fb0` | Gem gradient / secondary accent |
| `text.primary` | `#e7eef6` | Main text |
| `text.muted` | `#8794a6` | Secondary text |
| `state.ok` | `#5be3a7` | Connected / safe / pass |
| `state.warn` | `#ffcf6b` | Missing / attention |
| `state.bad` | `#ff7b85` | Danger / HP critical |
| `line.ice` | `rgba(143,212,255,0.16)` | Borders / separators |
| `line.warn` | `rgba(255,207,107,0.35)` | Warning border |
| `line.bad` | `rgba(255,123,133,0.35)` | Danger border |

Use red/crimson only for danger, destructive actions, or critical contrast. The reference image's warm red mood should become a limited alert layer, not the default brand palette.

### 5.2 Surfaces

| Surface | Background | Border | Blur | Shadow |
| --- | --- | --- | --- | --- |
| Dashboard shell | `rgba(12,8,12,0.96)` | none | none | `0 24px 80px rgba(0,0,0,0.45)` |
| Card | `surface.panelStrong` | `line.ice` | `12-16px` | `0 10px 36px rgba(0,0,0,0.35)` |
| Overlay panel | `surface.panel` | `line.ice` | `10-14px`, governor may disable | `0 8px 40px rgba(0,0,0,0.45)` |
| Danger banner | `rgba(58,12,16,0.86)` | `rgba(255,123,133,0.6)` | `10px` | limited pulse |
| Warning banner | `rgba(18,20,28,0.82)` | `state.warn` | `12px` | amber glow |

### 5.3 Radius

| Token | Value | Usage |
| --- | --- | --- |
| `radius.control` | `8px` | Buttons, inputs |
| `radius.card` | `14px` | Current implementation panels |
| `radius.deckCard` | `20-24px` | Dashboard hero/activity cards |
| `radius.shell` | `32px` | App frame / command deck container |
| `radius.pill` | `999px` | Chips, toggles, avatars |

Overlay should stay closer to `12-14px` so it remains compact.

### 5.4 Typography

- Font family: `Segoe UI`, system-ui, sans-serif
- Dashboard title: `24-28px`, weight `700`
- Section title: `16-18px`, weight `700`
- Card title: `13-15px`, weight `700`
- Body: `12.5-14px`, weight `400-500`
- Micro label: `10-11px`, uppercase only for compact technical labels
- Thai UI copy must be tested for line height; use `1.45-1.6` for paragraphs.

### 5.5 Spacing

Base grid: `4px`.

| Token | Value |
| --- | --- |
| `space.xs` | `4px` |
| `space.sm` | `8px` |
| `space.md` | `12px` |
| `space.lg` | `16px` |
| `space.xl` | `24px` |
| `space.2xl` | `32px` |

Dashboard cards can use generous spacing. Overlay must keep vertical stack gap around `8px`.

## 6. Layout System

### 6.1 Maiden Command Deck

Desktop dashboard target:

```
┌──────────────────────────────────────────────────────────────┐
│ Left rail │ Header/Search/Status             │ Right rail     │
│           │ ┌ Hero Situation Card ┐ Modules  │ Persona/Party  │
│           │ └─────────────────────┘          │ Voice/Privacy  │
│           │ Activities / Alerts / Downloads  │                │
│           │ Resource + Signal Statistics     │                │
└──────────────────────────────────────────────────────────────┘
```

Recommended proportions for desktop:

- Shell max width: `1180-1280px`
- Left rail: `72-88px`
- Right rail: `72-96px`
- Main content: fluid grid
- Hero card: spans 2 columns
- Statistics card: 1 column, right side

Mobile/narrow screens:

- Left rail collapses to top/bottom navigation
- Right rail becomes drawer or hidden secondary panel
- Hero card stacks above module cards

### 6.2 Maiden Combat HUD

Overlay target:

```
top-center:    Gank / danger / revision banners
below banner:  optional advice panel
stats HUD:     opt-in only, compact row
debug layer:   only when cvDebug is enabled
```

Safe zone rules:

- Default top-center is safest.
- Avoid bottom-left minimap, bottom-center skill bar, bottom-right shop/items/stats.
- Custom position must eventually show a collision hint when near known Dota UI zones.
- Overlay must remain `pointer-events: none` except explicit control windows.

## 7. Component Contracts

### 7.1 Shell

`DeckShell`

- Rounded full-window container for dashboard mode.
- Contains left nav, main grid, right rail.
- Not used for transparent overlay window.

### 7.2 Navigation

`LeftRail`

- Icon-first navigation.
- Active state: soft ice or danger color depending on module state.
- Icons need tooltips; avoid text-heavy rail.

Suggested order:

1. Home
2. G-Signal
3. G-Sentry / CV
4. G-Master
5. G-Log / Coach
6. Settings

### 7.3 Status

`StatusChip`

- Must include icon/dot + label, not color only.
- Must distinguish setup and runtime:
  - `Config installed`
  - `Dota running`
  - `Live GSI connected`
  - `Overlay visible`
  - `Privacy local-only`

### 7.4 Hero Situation Card

Dashboard equivalent of the reference image's large game hero card.

Content:

- Current hero / match state / clock
- GSI status
- Current danger level
- Top Maiden line or latest advice
- Primary action: Preview overlay, Ask Maiden, Install/Fix GSI

States:

- No Dota detected
- Config installed but no live data
- In game, safe
- In game, warning
- Critical alert

### 7.5 Module Cards

Each G-Series module gets a compact card:

- G-Signal: danger threshold, last alert, latency
- G-Sentry: missing heroes, CV health
- G-Master: latest advice, auto-advice toggle
- G-Log: local logs, no-egress status
- Resource Governor: CPU/RAM/FPS budget

Do not introduce fake module data. Use "waiting" or "not connected" states when runtime data is absent.

> **Known exception (shipped):** the deck intentionally keeps a rich `MOCK` fallback
> (documented in `src/src/companion.ts`) so the command deck renders a full demo
> when there is no live source — e.g. plain browser / no Tauri, or panels with no
> live path yet. Live builders (`live/build*.ts`) merge over MOCK per-field; any
> field with no live source stays on MOCK rather than showing a waiting state.
> **`buildAdvisor` has no live path at all** and always renders MOCK (no structured
> G-Master build feed yet). This demo-fallback is deliberate, not the "fake module
> data" this rule forbids; the intent is that any field *with* a live source must
> flip to it (and its waiting/not-connected states) rather than show fabricated live data.

### 7.6 Activity Cards

Use for latest tactical events:

- Enemy missing
- Gank alert
- Gank clear / Belief Revision
- HP danger
- Advice shown
- Post-match insight

Cards should show time, module source, short text, severity, and optional confidence.

### 7.7 Statistics Ring

Use circular progress only for aggregate metrics:

- Signal safety score
- Latency budget use
- Resource budget health
- Match review completion

Do not use a ring for every number; keep it as a focal card.

### 7.8 Profile Rail

Right rail can show:

- Maiden voice/persona preset
- Active overlay profile
- Stream mode
- Privacy/local-only indicator
- Optional party/avatar list later

### 7.9 Overlay Alert Banner

Priority order:

1. G-Signal critical gank / HP danger
2. Belief Revision / gank clear
3. G-Master advice panel
4. Passive stats
5. Debug overlays

Critical banners can pulse. Non-critical panels should animate in once and then stay still.

### 7.10 Profile Save Dialog

Replace raw `prompt()` with a themed inline dialog or compact modal.

Requirements:

- Validate empty name.
- If name exists, show "Update existing profile?" confirmation.
- Keep keyboard interaction: Enter = save, Escape = cancel.
- No native browser prompt in polished dashboard.

## 8. Motion & Performance

Motion should feel "magical" but must obey the governor.

Allowed:

- 160-240ms card entrance
- 850-1100ms subtle alert pulse
- Progress/ring interpolation
- Hover lift on dashboard cards only

Avoid:

- Infinite heavy blur animations
- Layout-shifting hero cards
- Animated background particles in overlay
- Large CSS filters on every frame

Governor visual degradation levels:

| Level | Trigger | UI behavior |
| --- | --- | --- |
| Full | resource healthy | blur + soft shadows + animation |
| Reduced | CPU/FPS near budget | reduce animation, lower blur |
| Static | budget exceeded | no pulse except critical, blur off, static HUD |

## 9. Accessibility & Localization

- Never communicate state by color alone.
- Minimum body text target: `12.5px` dashboard, `13px` overlay warning.
- Buttons must have visible focus style.
- Icon-only controls need tooltip/aria label.
- Thai copy must avoid overly long single-line labels in narrow cards.
- Warning copy should be direct: "ระวังแก๊งค์", "ถอยก่อน", "GSI ยังไม่ส่งข้อมูล".

## 10. Implementation Boundaries

> **SHIPPED (2026-07-02):** The command-deck dashboard shell, the live-wire data
> path (CR-002 Phase 2a/2b), and the `App.tsx` / `CommandDeck.tsx` split have
> already shipped, merged at `170805b8`. `App.tsx` now owns the overlay window
> + window routing, and `CommandDeck.tsx` owns the control window. The
> "Not allowed until approval" list below and the task packet in Section 11
> are historical — treat `UI-1` through `UI-4` as done, not pending.
>
> **SHIPPED (2026-07-03, Phase 2c):** the remaining deck panels are now LIVE-wired
> too — telemetry footer, `weeklyReport`, `insights`, `history`, and
> `agentSector.status` merge live builders (`src/src/live/build{Telemetry,Weekly,Insights,History}.ts`)
> over MOCK. The voice-pack **overlay banner** (announcer bundle: the active pack's
> image renders on the overlay when an event fires, `packBanner` in `App.tsx` via
> the `announcer-banner` event) and **gpu-feeder telemetry** (GPU load/temp + VRAM
> in the deck footer, fed by the out-of-process `gpu-feeder` sidecar) also shipped.

### Allowed in Phase 1 (documentation only)

- Add this design system doc.
- Link it from doc index and G-Sensory feature doc.
- Prepare G-Orch execution plan.

### Not allowed until approval

- Refactor `src/src/App.tsx`.
- Move inline styles into new files.
- Add UI dependencies.
- Change app version.
- Update release changelog.
- Modify `orchestration/backlog.json` for execution.

### 10.1 Accounts / GID Surface (shipped, opt-in)

An optional, additive Google OAuth sign-in surface now exists in the control
window per **ADR-14**: a sign-in card, a GID display (cross-G-series identity,
format `G-[Gen][Payload][Checksum]`), and a linked-Steam/OpenDota profile chip
showing the player's public OpenDota profile + baselines. It is opt-in per
[[ADR-11-optin-data-contribution-flywheel|ADR-11]]; match/CV/G-Log data stays local, and the account layer stores only
identity + public data (email, public Steam ids, display name, GID). See
[[ADR-14-gid-account-identity|docs/architecture/adr/ADR-14-gid-account-identity.md]].

## 11. G-Orch Execution Plan

After this document is approved, implement through G-Orch as a scoped, dependency-gated wave. Do not dispatch broad repo-wide UI work.

> **SHIPPED:** `UI-1` through `UI-4` (token mapping, command deck shell,
> profile dialog, Combat HUD preservation) are done — see the Section 10
> status note above. This packet is kept as historical record.

### Proposed task packet

These tasks are proposed only; add to `orchestration/backlog.json` after approval.

| ID | Type | Role | Title | Deps | Acceptance |
| --- | --- | --- | --- | --- | --- |
| `UXD-1` | `docs` | worker | Promote Iceglass Design System references | none | Doc index and G-Sensory point to this spec |
| `UI-1` | `design` | architect | Map current `App.tsx` styles to tokens | `UXD-1` | Token map covers colors, panels, alert states, spacing |
| `UI-2` | `code` | coder | Implement Maiden Command Deck dashboard shell | `UI-1` | Control dashboard matches design system; settings still work |
| `UI-3` | `code` | coder | Replace profile `prompt()` with themed dialog | `UI-2` | Empty/duplicate names handled without native prompt |
| `UI-4` | `code` | coder | Preserve Combat HUD safety after dashboard redesign | `UI-2` | Overlay remains click-through, compact, not dashboard chrome |
| `UI-5` | `test` | coder + reviewer | Verify TS, overlay preview, and visual safety | `UI-3`,`UI-4` | `npx tsc --noEmit` passes and manual checklist complete |

### Scoped docs for worker prompts

Use only these docs unless a worker reports `BLOCKED:`:

- `docs/architecture/design-system.md`
- [[FEAT-G-SENSORY|docs/features/FEAT-G-SENSORY.md]]
- [[software-requirements-specification|docs/product/software-requirements-specification.md]]
- [[engineering-spec|docs/architecture/engineering-spec.md]]
- [[technical-design-document|docs/architecture/technical-design-document.md]]
- [[2026-06-23-audit-gsi-setup-overlay-settings-th|docs/audits/2026-06-23-audit-gsi-setup-overlay-settings-th.md]]

### Scope excludes

- Rust critical path
- GSI parser
- CV detector
- Audio/TTS
- Release version bump
- Installer/signing workflow
- Network/cloud changes

### Verification gates

- `npx tsc --noEmit` from `src/`
- Overlay preview still does not fake real GSI status
- GSI setup status separates installed vs live data
- Overlay remains transparent/click-through
- No new network egress
- No app version bump unless user explicitly asks for release

## 12. Acceptance Criteria

- [ ] Design tokens cover current app colors and required future dashboard states.
- [ ] Dashboard layout maps the supplied reference into G-Maiden-specific modules.
- [ ] Overlay rules explicitly prevent dashboard chrome from entering in-game HUD.
- [ ] Status language distinguishes setup vs live runtime.
- [ ] Orchestrator execution packet is ready for later implementation.
- [ ] G-Sensory feature doc references this design system.
- [ ] Documentation index references this design system.

---

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---------|------|--------|---------|-------------|-------|
| 0.1.0b | 2026-06-23 | candidate | Initial Iceglass design system based on PRD/SRS, current App.tsx tokens, G-Sensory constraints, and user-supplied dashboard reference. | pending | ATHER |

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| +banner | 2026-07-19 | superseded banner สำหรับงาน Deck (tokens/layout/components/IA → design-system hub) — audit 2026-07-19 |
