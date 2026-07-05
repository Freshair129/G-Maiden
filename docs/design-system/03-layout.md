---
version: "2.0.0-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-05T00:00:00+07:00,Opus"
status: "draft"
attributes:
  domain: "ui-ux"
  scope: "layout geometry, dimensions, responsive"
  language: "th/en"
---

# 03 — Layout

> Mockup ที่ระบุ dimension: [`assets/wireframe-annotated.svg`](assets/wireframe-annotated.svg) ·
> รูปทรง panel: [`assets/subtract-shape.svg`](assets/subtract-shape.svg)

## 1. Layout concept — "Subtract HUD"

Command Deck **ไม่ใช่กล่องสี่เหลี่ยม** — เป็น glass panel แผ่นเดียวที่ถูก **เว้า (Boolean Subtract)**
3 จุด เพื่อเปิดช่องให้ FAB ลอยอยู่ในนั้น:

```
┌──────────────────────────────┐   ← มุมนอก r=28
│  panel (frosted glass)   ╔══╗ │   ← notch ขวาบน → Topbar FAB
│  P1..P5   score/stats    ╚══╝ │
│  ┌────┐ ┌──────┐ ┌─────────┐  │
│  │slot│ │minimap│ │ Agent B │  │
│  └────┘ └──────┘ └─────────┘  │
│  ┌──────────────┐  ┌──┐┌──┐   │
│╔╗│  Activity C  │  │D ││E │   │   ← notch ขวาล่าง → Signal cards D/E/F/G
│╚╝└──────────────┘  └──┘└──┘   │
└──────────────────────────────┘
 ↑ notch ซ้ายล่าง → Sidebar FAB
```

- **panel** โปร่ง เห็น ambient BG เบลอทะลุ (glassmorphism)
- **FAB** (topbar / sidebar / signal cards) ลอย **นอก** panel ในช่องเว้า → รู้สึก borderless, เป็น HUD
- ทุกมุมเว้ามี fillet โค้ง (notch r=20) ให้ negative space ดู intentional ไม่ใช่ตัดตรง ๆ

## 2. Canvas & scaling

| ค่า | ราคา |
| --- | --- |
| Design canvas | **1280 × 720** (16:9) — พิกัดทุก zone อ้างอิงระบบนี้ |
| Origin | top-left = (0,0) |
| Scaling | stage `transform: scale(s)`, `s = min(vw/1304, vh/744, 1.4)`, origin center |
| Min window | 1200 × 780 (จาก preset ใน Settings) |

> พิกัดใน §4 เป็น px บน canvas 1280×720 — implementation จริงใช้ค่าเหล่านี้ตรง ๆ แล้ว scale ทั้ง stage

## 3. Subtract-shape path (SVG)

panel = `<div>` ที่ `clip-path: url(#panelClip)` เพื่อให้ `backdrop-filter` เบลอ BG ผ่านรูปทรงจริง
(SVG fill เบลอ BG ไม่ได้ — ต้องใช้ clip บน div) เส้นขอบ (rim) วาดแยกด้วย `<path stroke>` ทับ

```
M 40,12  H 800  A 20 20 0 0 1 820,32   V 54   A 20 20 0 0 0 840,74
H 1248  A 20 20 0 0 1 1268,94   V 410  A 20 20 0 0 1 1248,430
H 764   A 20 20 0 0 0 744,450   V 688  A 20 20 0 0 1 724,708
H 112   A 20 20 0 0 1 92,688    V 350  A 20 20 0 0 0 72,330
H 32    A 20 20 0 0 1 12,310    V 40   A 28 28 0 0 1 40,12  Z
```

| notch | สร้างช่องให้ | พิกัดคร่าว ๆ |
| --- | --- | --- |
| ขวาบน | Topbar FAB | เว้าจาก x≈820 ลงไป 42px แล้วต่อขึ้น x=840 |
| ซ้ายล่าง | Sidebar FAB | เว้าเข้ามาที่ x≈92 ตั้งแต่ y≈330 ลงล่าง |
| ขวาล่าง | Signal D/E/F/G | เว้าที่ x≈744 ตั้งแต่ y≈430 ลงล่าง |

> แก้รูปทรง = แก้ path นี้ที่เดียว (ทั้ง `clipPath` และ `stroke` ใช้ path เดียวกัน) แล้ว regenerate SVG asset

## 4. Zone dimensions (px บน 1280×720)

### 4.1 ใน panel (glass)

| zone | x | y | w | h | หมายเหตุ |
| --- | --- | --- | --- | --- | --- |
| Anchor rail (P1–P5) | 16 | 22 | 70 | auto | คอลัมน์ซ้าย — anchor สื่อสาร agent |
| Score header | 104 | 18 | 690 | 50 | GSI badge + scoreboard |
| Stats bar | 104 | 76 | 700 | 42 | 6 cells (NW/GPM/XPM/KDA/CS·DN/PING) |
| Battle zone | 104 | 128 | 700 | 290 | grid `178 \| 1fr \| 178`, gap 10 |
| — slot col L | | | 178 | | Slot 1–5 |
| — minimap | | | 1fr | | tag "7" |
| — slot col R | | | 178 | | Slot 6–10 |
| Agent card (B) | 848 | 92 | 404 | 326 | อยู่ใต้ notch topbar |
| Sector C (log) | 104 | 430 | 624 | 266 | grid 2 คอลัมน์ (Activity/Events) |

### 4.2 FAB (ลอยในช่องเว้า, นอก panel)

| FAB | x | y | w | h | radius |
| --- | --- | --- | --- | --- | --- |
| Topbar (A) | 836 | 12 | 432 | 50 | 14 |
| Sidebar (I) | 14 | 342 | 64 | 306 | 16 |
| Close (X) | 14 | 656 | 64 | 44 | 14 |
| Signals D/E/F/G | 756 | 442 | 512 | 254 | 16 (2×2, gap 12) |

### 4.3 Figma authoring reference (ต้นทาง)

ค่าจาก wireframe ต้นฉบับ (Figma "Desktop-6") — ใช้เป็น *เจตนา* แล้วแพ็คลง 1280×720 ตาม §4.1–4.2:

| element | Figma dim |
| --- | --- |
| Content รวม | 1280px (inner 1180 + pad 16×2 + rail 100) |
| Anchor col | 100px |
| Topbar FAB | 432 × 50 |
| Agent card | 400 × 380 |
| Sidebar | 100 × 380 |
| Signal card (แต่ละใบ) | 280 × 160 |
| Gap มาตรฐาน | 16px |

## 5. Grid systems

- **Stats bar:** flex 6 cells เท่ากัน (`flex: 1`), gap 8
- **Battle:** CSS grid `178px 1fr 178px`, gap 10
- **Sector C:** grid `1fr 1fr` (Activity | Events) — แบ่ง sub-grid เพิ่มได้ตามเนื้อหา (ยืดหยุ่น)
- **Signals:** grid `1fr 1fr` × 2 แถว, gap 12

## 6. Responsive / window presets

หน้าต่างไม่ resize อิสระ (decorations off, `resizable: false`) — เลือก preset ใน Settings:

| preset | w × h | ใช้เมื่อ |
| --- | --- | --- |
| Compact | 1200 × 780 | จอเล็ก / เล่นคู่เกม |
| Standard | 1280 × 800 | ค่า default |
| Wide | 1440 × 900 | จอใหญ่ |
| XL | 1600 × 1000 | ultrawide บางส่วน |
| Max | 1920 × 1080 | full-HD deck |

ทุก preset scale stage 1280×720 เดิม → สัดส่วน zone คงที่เสมอ, ไม่มี scrollbar (content fit-to-grid)

## 7. กติกา layout

1. **ไม่มี scrollbar** — content ต้อง fit ในกรอบ; เกิน → หน้าใหม่/หน้าย่อย, ขาด → placeholder อนาคต
2. ตำแหน่ง zone **คงที่** ทุกแมตช์ (peripheral-first) — ห้าม reflow จนหาด้วยหางตาไม่เจอ
3. FAB ต้องอยู่ในช่องเว้าพอดี — ถ้าขยับ FAB ต้องขยับ notch ใน path ด้วย (§3)
4. drag window ผ่านพื้นที่ว่างของ topbar FAB (`data-tauri-drag-region`); ปุ่ม/badge = `no-drag`
