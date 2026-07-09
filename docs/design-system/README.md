---
version: "2.1.0-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-09T00:00:00+07:00,Fable"
status: "draft"
supersedes: "docs/architecture/design-system.md (Iceglass v0.1.0b, candidate)"
attributes:
  domain: "ui-ux"
  scope: "G-Maiden Command Deck (control window) + Combat HUD (overlay)"
  language: "th/en"
---

# G-Maiden Design System — SSOT

> **Single source of truth** สำหรับภาษาออกแบบของ G-Maiden.
> เอกสารนี้คือ *hub* — ทุก token, layout, และ component มีนิยามอยู่ในไฟล์ย่อยตามหัวข้อ
> ค่าตัวเลข/สี/ระยะ ให้ยึด **ไฟล์ย่อย** เป็นหลักเสมอ อย่า hardcode ซ้ำในเอกสารอื่น ให้ลิงก์กลับมาที่นี่

เวอร์ชันนี้ (**v2 "Command Deck HUD"**) จับทิศทางใหม่: **frosted-glass Subtract panel** ที่เว้าให้ FAB
ลอยในช่อง (topbar / sidebar / signal cards) — ต่อยอดจาก Iceglass เดิม แต่เปลี่ยนโครง shell จาก
"สี่เหลี่ยมเต็ม + nav rail ตัน" มาเป็น "panel เว้าแหว่ง + FAB โปร่ง borderless"

---

## 1. โครงเอกสาร (อ่านตามลำดับนี้)

| # | ไฟล์ | เนื้อหา |
| --- | --- | --- |
| 00 | **README.md** (ไฟล์นี้) | SSOT hub, versioning, quick-ref, changelog |
| 01 | [`01-foundations.md`](01-foundations.md) | หลักการออกแบบ, persona-driven rules, visual language, product surfaces |
| 02 | [`02-tokens.md`](02-tokens.md) | design tokens ทั้งหมด — color / type / space / radius / elevation / blur / motion / z-index + `:root` block |
| 03 | [`03-layout.md`](03-layout.md) | layout concept, Subtract-shape geometry, SVG path, dimension ของทุก zone, responsive scaling |
| 04 | [`04-components.md`](04-components.md) | component catalog — anatomy, dimension, states, variants |
| 05 | [`05-sitemap-ia.md`](05-sitemap-ia.md) | information architecture, navigation model, page inventory, window model, user flow |
| 06 | [`06-stack.md`](06-stack.md) | tech stack + code map (token/component อยู่ไฟล์ไหนในโค้ดจริง) |
| 07 | [`07-combat-hud.md`](07-combat-hud.md) | Combat HUD (overlay) design contract — อิง implementation จริง |
| 08 | [`08-account-gid.md`](08-account-gid.md) | Login (Google OAuth) + GID + Steam link — UX design |
| — | [`assets/`](assets/) | wireframe/mockup ที่ระบุ dimension (SVG) + swatches |

### Mockup / snapshot (ระบุ dimension)

| ไฟล์ | สิ่งที่แสดง |
| --- | --- |
| [`assets/wireframe-annotated.svg`](assets/wireframe-annotated.svg) | layout เต็มพร้อมพิกัด/ขนาดทุก zone (บน canvas 1280×720) |
| [`assets/subtract-shape.svg`](assets/subtract-shape.svg) | รูปทรง panel เว้าแหว่ง + จุด notch (topbar / sidebar / signals) |
| [`assets/token-swatches.svg`](assets/token-swatches.svg) | color ramp + semantic swatches |
| **Live prototype** | HTML prototype (frosted-glass) — build จาก tokens ในไฟล์นี้ 1:1 (ดู [§6 stack](06-stack.md)) |

---

## 2. Naming & scope

- **Command Deck** = control window (แต่ก่อนเรียก "Control Dashboard") — หนาแน่น, ตั้งค่าได้เต็ม
- **Combat HUD** = in-game overlay — เบา, โปร่ง, click-through, ไม่บัง minimap/skillbar/stats
- ทั้งสอง surface ใช้ **token ชุดเดียวกัน** (ไฟล์ 02) แต่ต่างกันที่ *density* และ *elevation* (ดูไฟล์ 01 §surfaces)
- ยึด ADR-01: ทุกโมดูล/ฟีเจอร์ขึ้นต้น `G-`

## 3. ความสัมพันธ์กับเอกสารเดิม

| เอกสาร | สถานะ | ความสัมพันธ์ |
| --- | --- | --- |
| `docs/architecture/design-system.md` (Iceglass 0.1.0b) | candidate | **ต้นทาง** — v2 ต่อยอด palette/persona; principles ยังใช้ได้ ส่วน shell layout ถูก supersede |
| `docs/architecture/g-maiden-ui-sitemap-flow-board.md` | accepted | sitemap/flow ระดับ product — ไฟล์ 05 ในชุดนี้ลงรายละเอียด UI จริง ไม่ขัดกัน |
| PRD / SRS (`docs/product/`) | source of truth (requirements) | NFR (FPS≤3%, CPU≤2.5%, RAM≤400MB) เป็น hard constraint ที่ทุก design ต้องผ่าน |
| `CLAUDE.md` → Visual language | in-repo rule | v2 ยึด ice palette เดิม + เพิ่ม lime signal accent (ดู tokens §reconcile) |

## 4. Token quick-reference

> ค่าเต็ม + เหตุผลอยู่ใน [`02-tokens.md`](02-tokens.md) — ตารางนี้ให้เห็นภาพรวมเท่านั้น

| กลุ่ม | canonical | หมายเหตุ |
| --- | --- | --- |
| Window void | `#06070A` | พื้นหลังนอก glass |
| Glass fill | `rgba(34,46,74,0.30)` → `rgba(10,13,22,0.42)` | gradient + `backdrop-filter: blur(30px)` |
| Ice (primary) | `#8FD4FF` | แบรนด์หลัก — text link, active, focus |
| Lime (signal) | `#A3E635` | accent สำหรับ tactical/G-Signal + index chips |
| Text / dim | `#EEF4FB` / `#8BA4C6` | neutral biased ไปทางน้ำเงิน |
| Safe / Warn / Danger | `#22C55E` / `#F59E0B` / `#F43F5E` | semantic (แยกจาก accent) |
| Radius | 8 / 11 / 14 / 16 / 999 | sm / card / panel / fab / pill |
| Frame fillet | outer `28` · notch `20` | ของ Subtract shape |
| Blur | panel `30` · fab `24` · tile `6` | px, คู่กับ `saturate(150–160%)` |

## 5. กติกาการแก้ (governance)

1. **แก้ token ที่ไฟล์ 02 ที่เดียว** แล้วให้โค้ด (`styles.css` `:root`) sync ตาม — ห้าม fork ค่าใน component
2. เพิ่ม component ใหม่ → ลงทะเบียนในไฟล์ 04 พร้อม dimension + states ก่อน merge
3. เปลี่ยน layout geometry → แก้ path/ตัวเลขในไฟล์ 03 + regenerate `assets/*.svg`
4. ทุก PR ที่แตะ UI ต้องไม่ทำ NFR budget เกิน (ดูไฟล์ 01 §NFR gate)
5. bump `version` (semver) ที่ frontmatter ไฟล์นี้เมื่อมี breaking change ต่อ token/layout

## 6. Changelog

| version | date | สรุป |
| --- | --- | --- |
| 2.1.0-draft | 2026-07-09 | CR-007 design package: layout freeze บันทึกเป็นกติกา; เพิ่มไฟล์ 07 (Combat HUD contract) + 08 (Account/GID UX); 05 sync กับ shell จริง (audio rail แทน P1–P5, แกนเฟส pending) |
| 2.0.0-draft | 2026-07-05 | ตั้งชุดเอกสาร SSOT ใหม่; Command Deck HUD (Subtract glass shell); reconcile ice+lime tokens; FAB cutout system |
| 0.1.0b | 2026-06-23 | Iceglass candidate เดิม (`docs/architecture/design-system.md`) |
