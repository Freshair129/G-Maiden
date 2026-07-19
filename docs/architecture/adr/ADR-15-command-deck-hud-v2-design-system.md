---
id: ADR-15
title: "Command Deck HUD v2 — Subtract-glass shell + design-system SSOT"
status: "accepted (design) · pending implementation"
date: "2026-07-05"
deciders: ["Boss (approver)", "Opus (design lead)"]
supersedes_partial: "docs/architecture/design-system.md (Iceglass 0.1.0b — shell layout only)"
relates_to: ["ADR-14 (GID/account)", "CR-004 (voice+browser)", "CR-005 (landing/auth/social)"]
language: "th/en"
---

> **Historical decision record — not implementation truth (2026-07-19):** ข้อความ "canvas 1280×720"
> และสถานะ "ยังไม่ migrate token" ในเอกสารนี้ถูก supersede แล้ว — ของจริงที่ ship: outer stage
> **1420×760** + `--g-*` tokens ใน `src/src/CommandDeck.tsx`/`styles.css`. งาน UI ปัจจุบันใช้
> [[03-layout]] + [[02-tokens]] เป็น SSOT.
# ADR-15 — Command Deck HUD v2 (Subtract-glass shell) + design-system SSOT

## Context

หน้า control ของ G-Maiden (Command Deck) เดิมเป็น shell "สี่เหลี่ยมเต็ม + nav rail ตัน"
ตาม Iceglass candidate ([[design-system|docs/architecture/design-system.md]], 0.1.0b) ระหว่าง session 2026-07-05
Boss ขับการ redesign ผ่าน Figma reference (Urban District Planner wireframe) จนได้ทิศทางใหม่:

- Shell เป็น **glass panel แผ่นเดียวที่ถูก Boolean-Subtract** ให้เว้า 3 จุด (topbar / sidebar / signal cards)
- FAB (topbar, sidebar, D–G signal cards) **ลอยในช่องเว้า** นอก panel → รู้สึก borderless / HUD
- `backdrop-filter` blur ให้เห็น ambient BG ทะลุ panel (glassmorphism จริง ไม่ใช่ fill ทึบ)
- **P1–P5 = anchor points** สื่อสารตำแหน่งกับ agent (ไม่ใช่ nav tabs); nav จริงอยู่ที่ sidebar FAB
- Accent เพิ่ม **lime `#A3E635`** (signal/tactical) คู่กับ ice เดิม (brand/nav)

ปัญหาเดิม: token/layout กระจัดกระจาย (โค้ด `styles.css` vs Iceglass doc vs prototype) ไม่มี SSOT
และเอกสารเดียวโตเกินจนแก้ยาก

## Decision

1. **รับ Command Deck HUD v2 (Subtract-glass shell)** เป็นทิศทาง shell ใหม่ — supersede เฉพาะ
   *shell layout* ของ Iceglass (palette/persona/principles เดิมยังใช้ต่อ)
2. **ตั้ง `docs/design-system/` เป็น SSOT** — hub 1 ไฟล์ + แยกหัวข้อ (foundations/tokens/layout/
   components/sitemap/stack) + assets (annotated SVG + glass prototype). ค่าทุกอย่างแก้ที่ไฟล์เดียว
3. **Token = ice (primary) + lime (signal accent)**; นิยาม `--g-*` namespace + migration map จากค่าเดิม
4. **Geometry เป็น px บน canvas 1280×720** + Subtract path เดียว (ใช้ทั้ง clip-path และ stroke);
   window ไม่ resize อิสระ → preset ใน Settings, ไม่มี scrollbar (fit-to-grid)
5. **New surfaces ต้อง additive** — [[CR-004-voice-command-browser|CR-004]]/[[CR-005-landing-auth-social|CR-005]] ห้ามเปลี่ยน deck layout; ถ้าจำเป็นต้องขอ approve เป็นราย ๆ

## Consequences

**บวก**
- แก้ token/layout ที่เดียว, prototype = spec 1:1, เอกสารแตกไฟล์อ่านง่าย
- borderless HUD ตรง persona "ลอยเหนือเกม"; lime แยก attention ออกจาก brand ชัด

**ต้องระวัง**
- `backdrop-filter` มีต้นทุน GPU → **overlay (Combat HUD) ต้องจำกัด blur + วัด FPS drop ≤3%** (NFR gate)
- ยังไม่ migrate เข้าโค้ดจริง (`styles.css` ยังใช้ token เก่า) — เป็น **draft** จนกว่าจะ port ทีละ component
- Subtract shape ทำด้วย `clip-path: url()` (SVG fill เบลอ BG ไม่ได้) — ผูกกับ path; ขยับ FAB = ขยับ notch

## Alternatives considered

- **คง Iceglass full-rectangle shell** — ปลอดภัยกว่าแต่ไม่ได้ HUD feel ที่ Boss ต้องการ; ปฏิเสธ
- **เอกสารเดียวใหญ่ (ต่อ Iceglass เดิม)** — โตเกิน, แก้ยาก, ไม่มี SSOT ชัด; ปฏิเสธ → แตกไฟล์แทน
- **lime เป็น accent เดียว (ทิ้ง ice)** — เสียแบรนด์ ice + ทั้งจอเขียว; ปฏิเสธ → 2 accent คนละ role

## Follow-ups

- Migrate `styles.css` → `--g-*` tokens ทีละ component (topbar → sidebar → dashboard → pages)
- Regenerate `assets/*.svg` เมื่อ geometry เปลี่ยน
- ตัดสิน [[CR-005-landing-auth-social|CR-005]] open questions (auth provider, landing location) ก่อน implement

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| +banner | 2026-07-19 | historical-status banner: geometry/migration statements superseded โดยโค้ดจริง (audit 2026-07-19) |
| +link-fix | 2026-07-19 | link/metadata sweep (G15-T2): fixed unresolved wikilink slug `[[architecture/design-system]]` → `[[design-system]]` |
