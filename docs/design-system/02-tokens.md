---
version: "2.0.0-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-05T00:00:00+07:00,Opus"
status: "draft"
attributes:
  domain: "ui-ux"
  scope: "design tokens"
  language: "th/en"
---

# 02 — Design Tokens

> SSOT ของ **ค่า** ทั้งหมด แก้ที่นี่ที่เดียว แล้ว sync ไป `src/src/styles.css` `:root`
> Naming: `--g-<group>-<role>` (prefix `g` = G-Maiden namespace, กัน collision กับ lib)

---

## 1. Color

### 1.1 Ground / neutrals (blue-biased, ไม่ใช่เทากลาง)

| token | hex / rgba | ใช้ที่ |
| --- | --- | --- |
| `--g-void` | `#06070A` | พื้นหลังสุด (นอก glass panel), overlay = โปร่งใส |
| `--g-ink` | `#0B0E16` | solid fallback เมื่อ backdrop-filter ไม่รองรับ |
| `--g-glass-a` | `rgba(34, 46, 74, 0.30)` | glass gradient stop บน |
| `--g-glass-b` | `rgba(10, 13, 22, 0.42)` | glass gradient stop ล่าง |
| `--g-glass-rim` | `rgba(160, 200, 255, 0.16)` | เส้นขอบ panel (บาง, จับแสง) |
| `--g-card` | `rgba(150, 200, 255, 0.05)` | พื้น card ใน panel |
| `--g-card-line` | `rgba(150, 200, 255, 0.08)` | เส้น card |
| `--g-fab` | `rgba(14, 18, 28, 0.45)` | พื้น FAB (โปร่ง + blur) |
| `--g-fab-rim` | `rgba(160, 200, 255, 0.14)` | เส้น FAB |

### 1.2 Ice — primary brand ramp

| token | hex | ใช้ที่ |
| --- | --- | --- |
| `--g-ice-100` | `#CFECFF` | text บนพื้น ice เข้ม |
| `--g-ice-300` | `#9BE7FF` | highlight, glow |
| `--g-ice-500` | `#8FD4FF` | **primary** — link, active, focus ring, brand text |
| `--g-ice-600` | `#64C7FF` | hover เข้ม, icon |
| `--g-ice-700` | `#226CFF` | deep action / primary button fill |
| `--g-ice-dim` | `#6B8BB5` | ข้อความรอง sub-label บนพื้น ice |

### 1.3 Lime — signal / tactical accent

| token | hex | ใช้ที่ |
| --- | --- | --- |
| `--g-lime-500` | `#A3E635` | **accent** — index chip (1–6), tactical badge, G-Signal hero card, anchor active |
| `--g-lime-soft` | `rgba(163, 230, 53, 0.16)` | พื้น chip/badge |
| `--g-lime-line` | `rgba(163, 230, 53, 0.34)` | เส้น chip/badge |

> **ทำไมมี 2 accent:** ice = แบรนด์/navigation (เย็น, นิ่ง); lime = "มีอะไรต้องสนใจ" (G-Signal, live).
> อย่าใช้สลับกัน — lime สงวนไว้สำหรับ tactical/attention เท่านั้น กันไม่ให้ทั้งจอเขียว

### 1.4 Text

| token | hex | ใช้ที่ |
| --- | --- | --- |
| `--g-text` | `#EEF4FB` | ข้อความหลัก |
| `--g-text-dim` | `#8BA4C6` | label, caption, meta |
| `--g-text-mute` | `#5E7699` | disabled / placeholder |

### 1.5 Semantic (แยกจาก accent — ห้ามนับเป็นสีแบรนด์)

| token | hex | ความหมาย |
| --- | --- | --- |
| `--g-safe` | `#22C55E` | ปลอดภัย / safe push / positive G-Signal |
| `--g-ok` | `#31D0A0` | mint — เศรษฐกิจ/ทรัพยากรดี (แยกจาก safe) |
| `--g-warn` | `#F59E0B` | เตือน / gank risk ปานกลาง |
| `--g-danger` | `#F43F5E` | อันตราย / gank สูง / close action |

### 1.6 Reconcile กับโค้ดปัจจุบัน (migration map)

`src/src/styles.css` `:root` วันนี้ใช้ค่าเก่า — ตารางแปลง (canonical = คอลัมน์ v2):

| บทบาท | legacy (ในโค้ด) | v2 canonical | action |
| --- | --- | --- | --- |
| bg | `--bg #060913` | `--g-void #06070A` | migrate |
| panel | `--panel #0E1626` | glass gradient + `--g-ink` fallback | migrate |
| line | `--line #24344E` | `--g-glass-rim` / `--g-card-line` | migrate |
| ice | `--blue #64C7FF` / `--cyan #9BE7FF` | `--g-ice-600` / `--g-ice-300` | keep, rename |
| primary ice | (ไม่มี) | `--g-ice-500 #8FD4FF` | **add** |
| accent | (ไม่มี) | `--g-lime-500 #A3E635` | **add** |
| text | `--txt #D8E6F2` | `--g-text #EEF4FB` | migrate |
| muted | `--muted #8FA6C0` | `--g-text-dim #8BA4C6` | migrate |
| ok | `--ok #31D0A0` | `--g-ok` (mint) + `--g-safe #22C55E` (แยก 2 role) | split |
| warn | `--warn #FFB86B` | `--g-warn #F59E0B` | migrate |
| danger | `--danger #FF5C7A` | `--g-danger #F43F5E` | migrate |

---

## 2. Typography

| token | ค่า | ใช้ที่ |
| --- | --- | --- |
| `--g-font-ui` | `"Segoe UI", system-ui, sans-serif` | UI ทั้งหมด (รองรับไทยบน Windows) |
| `--g-font-mono` | `Consolas, ui-monospace, monospace` | clock, ping, ตัวเลขจัดคอลัมน์ |

**Type scale (px)** — ยึด scale นี้ อย่าใช้ค่านอกลิสต์:

| step | px | weight | ใช้ที่ |
| --- | --- | --- | --- |
| micro | 8.5 | 700 | index chip, stat key |
| caption | 9–10 | 600–700 | label, meta, log time |
| body-s | 10.5–11 | 400–600 | log text, sub-label |
| body | 12 | 400–600 | ข้อความทั่วไป, nav |
| data | 13 | 700 | stat value |
| h-clock | 14 | 400 | clock (mono) |
| title | 17 | 800 | agent card heading |
| score | 20 | 800 | scoreboard number |
| signal | 30 | 800 | G-Signal card value |

กติกา: heading ใส่ `text-wrap: balance`; ตัวเลขที่จัดคอลัมน์ใส่ `font-variant-numeric: tabular-nums`;
uppercase label ใส่ `letter-spacing: 0.4–1px`

---

## 3. Spacing

scale ฐาน 2 (px): **2 · 4 · 6 · 8 · 10 · 12 · 14 · 16**
- gap ระหว่าง card ใน grid: `8`–`12`
- padding ใน card/FAB: `10 14` ถึง `14 16`
- ระยะขอบ zone จากขอบ panel: `16`
- ใช้ `gap` ของ flex/grid เป็นหลัก — ห้าม margin ต่อ element ที่ collapse ได้

---

## 4. Radius

| token | px | ใช้ที่ |
| --- | --- | --- |
| `--g-r-sm` | 8 | ปุ่มเล็ก, chip, win-btn |
| `--g-r-card` | 11 | card, log panel, stat cell (9–11) |
| `--g-r-panel` | 14 | agent tile, topbar FAB |
| `--g-r-fab` | 16 | sidebar FAB, signal card |
| `--g-r-pill` | 999 | badge, gsi-badge, status |
| `--g-r-frame-outer` | 28 | มุมนอกสุดของ Subtract panel |
| `--g-r-frame-notch` | 20 | มุมเว้า (fillet) ของทุก notch |

---

## 5. Elevation (shadow)

| token | ค่า | ใช้ที่ |
| --- | --- | --- |
| `--g-shadow-fab` | `0 12px 34px rgba(0,0,0,0.42)` | FAB ทุกตัวที่ลอยบน void |
| `--g-shadow-panel` | `0 18px 50px rgba(0,0,0,0.55)` | drop-shadow ของ glass panel |
| `--g-rim-top` | `inset 0 1px 0 rgba(255,255,255,0.06)` | ขอบบน glass จับแสง (borderless) |

หลักการ: **glass = blur + rim บาง + shadow**, ไม่ใช้เส้นขอบทึบ (นั่นคือความรู้สึก borderless)

---

## 6. Blur / backdrop

| token | ค่า | ใช้ที่ |
| --- | --- | --- |
| `--g-blur-panel` | `blur(30px) saturate(150%)` | main glass panel |
| `--g-blur-fab` | `blur(24px) saturate(160%)` | FAB, signal card |
| `--g-blur-tile` | `blur(6px)` | agent card, chip บนภาพ |

> **Overlay (Combat HUD) ข้อควรระวัง NFR:** `backdrop-filter` มีต้นทุน GPU — ใน overlay ระหว่างเล่นจริง
> ให้จำกัด blur เฉพาะ panel เดียว/องค์ประกอบเล็ก และวัด FPS drop ≤3% เสมอ (ดูไฟล์ 01 §NFR gate)

---

## 7. Motion

| token | ค่า | ใช้ที่ |
| --- | --- | --- |
| `--g-t-micro` | `0.12s` | hover ปุ่ม, background/color |
| `--g-t-hover` | `0.15s` | badge, card hover |
| `--g-t-state` | `0.2s` | caret rotate, open/close |
| `--g-t-bar` | `0.3s` | signal bar fill |
| `--g-t-ambient` | `14s ease-in-out infinite` | light streak บน BG (decorative) |
| `--g-ease` | `ease-out` | default |

ทุก animation ต้องเคารพ `@media (prefers-reduced-motion: reduce)` — ปิด ambient/แต่งเติมทั้งหมด

---

## 8. Z-index

| token | ค่า | layer |
| --- | --- | --- |
| `--g-z-bg` | 0 | ambient background |
| `--g-z-panel` | 1 | glass panel + stroke |
| `--g-z-content` | 10 | zone ต่าง ๆ ใน panel |
| `--g-z-fab` | 100 | FAB, signal cards |
| `--g-z-pop` | 200 | dropdown, tooltip, modal |

---

## 9. `:root` — copy-paste block

```css
:root {
  /* ground / glass */
  --g-void:      #06070A;
  --g-ink:       #0B0E16;
  --g-glass-a:   rgba(34, 46, 74, 0.30);
  --g-glass-b:   rgba(10, 13, 22, 0.42);
  --g-glass-rim: rgba(160, 200, 255, 0.16);
  --g-card:      rgba(150, 200, 255, 0.05);
  --g-card-line: rgba(150, 200, 255, 0.08);
  --g-fab:       rgba(14, 18, 28, 0.45);
  --g-fab-rim:   rgba(160, 200, 255, 0.14);

  /* ice (primary) */
  --g-ice-100: #CFECFF;
  --g-ice-300: #9BE7FF;
  --g-ice-500: #8FD4FF;
  --g-ice-600: #64C7FF;
  --g-ice-700: #226CFF;
  --g-ice-dim: #6B8BB5;

  /* lime (signal accent) */
  --g-lime-500:  #A3E635;
  --g-lime-soft: rgba(163, 230, 53, 0.16);
  --g-lime-line: rgba(163, 230, 53, 0.34);

  /* text */
  --g-text:      #EEF4FB;
  --g-text-dim:  #8BA4C6;
  --g-text-mute: #5E7699;

  /* semantic */
  --g-safe:   #22C55E;
  --g-ok:     #31D0A0;
  --g-warn:   #F59E0B;
  --g-danger: #F43F5E;

  /* type */
  --g-font-ui:   "Segoe UI", system-ui, sans-serif;
  --g-font-mono: Consolas, ui-monospace, monospace;

  /* radius */
  --g-r-sm: 8px;  --g-r-card: 11px; --g-r-panel: 14px;
  --g-r-fab: 16px; --g-r-pill: 999px;
  --g-r-frame-outer: 28px; --g-r-frame-notch: 20px;

  /* elevation */
  --g-shadow-fab:   0 12px 34px rgba(0,0,0,0.42);
  --g-shadow-panel: 0 18px 50px rgba(0,0,0,0.55);

  /* blur */
  --g-blur-panel: blur(30px) saturate(150%);
  --g-blur-fab:   blur(24px) saturate(160%);
  --g-blur-tile:  blur(6px);

  /* motion */
  --g-t-micro: 0.12s; --g-t-hover: 0.15s; --g-t-state: 0.2s; --g-t-bar: 0.3s;
  --g-ease: ease-out;

  /* z-index */
  --g-z-bg: 0; --g-z-panel: 1; --g-z-content: 10; --g-z-fab: 100; --g-z-pop: 200;
}
```

> เมื่อ migrate: เพิ่ม block นี้ก่อน แล้วค่อยแทนที่ `var(--bg)` ฯลฯ ทีละ component — อย่า big-bang
