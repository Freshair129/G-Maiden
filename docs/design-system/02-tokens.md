---
version: "2.1.0-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-15T00:00:00+07:00,Claude"
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

### 1.3b Materials — instrument matte (CR-011 §B, v3, shipped waves P1–P3)

> Two-material rule เต็ม ๆ อยู่ที่ `01-foundations.md` §2.1 — ตารางนี้คือค่าจริงในโค้ด
> (`src/src/styles.css` `:root`). Interior sector/card ทุกอันใช้กลุ่มนี้ **แทน**
> `--g-glass-*`/`--g-blur-*` — ห้ามมี blur/shadow บน instrument.

| token | hex / rgba | ใช้ที่ |
| --- | --- | --- |
| `--g-instrument` | `#0B0E16` | พื้น interior sector หลัก (score header, hero slot, battle grid, sector log, agent/on-air card, momentum, ฯลฯ) |
| `--g-instrument-2` | `#0D1119` | พื้นชั้นยกอีกนิด (phase chip fill, rundown row, minimap ground) |
| `--g-hairline` | `rgba(150, 185, 230, 0.10)` | เส้นขอบ 1px มาตรฐานของ instrument |
| `--g-hairline-2` | `rgba(150, 185, 230, 0.16)` | เส้นขอบเข้มขึ้น (phase chip, onair chip, palette hairline) |
| `--g-coin` | `#E4C36B` | economy gold — **ห้ามใช้เป็น status color** (แยกจาก safe/warn/danger) |

> โค้ดปัจจุบันยังเก็บค่าเป็น hex ตรง ๆ (ไม่ใช่ OKLCH ตามที่ CR-011 §H ร่างไว้) — คอมเมนต์ใน
> `styles.css` ระบุชัดว่า "hex today, OKLCH literal migration is a later mechanical pass";
> เอกสารนี้ยึดค่าจริงในโค้ด ไม่ใช่ค่าร่างใน CR

### 1.4 Text

| token | hex | ใช้ที่ |
| --- | --- | --- |
| `--g-text` | `#EEF4FB` | ข้อความหลัก |
| `--g-text-dim` | `#A9BEDB` | label, caption, meta (v3: ยกจาก `#8BA4C6` เดิม — contrast บนพื้น `--g-instrument` ทึบ, CR-011 §H "raised until ≥4.5:1") |
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
| muted | `--muted #8FA6C0` | `--g-text-dim #A9BEDB` (v3, raised from `#8BA4C6`) | migrate |
| ok | `--ok #31D0A0` | `--g-ok` (mint) + `--g-safe #22C55E` (แยก 2 role) | split |
| warn | `--warn #FFB86B` | `--g-warn #F59E0B` | migrate |
| danger | `--danger #FF5C7A` | `--g-danger #F43F5E` | migrate |
| interior fill (v3) | (ไม่มี, เดิมใช้ `--g-glass-*` + blur ทุก panel) | `--g-instrument #0B0E16` / `--g-instrument-2 #0D1119` | **add** (CR-011 §B — instrument matte แทน glass บน interior) |
| interior line (v3) | `--g-card-line` | `--g-hairline` / `--g-hairline-2` | **add**, ใช้คู่กับ instrument เท่านั้น |
| economy accent (v3) | (ไม่มี) | `--g-coin #E4C36B` | **add** — gold, ไม่ใช่ status color |
| ui font (v3) | `"Segoe UI", system-ui, sans-serif` | `"IBM Plex Sans Thai Looped","IBM Plex Sans","Segoe UI",system-ui,sans-serif` (bundled woff2) | migrate |
| mono font (v3) | `Consolas, ui-monospace, monospace` | `"IBM Plex Mono",Consolas,ui-monospace,monospace` (bundled woff2) | migrate |

---

## 2. Typography

| token | ค่า | ใช้ที่ |
| --- | --- | --- |
| `--g-font-ui` | `"IBM Plex Sans Thai Looped","IBM Plex Sans","Segoe UI",system-ui,sans-serif` | UI ทั้งหมด (v3, CR-011 §G/WP-3 — was `"Segoe UI", system-ui, sans-serif`) |
| `--g-font-mono` | `"IBM Plex Mono",Consolas,ui-monospace,monospace` | clock, feed-age, ตัวเลขจัดคอลัมน์ (v3, was `Consolas, ui-monospace, monospace`) |

### 2.1 Bundled font files (v3 — no CDN, CSP `default-src 'self'`)

`src/src/index.css` `@font-face` loads from `src/public/fonts/` (local woff2, `font-display: swap`) —
6 files, matching the weights actually declared:

| file | family | weight |
| --- | --- | --- |
| `IBMPlexSansThaiLooped-Regular.woff2` | IBM Plex Sans Thai Looped | 400 |
| `IBMPlexSansThaiLooped-Medium.woff2` | IBM Plex Sans Thai Looped | 500 |
| `IBMPlexSansThaiLooped-SemiBold.woff2` | IBM Plex Sans Thai Looped | 600 |
| `IBMPlexSansThaiLooped-Bold.woff2` | IBM Plex Sans Thai Looped | 700–800 |
| `IBMPlexMono-Regular.woff2` | IBM Plex Mono | 400 |
| `IBMPlexMono-Medium.woff2` | IBM Plex Mono | 500–700 |

> Overlay (Combat HUD) keeps its own inline font stack per `07-combat-hud.md` (FPS-measure
> first before bundling Plex into the overlay window too) — this bundle is Command-Deck-only.

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
| `--g-blur-panel` | `blur(30px) saturate(150%)` | main glass panel (legacy v2 token — interior sectors no longer consume this, ดู §1.3b two-material rule) |
| `--g-blur-fab` | `blur(24px) saturate(160%)` | FAB, signal card |
| `--g-blur-tile` | `blur(6px)` | agent card, chip บนภาพ (legacy) |
| `--g-blur-console` | `blur(30px) saturate(150%)` | v3 (CR-011 §B) — **the only** blur token interior/pop layers should reference: `.g-deck-panel` shell + Maiden Line palette (`.gm-palette`) + shortcut sheet (`.gm-sheet`) |

### 6.1 Quality tiers (v3, CR-011 §H — `html.gq-*` class)

`--g-blur-console` is re-declared per tier so **no other rule needs to change** — every
consumer just reads the variable:

| class | `--g-blur-console` | หมายเหตุ |
| --- | --- | --- |
| *(no class)* = `html.gq-cinematic` | `blur(30px) saturate(150%)` | **DEFAULT** — owner decision 2026-07-14 ("เอา panel blur กลับมา"), overriding an earlier none-default. Acts on webview-internal layers only (ambient bg + L1 plate); drag-lag stays fixed via `.is-dragging` (blur force-off during native window drag). |
| `html.gq-balanced` | `blur(16px) saturate(150%)` | lighter machines |
| `html.gq-eco` | `none` | no `backdrop-filter` anywhere |

Tier class is toggled on `<html>` by a Settings control (not yet wired as of this sync —
document reflects the CSS contract, wiring is a later wave).

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

  /* materials (v3, CR-011 §B — instrument matte, see §1.3b) */
  --g-instrument:   #0B0E16;
  --g-instrument-2: #0D1119;
  --g-hairline:     rgba(150, 185, 230, 0.10);
  --g-hairline-2:   rgba(150, 185, 230, 0.16);
  --g-coin:         #E4C36B;

  /* text */
  --g-text:      #EEF4FB;
  --g-text-dim:  #A9BEDB; /* v3: raised from #8BA4C6 */
  --g-text-mute: #5E7699;

  /* semantic */
  --g-safe:   #22C55E;
  --g-ok:     #31D0A0;
  --g-warn:   #F59E0B;
  --g-danger: #F43F5E;

  /* type (v3: Plex-first, bundled woff2 — see §2.1) */
  --g-font-ui:   "IBM Plex Sans Thai Looped","IBM Plex Sans","Segoe UI",system-ui,sans-serif;
  --g-font-mono: "IBM Plex Mono",Consolas,ui-monospace,monospace;

  /* radius */
  --g-r-sm: 8px;  --g-r-card: 11px; --g-r-panel: 14px;
  --g-r-fab: 16px; --g-r-pill: 999px;
  --g-r-frame-outer: 28px; --g-r-frame-notch: 20px;

  /* elevation */
  --g-shadow-fab:   0 36px 96px rgba(3,6,12,0.54), 0 10px 32px rgba(3,6,12,0.40);
  --g-shadow-tight: 0 24px 60px rgba(3,6,12,0.48), 0 6px 22px rgba(3,6,12,0.36);
  --g-shadow-panel: 0 18px 50px rgba(0,0,0,0.55);
  --g-rim-top:      inset 0 1px 0 rgba(255,255,255,0.06);

  /* blur */
  --g-blur-panel:   blur(30px) saturate(150%); /* legacy — interior no longer consumes this */
  --g-blur-fab:     blur(24px) saturate(160%);
  --g-blur-tile:    blur(6px); /* legacy */
  --g-blur-console: blur(30px) saturate(150%); /* v3 (CR-011 §B) — shell/FAB/pop only, see §6.1 */

  /* motion */
  --g-t-micro: 0.12s; --g-t-hover: 0.15s; --g-t-state: 0.2s; --g-t-bar: 0.3s;
  --g-t-ambient: 14s ease-in-out infinite;
  --g-ease: ease-out;

  /* z-index */
  --g-z-bg: 0; --g-z-panel: 1; --g-z-content: 10; --g-z-fab: 100; --g-z-pop: 200;
}
/* CR-011 §H quality tiers — DEFAULT (no class) = cinematic (owner decision 2026-07-14).
   balanced/eco step --g-blur-console down for lighter machines; see §6.1. */
html.gq-cinematic { --g-blur-console: blur(30px) saturate(150%); }
html.gq-balanced { --g-blur-console: blur(16px) saturate(150%); }
html.gq-eco { --g-blur-console: none; }
```

> เมื่อ migrate: เพิ่ม block นี้ก่อน แล้วค่อยแทนที่ `var(--bg)` ฯลฯ ทีละ component — อย่า big-bang
