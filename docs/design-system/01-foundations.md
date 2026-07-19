---
version: "2.0.0-draft"
created_at: "2026-07-05T00:00:00+07:00,Opus"
last_update: "2026-07-05T00:00:00+07:00,Opus"
status: "draft"
attributes:
  domain: "ui-ux"
  scope: "principles, visual language, surfaces"
  language: "th/en"
---

# 01 — Foundations

## 1. Design principles (persona-driven)

Maiden ไม่ใช่แค่ dashboard — เป็น **companion** ที่มีบุคลิก ดังนั้น UI ต้องสะท้อน persona
(ดู [`CLAUDE.md`](file:///g:/G-Maiden/CLAUDE.md) → Persona rules) ไม่ใช่แค่สวย:

1. **Peripheral-first** — ระหว่างเล่นจริง ผู้เล่นมองจอเกม ไม่ใช่ deck; ข้อมูลสำคัญต้องอ่านได้ด้วย
   หางตา (สี + รูปทรง + ตำแหน่งคงที่) ไม่ต้องอ่านตัวหนังสือ
2. **Calm by default, loud on danger** — พื้นหลังเย็น (ice), นิ่ง; สีร้อน/lime สงวนไว้ตอน "ต้องสนใจ"
   เท่านั้น (G-Signal) — ความเงียบทำให้เสียงเตือนดัง
3. **Honest state** — ไม่มีข้อมูล = แสดง `—`/placeholder ไม่ใช่เลข 0 ปลอม (ยึดหลัก FALLBACK ทั้งแอป)
4. **Glass = depth, not decoration** — ความโปร่ง/เบลอสื่อ "ลอยเหนือเกม" — borderless ทำให้รู้สึกเป็น
   HUD ไม่ใช่หน้าต่างแอปทึบ ๆ
5. **Meme-aware, ไม่เล่นเกินงาน** — persona มีอารมณ์ขัน (Nerf CM) แต่ที่ผิว UI ยังต้อง credible;
   ความสนุกไปอยู่ที่ copy/เสียง ไม่ใช่ effect รก ๆ

## 2. Visual language

- **Mood:** ice / arcane / tactical companion — เย็น, พรีเมียม, มีสมาธิ ไม่ใช่ warm-western หรือ neon-cyber
- **Ground:** near-black biased ไปทางน้ำเงิน (`--g-void #06070A`) — เลือกมา ไม่ใช่เทา default
- **Surface:** frosted glass (blur + rim บาง) ลอยบน ambient glow — ไม่ใช้ panel ทึบขอบหนา
- **Accent:** ice (แบรนด์) + lime (signal) — ดู tokens §1.2–1.3 ว่าห้ามใช้สลับ
- **Shape:** มุมโค้งใหญ่, panel **เว้าแหว่ง** (Subtract) เพื่อให้ FAB ลอยในช่อง — นี่คือ signature ของ deck
- **Typography:** IBM Plex Sans Thai Looped (bundled woff2) + IBM Plex Mono สำหรับตัวเลข; ลำดับชั้นมาจาก weight/size ไม่ใช่สี (ดู §02 tokens §2)

### 2.1 Two-material rule (CR-011 §B — COLD BOOTH, shipped waves P1/P1b/P2/P3)

**Two materials, strictly assigned — ห้ามผสม:**

- **Console glass** (the ONLY blur in the deck): the Subtract shell panel, FABs, และ
  pop layers เท่านั้น — Maiden Line palette (`.gm-palette`), shortcut sheet (`.gm-sheet`).
  ใช้ [`var(--g-blur-console)`](file:///g:/G-Maiden/src/src/styles.css#L39) เสมอ (ไม่ hardcode `blur()`) เพื่อให้ quality tier
  (`html.gq-cinematic/balanced/eco`, §02 tokens) คุมได้จุดเดียว.
- **Instrument matte**: ทุก interior sector/card (score header, mini stat, hero slot,
  battle grid, sector log, agent/on-air card, momentum, minimap frame ฯลฯ) — พื้นทึบ
  [`var(--g-instrument)`](file:///g:/G-Maiden/src/src/styles.css#L36) / `var(--g-instrument-2)`, ขอบ [`var(--g-hairline)`](file:///g:/G-Maiden/src/src/styles.css#L37) /
  `var(--g-hairline-2)` **1px เท่านั้น ห้ามมี blur/shadow**. เหตุผล: interior เลิกแย่งซีน
  กับ shell, GPU cost ลด, glass กลับมามีความหมาย (shell ลอย, instrument ถูก "ฝัง" อยู่ในนั้น).

ผลคือ blur ในดeck เหลือ "ที่เดียว" (shell) แทนที่จะกระจายไปทุก panel เหมือน v2 เดิม
([`--g-blur-panel`](file:///g:/G-Maiden/src/src/styles.css#L34)/`--g-blur-tile` ที่เคยใช้กับ interior — ค่านั้นยังอยู่ในโค้ดเป็น legacy
แต่ interior sector ใหม่ทั้งหมดต้อง reference `--g-instrument*`/`--g-hairline*` ไม่ใช่
blur token). Overlay (Combat HUD) ไม่แตะกติกานี้ — ดู [[07-combat-hud|07-combat-hud.md]].

### Do / Don't

| ✅ Do | ❌ Don't |
| --- | --- |
| glass + rim บาง + shadow | เส้นขอบทึบหนารอบ card |
| lime เฉพาะ tactical/attention | ทั้งจอเขียว / lime เป็นพื้น nav |
| `—` เมื่อไม่มี data | เลข 0 ปลอมเป็น real value |
| ตำแหน่ง zone คงที่ทุกแมตช์ | เลื่อน/รีเฟลว์จนหาไม่เจอด้วยหางตา |
| ตัวเลข tabular-nums | ตัวเลขเต้นความกว้างตอนอัปเดต |

## 3. Product surfaces

| Surface | เป้าหมาย | Density | Elevation | Interaction |
| --- | --- | --- | --- | --- |
| **Command Deck** (control window) | ตั้งค่า, ดูสถานะ, preview, update | Medium-high | glass เต็ม (blur 30) | full controls |
| **Combat HUD** (overlay) | เตือน/ข้อมูลเฉพาะที่ต้องใช้ | Low | เบา, blur จำกัด | passive, click-through |
| **Onboarding** | ทำ GSI พร้อมเร็ว | Low-med | glass | guided steps |
| **Post-match / Coach** | review + จุดพัฒนา | Medium | glass | report + drilldown |
| **Stream mode** | broadcast-safe | Medium | glass | mask ข้อมูล sensitive |

**Rule:** ห้ามยก chrome เต็มของ Deck (topbar/sidebar/agent card) ไปวางใน overlay ระหว่างเล่นจริง —
overlay ใช้เฉพาะ widget ที่จำเป็น (G-Signal meter, banner) และต้อง click-through

## 4. NFR gate (hard constraints — ต้องผ่านก่อน merge)

จาก SRS — ทุก design decision ต้องไม่ทำให้เกิน:

| งบ | เพดาน | ผลต่อ design |
| --- | --- | --- |
| G-Signal latency | ≤300ms (target 250) | เสียง/marker ต้อง render เร็ว ไม่รอ heavy layout |
| FPS drop (overlay) | ≤3% | จำกัด `backdrop-filter`/shadow ใน overlay; วัดจริง |
| CPU (background) | ≤2.5% | ไม่ animate ตลอดเวลาใน overlay; ambient เฉพาะ deck |
| RAM (ทุกโมดูล) | ≤400MB | ไม่โหลด asset ภาพใหญ่เกินจำเป็นใน deck |
| Occlusion | ห้ามบัง minimap / skillbar / stats | overlay zone ต้องเลี่ยงพื้นที่เหล่านี้ |

Privacy: match data / CV / G-Log = local only; deck แสดง identity + public OpenDota เท่านั้น (ADR-14)

## 5. Accessibility

- Focus ต้องมี ring มองเห็นได้ ([`--g-ice-500`](file:///g:/G-Maiden/src/src/styles.css#L18), outline 2px) — ทุก control ที่ tab ถึง
- Contrast: ข้อความหลักบน glass ต้อง ≥ 4.5:1 (ใช้ [`--g-text`](file:///g:/G-Maiden/src/src/styles.css#L21) บนพื้นเข้มพอ; อย่าวางบน glass ที่ BG สว่างจนอ่านไม่ออก)
- ห้ามสื่อความหมายด้วย "สีอย่างเดียว" — G-Signal ใช้สี + label + ระดับ bar ประกอบกัน
- `prefers-reduced-motion`: ปิด ambient drift, dropdown slide, bar transition
- เป้าคลิกขั้นต่ำ ~28–32px (win-btn, nav item ทำได้ตามนี้)

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 2.0.0-draft | 2026-07-19 | changelog table added per Step-5 SOP (G1.5) |
