# CR-007: FROSTLINE — Command Deck refresh ภายใน shell CR-006 (layout ล็อก)

**Status:** DESIGN
**Author:** Boss (direction) + Claude (spec)
**Date:** 2026-07-09
**Predecessor:** CR-006 shell (merged `17214968`, `189de2e5`), CR-002 (live-wire), ADR-14 (accounts/GID)

---

## 1. Problem statement

CR-006 shell (subtract glass + FAB) merge แล้วและ**เป็น identity ของแอป** — Boss ตัดสินใจ
**ล็อก layout** (2026-07-09) แต่สิ่งที่อยู่*ใน*เปลือกยังไม่ถึงระดับเดียวกับเปลือก:

1. **เนื้อหา stub ปนของจริง** — "Slot ID 1", "Alert Deck / Threat tabs" ว่าง, minimap orb ปลอม,
   Vision bar hardcode `width:40%`, สูตร gank risk ฝังใน UI layer, typo "VOLUM"
2. **Token/typography อ่อน** — micro 8.5px อ่านไม่ออกเมื่อ stage โดน scale ต่ำกว่า 1,
   `--g-text-dim` หมิ่นเหม่ contrast, icon vocabulary แตก (stroke SVG ปนอีโมจิ)
3. **Glass ไม่มีเกียร์** — blur 78px (L1) + 30px (panel) เป็นต้นทุน compositing คงที่
   โดยไม่มีทางลดสำหรับเครื่องเบา ขัดกับงบ CPU ≤2.5%
4. **Deck ไม่รู้เวลา** — UI เดียวกันทั้งก่อนเกม/ในเกม/หลังเกม ทั้งที่ workflow ต่างกันสิ้นเชิง
5. ไม่มี command palette / keyboard flow ภายในแอป

**Goal:** ยกคุณภาพ skin + content + system ให้เท่าระดับเปลือก **โดยไม่ขยับ geometry แม้แต่ px เดียว**
(ยกเว้นข้อที่ mock กำหนดไว้แต่โค้ดยังทำไม่ครบ — ดู §2)

---

## 2. Design freeze (สิ่งที่ห้ามแตะ — คำสั่ง Boss)

| ชิ้น | สถานะ |
| --- | --- |
| Fixed stage `1420×760` + scale-to-fit | **ล็อก** — เหตุผล: จอเดียวผู้ใช้ปิดลง tray อยู่แล้ว, สองจอ = เครื่องแรงพอ |
| Subtract panel `1280×720`, fillet 28/20 | **ล็อก** |
| Notch ซ้าย (sidebar FAB) + บนขวา (topbar FAB) | **ล็อก** |
| **Notch ขวาล่าง (signal cluster)** | mock กำหนดให้เว้า แต่ `FUNG_PANEL_PATH` จริงยังไม่เว้า (03-layout §4 บันทึกไว้) → **ต้องทำให้เว้าจริง** — ถือเป็นการ "ทำ layout ให้ตรง mock" ไม่ใช่แก้ layout |
| L1 Liquid Glass ชั้นล่างสุด | **ล็อก** (แต่มี quality tier — §4) |
| Power radial ซ้ายล่าง | คงอยู่ — ทำ surgical fix ตำแหน่ง (defect ค้างจาก CR-006) |
| Sector geometry ใน dashboard (5 ช่อง) | **ล็อก** — ตำแหน่งคงที่คือหัวใจ peripheral scan |
| Combat HUD (overlay window) | **ไม่แตะ** — ออกแบบ/บันทึกแยกใน `docs/design-system/07-combat-hud.md` |

---

## 3. Work packages

### WP-1 — Geometry completion (ปิดหนี้ CR-006)
- แก้ `FUNG_PANEL_PATH` ใน `src/src/CommandDeck.tsx` เพิ่ม notch ขวาล่างให้ signal cluster
  ฝังในรอยเว้าจริง (ตาม wireframe `assets/wireframe-annotated.svg`)
- Surgical fix ตำแหน่ง power radial เทียบมุมซ้ายล่างของ shell (defect เปิดอยู่ใน 03-layout §8.4)
- อัปเดต `03-layout.md` + regenerate overlay SVG ตาม governance

### WP-2 — Token layer v3 (OKLCH + quality tiers)
- เขียน `:root` ใหม่เป็น OKLCH โดย**คง hue เดิมทุกตัว** (void/ice/lime ไม่เพี้ยนจากตา)
  พร้อม alias ชื่อ `--g-*` เดิมกันโค้ดเก่าพัง
- ยก `--g-text-dim` ให้ผ่าน contrast ≥4.5:1 บน glass จริง
- เพิ่ม quality tier classes ที่ root:

| Tier | L1 Liquid Glass | Panel glass | target |
| --- | --- | --- | --- |
| `gq-cinematic` (default) | blur 78px | blur 30px | เครื่องแรง / 2 จอ |
| `gq-balanced` | blur 36px | blur 16px | ทั่วไป |
| `gq-eco` | pre-baked gradient (ไม่มี backdrop-filter) | tint ทึบ + rim เดิม | เครื่องเบา |

- Option "Crisp text": snap scale เป็นขั้น 0.75/0.875/1.0/1.25 + letterbox (opt-in)

### WP-3 — Typography + iconography
- Bundle **IBM Plex Sans Thai Looped** (UI) + **IBM Plex Mono** (ตัวเลข/clock/ping) แบบ local
  — ห้ามพึ่ง CDN (desktop app, CSP)
- ยก floor ของ type scale: micro 8.5→10px, caption 9→11px (ที่ scale 1.0) ขั้นอื่นคงเดิม
- ล้าง icon: dropdown อีโมจิ (👤🎙⚙) → stroke set เดียวกับ `DeckIcons.tsx`
- แก้ typo `VOLUM` → `VOLUME`

### WP-4 — Honest content (ตามหลัก Honest state ของ 01-foundations)
- Hero slot: ชื่อฮีโร่จริงจาก `live/heroNames.ts` แทน "Slot ID n"; ไม่รู้ = `—` ไม่ใช่ 0/0/0
- "Alert Deck / Threat tabs" stub → event feed จริงจาก events ที่มีแล้ว
- ย้ายสูตร gank risk / safe push จาก `CommandDeck.tsx` ไป `src/src/live/buildSignals.ts`
  (pure builder, มี test เหมือน builder อื่น)
- Vision card ใช้ค่าจริงจาก signals; ไม่มีข้อมูล = `—` + bar ว่าง
- Minimap: มี CV data → marker จริง; ไม่มี → แผนที่นิ่ง + label "CV standby" (Lite mode)
- **Audio-flag boundary (gate follow-up, 2026-07-10):** the deck's ANN toggle
  (`CommandDeck.tsx` audio rail) only gates G-AnnStudio announcer-pack events
  (`set_announcer_enabled` → `gsi.rs` → `announcer::most_important`) — kill/
  streak/death lines. It is **independent** of Maiden's persona voice
  (`s.voiceEnabled` in `App.tsx`, persona TTS only) and of G-Signal's gank
  voice (now gated solely by the deck's SIGNAL toggle, `set_cv_signal_enabled`).
  This is intentional, not a gap: muting the announcer pack must not silence
  Maiden or gank warnings. The deck's audio rail is also the single owner of
  `volume` / `signalEnabled` / `announcerEnabled` — it persists all three in
  `gm-deck-audio-rail` (localStorage) and pushes them to the backend once on
  mount; the backend emits `volume-change` / `signal-change` / `announcer-change`
  so any other surface (e.g. the legacy Control panel under Settings) stays in
  sync instead of silently overwriting the rail's state.

### WP-5 — Phase-aware content (เนื้อหารู้เฟส, ช่องอยู่ที่เดิม)
- `src/src/live/phase.ts`: state machine `standby → prep → live → debrief`
  อ่านจาก events เดิม (`gsi-status`, `game-tick`, map game_state) — override มือได้, badge บอกโหมด
- เนื้อหาต่อ sector (ตำแหน่ง**ไม่ขยับ**):

| Sector | STANDBY / PREP | LIVE | DEBRIEF |
| --- | --- | --- | --- |
| Score header | `— --:-- —` | สกอร์จริง | ผลจบเกม |
| Stats row | baseline OpenDota | NW/GPM/XPM เทียบ baseline | delta เทียบค่าเฉลี่ยตัวเอง |
| Battle grid | checklist ก่อนเกม (GSI/overlay/pack/volume) | hero 10 ช่อง (ally เต็ม, enemy identity+missing) | timeline เหตุการณ์สำคัญ |
| Agent card | Maiden standby | presence: ประโยคล่าสุด + คิวเสียง + badge `LOCAL SLM` เมื่อ cloud หลุด | สรุป + **belief-revision ink** (คำทำนายผิดถูกขีดฆ่าพร้อมคำแก้) |
| Sector log | ว่างแบบสอนงาน | event feed | G-Log ของเกมนั้น |

- Signal cluster D–G = annunciator: ตำแหน่ง/ลำดับคงที่, lime เฉพาะ escalate

### WP-6 — Command palette + settings
- **Maiden Line** (`Ctrl+K`): overlay ลอยเหนือ stage (ไม่กระทบ layout), entry เป็นกริยา
  สองภาษา (เปิด overlay / เปลี่ยน voice pack / ทดสอบเสียง / ไป debrief / ตรวจอัปเดต),
  destructive ต้อง confirm inline
- Settings เพิ่ม: UI Quality (tier §WP-2), Crisp text, density (comfortable/compact)
- In-app shortcuts: `Ctrl+1..5` สลับหน้า, `Ctrl+D` density, `?` shortcut sheet
  (global hotkeys เดิมไม่แตะ)

### WP-7 — Docs sync (governance ข้อ 5 ของ SSOT)
- `02-tokens.md`: OKLCH block + quality tiers + type floor ใหม่
- `03-layout.md`: path ใหม่ (notch 3 จุด) + power radial final
- `05-sitemap-ia.md`: phase model + palette + ลิงก์ 07/08
- ใหม่: `07-combat-hud.md` (overlay design จากของจริง), `08-account-gid.md` (login+GID UX)
- bump design-system README เป็น v3.0.0-draft

---

## 4. Out of scope

- **Shell rewrite ทุกรูปแบบ** (resizable grid, inspector panel ฯลฯ จากข้อเสนอ FROSTLINE เดิม) — Boss ปฏิเสธแล้ว
- **Gadget mode** (หน้าต่างเล็ก always-on-top ~420×180: annunciator + volume + GSI) — จดเป็นแนวคิดสำหรับ CR ถัดไป
- Wallet/billing/store — CR-003
- การเปลี่ยนพฤติกรรม overlay/critical path ใด ๆ (gsi.rs, announcer.rs, DXGI)

---

## 5. Acceptance criteria

1. Geometry: notch ขวาล่างเว้าจริง, power radial ตรง mock, sector ทั้ง 5 พิกัดเดิมเป๊ะ
2. NFR gate: รัน `tests/perf/src/bin/perf_cpu_tree.rs` ก่อน/หลัง — tier `gq-eco` ต้อง**ลด** CPU
   ของ visible deck เทียบ baseline; `gq-cinematic` ต้องไม่แย่ลง
3. Contrast: ข้อความหลัก/รองบน glass ผ่าน 4.5:1 (วัดจริงบน tier ทุกระดับ)
4. ไม่มี fake data เหลือ: grep แล้วต้องไม่พบ "Slot ID", "Threat tabs", `width: "40%"` (Vision)
5. `npx tsc --noEmit` + `cargo test` + clippy ผ่าน
6. เอกสาร WP-7 ครบก่อน merge (doc-first ตาม R4/C-2)

## 6. Release policy

Batch ลง `main` โดย**ไม่ tag** ตาม batching policy — bump version + tag เฉพาะเมื่อ Boss สั่ง release
