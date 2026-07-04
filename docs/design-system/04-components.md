---
version: "2.0.0-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-05T00:00:00+07:00,Opus"
status: "draft"
attributes:
  domain: "ui-ux"
  scope: "component catalog"
  language: "th/en"
---

# 04 — Components

> แต่ละ component ระบุ: **anatomy · dimension · states · tokens** — ค่าอ้างอิงไฟล์ 02/03
> component ที่มีในโค้ดแล้วระบุไฟล์ต้นทาง (`src/src/…`)

## Index

Shell: [Topbar FAB](#1-topbar-fab-a) · [Profile badge](#2-profile-badge) · [Sidebar FAB](#3-sidebar-fab-i) · [Anchor rail](#4-anchor-rail-p1p5)
Data: [Score header](#5-score-header) · [Stat cell](#6-stat-cell) · [Hero slot](#7-hero-slot) · [Minimap](#8-minimap)
Companion: [Agent card](#9-agent-card-b) · [Activity log](#10-activity-log-c) · [G-Signal card](#11-g-signal-card-defg)
Primitives: [Chip/Badge](#12-chip--badge) · [Button](#13-button)

---

## 1. Topbar FAB (A)
Code: `src/src/CommandDeck.tsx` (`.deck-topbar` → migrate to `.topbar-fab`)

- **Anatomy:** logo (ซ้าย) · spacer · profile badge · window controls (─ □ ✕)
- **Dimension:** 432 × 50, radius 14, padding `0 6 0 16`
- **Tokens:** `--g-fab`, `--g-fab-rim`, `--g-blur-fab`, `--g-shadow-fab`
- **States:** default; drag region = พื้นที่ว่าง (`data-tauri-drag-region`), controls = `no-drag`
- **Note:** ลอยในช่องเว้าขวาบน ไม่ยืดเต็มความกว้าง

## 2. Profile badge
Code: `src/src/CommandDeck.tsx` (`.profile-badge` + `.profile-dropdown`)

- **Anatomy:** avatar (อักษรแรกของ GID name) · name + sub-label · caret ▾
- **Dimension:** avatar 28×28 (r=8), badge padding `3 8 3 3`, dropdown min-w 200
- **States:** default · hover (rim เข้ม) · open (caret หมุน 180°, dropdown slide-in `--g-t-state`)
- **Dropdown items:** 👤 Account · 🎙 Voice · ⟨sep⟩ · ⚙ Settings — hover พื้น `--g-ice` 10%

## 3. Sidebar FAB (I)
- **Anatomy:** menu button (☰, lime) · nav icons (แนวตั้ง, กึ่งกลาง) · [close ✕ = FAB แยกด้านล่าง]
- **Dimension:** 64 × 306 (r=16); menu 40×40 (r=11); nav item 38×34 (r=9); close FAB 64×44
- **Tokens:** menu = `--g-lime-soft`/`--g-lime-line`/`--g-lime-500`; nav active = `--g-ice` 14%
- **States:** nav item default/hover/active; close hover = `--g-danger` tint
- **Note:** nav เป็น icon-only (ประหยัดพื้นที่ 64px) — label ผ่าน `title`/tooltip

## 4. Anchor rail (P1–P5)
- **สำคัญ:** P1–P5 **ไม่ใช่ nav tabs** — เป็น **anchor points** สำหรับสื่อสารตำแหน่งกับ agent
  (เช่น "ระวังทางขวาบน" อ้าง anchor) — ดู sitemap ไฟล์ 05 §navigation
- **Dimension:** คอลัมน์ w=70, item padding `8 10`, radius 8
- **States:** default (dim) · hover · active (`--g-lime` bg 8% + text lime)

## 5. Score header
- **Anatomy:** GSI badge (จุด + สถานะ) · scoreboard (TEAM RADIANT — n — clock — n — TEAM DIRE)
- **Dimension:** 690 × 50
- **Tokens:** score num = 20/800 tabular; clock = mono 14; GSI dot = `--g-text-dim` (offline) / `--g-lime` (live)
- **States:** offline (dot dim, "GSI Offline") · live (dot lime + glow, clock เดิน)

## 6. Stat cell
- **Anatomy:** key row (index chip + label) · value (มี `–` คั่น us-vs-them)
- **Dimension:** flex 1 (≈112 กว้าง), h=40, radius 9
- **Tokens:** index chip = `--g-lime-soft`/`--g-lime-500` (12×12); value 13/700 tabular; `vs` dim
- **Set:** NW · GPM · XPM · K/D/A · CS/DN · PING (6 ตัว, index 1–6)

## 7. Hero slot
Code: ปัจจุบันอยู่ใน `src/src/Dashboard.tsx` (scoreboard) — migrate เป็น slot column

- **Anatomy:** slot id · (hero name/level) · state pill · KDA
- **Dimension:** flex ในคอลัมน์ 178px, min-h 42, radius 9
- **States (สี pill):** VISIBLE · LOW · MISSING · DEAD — encode ด้วยสี + label
- **ข้อจำกัด honest:** เกมตัวเอง GSI เห็นแค่ผู้เล่น local → อีก 9 ตัวได้แค่ CV identity/pos/state
  (KDA/items ซ่อน) — ดู CLAUDE.md "Own-game honest limit"

## 8. Minimap
- **Dimension:** center cell ของ battle zone (1fr × 290)
- **Tokens:** พื้น radial ice จาง + river hint (diagonal gradient); tag "7" = lime chip มุมซ้ายบน
- **States:** placeholder (Lite mode / capture ล้มเหลว) · live (CV overlay markers)

## 9. Agent card (B)
- **Anatomy:** header (eyebrow "เอเจนต์ผู้ช่วย" + "G-MAIDEN" + status pill) · character art · footer (persona/voice)
- **Dimension:** 404 × 326, radius 14; art area flex, radius 10; `--g-blur-tile` (อ่านง่ายกว่า panel)
- **Tokens:** status = ice pill; art = gradient ice/deep + chip "AI แทคติคัล" มุมล่างซ้าย
- **States:** Standby · Listening · Speaking (mid-sentence revision — persona) · Offline (SLM fallback)

## 10. Activity log (C)
Code: ปัจจุบันใน Live tab (`src/src/CompanionPages.tsx` `.split-logs`)

- **Anatomy:** section head (tag "C" + title) · grid 2 panel (ACTIVITY | EVENTS)
- **Dimension:** 624 × 266; log row = time (mono 9) + text (10.5)
- **Note:** แบ่ง sub-grid เพิ่มได้ตามเนื้อหา; ไม่มี scrollbar → เก่าเกินตัดทิ้ง/rotate

## 11. G-Signal card (D/E/F/G)
- **Anatomy:** label (uppercase) · value (30/800) · bar + ระดับ · tag มุมขวาบน
- **Dimension:** 2×2 ใน 512×254, gap 12, radius 16
- **Set:** D=Enemy Missing (ice) · E=Gank Risk (**lime hero card**) · F=Safe Push (safe) · G=Vision (warn)
- **Tokens:** bar fill = สี semantic ตามการ์ด; E เป็น lime ทึบ (hero) — attention สูงสุด
- **States:** value + bar width สะท้อน G-Signal สด; ≥85% gank = escalate (persona voice interrupt)

## 12. Chip / Badge
- **Index chip:** 12–18px วงกลม, `--g-lime-soft`, เลข lime 700
- **State pill:** rounded 4–999, พื้นสี semantic 8–16%, label uppercase
- **GSI/status pill:** `--g-r-pill`, จุดนำ + text dim

## 13. Button
- **win-btn:** 30–32px, radius 8, transparent → hover ice 10% (close → danger tint)
- **nav item / fab:** ดู §3
- **Primary (future):** `--g-ice-700` fill, text `--g-ice-100` — สงวนสำหรับ action หลัก (Update, Sign-in)
- **Focus:** ทุกปุ่มต้องมี ring `--g-ice-500` 2px เมื่อ keyboard focus
