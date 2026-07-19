---
version: "1.0.0-draft"
created_at: "2026-07-09T00:00:00+07:00,Fable"
last_update: "2026-07-09T00:00:00+07:00,Fable"
status: "draft"
attributes:
  domain: "ui-ux"
  scope: "Combat HUD (in-game overlay) — design contract อิง implementation จริง"
  language: "th/en"
---

# 07 — Combat HUD (In-game Overlay)

> เอกสารนี้บันทึก **design contract ของ overlay ตามของจริงในโค้ด** (CR-007 กำหนดว่า overlay
> *ไม่ถูกแตะ* — เอกสารนี้คือ baseline ให้การออกแบบรอบถัดไปอ้าง)
> Source of truth ของพฤติกรรม: [`src/src/App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) (lite tier), [`src/src/overlay/FullOverlay.tsx`](file:///g:/G-Maiden/src/src/overlay/FullOverlay.tsx),
> [`src/src/overlay/modules.ts`](file:///g:/G-Maiden/src/src/overlay/modules.ts), [`src/src/overlay/LayoutEditor.tsx`](file:///g:/G-Maiden/src/src/overlay/LayoutEditor.tsx)

## 1. หลักการ (สืบจาก [[01-foundations|01-foundations]] §3)

1. **Passive + click-through เสมอ** — ผู้เล่นห้ามรู้สึกว่ามี "หน้าต่าง" อยู่บนเกม
2. **ห้ามบัง** minimap / skill bar / stats panel (NFR) — gank banner ยึด top-center,
   ห้ามลงมุมซ้ายล่างเด็ดขาด
3. **ห้ามยก chrome ของ Deck มาใส่** — overlay แชร์เฉพาะ token (สี/type/สถานะ)
4. **งบ FPS ≤3%**: blur จำกัดที่ 16px (เทียบ deck 30px), ไม่มี ambient animation,
   transition เฉพาะ state change 200ms
5. **เงียบเป็นค่าเริ่มต้น ดังเมื่ออันตราย** — โมดูลข้อมูล opacity ตาม user setting,
   banner เตือนใช้ opacity สูงกว่า (0.82–0.88) เสมอ

## 2. สองระดับ (tier)

| Tier | สถานะ | ลักษณะ |
| --- | --- | --- |
| **Lite** (default) | stable | ชุด overlay ใน `App.tsx` — stats panel รวม, ตำแหน่ง preset + X/Y slider |
| **Full** (opt-in, `Settings.uiMode='full'`) | redesign tier | ทุกชิ้นเป็น **โมดูลอิสระ** ลาก-วาง-สเกลได้ผ่าน Layout Editor; glass "Maiden Blue" |

Backend เดียวกันทั้งคู่ (game-tick / gank events) — tier เป็นเรื่อง presentation ล้วน ๆ

## 3. Module inventory (Full tier — `modules.ts`)

| id | label | กลุ่ม | เงื่อนไขแสดง |
| --- | --- | --- | --- |
| `alert` | Danger Alert | signal | gank alert/clear + `gankVisuals` on |
| `gmeter` | G-Meter (risk) | signal | in-game เสมอ (นี่คือ "เห็นแม้ G-Signal ยังไม่ถึงเกณฑ์") |
| `missing` | Enemy Missing | signal | มี missing hero และไม่มี gank banner ทับ |
| `toast` | Voice Notice | signal | event เสียงล่าสุด (fallback เมื่อ pack ไม่มี clip) |
| `advice` | Advice (G-Master) | companion | advice broadcast, ค้าง 20s |
| `companion` | Maiden Presence | companion | in-game (portrait + สถานะ "กำลังดูแล") |
| `clock` `kda` `gold` `gpm` `xpm` `nw` `score` `hero` | stat chips | stats | in-game + เปิดใน layout |

## 4. Signal system (ลำดับความสำคัญทางสายตา)

1. **Gank banner** (`gank-alert`) — สี warn + glow, บอกฮีโร่ที่หาย + ความน่าจะเป็น;
   auto-dismiss 6s ถ้าไม่มี `gank-clear`
2. **Belief-revision echo** (`gank-clear`) — banner เปลี่ยนเป็นเส้น ice + ข้อความ
   "เอ๊ะ… ปลอดภัยแล้วค่ะ" ค้าง 2.2s แล้วจาง — **นี่คือ requirement ของ persona ไม่ใช่ polish**
3. **G-Meter** — LED 4 ช่อง (ปลอดภัย/ระวัง/เสี่ยง/อันตราย) จาก missing count + gank flag;
   จงใจ**ไม่โชว์ %** เพื่อไม่ให้ผู้เล่นจ้องเลข
4. **Kill/streak banner + Pack banner** — `announcer-banner` ส่งภาพ banner ของ pack
   (base64 `data:` ตาม CSP `img-src 'self' data:`) มาแทน kill card built-in;
   pack ไม่มีภาพ → fallback เป็น card เดิม — เสียงกับภาพยิงพร้อมกันเสมอ

## 5. Layout Editor (ใน Control window)

- ลาก-วางโมดูลบนพรีวิวซ้อนภาพ Dota HUD reference (dim ลง)
- แม่เหล็กกริด 5% (`x/y` เก็บเป็น % ของจอ → ทน resolution ต่างกัน)
- Hover ชื่อโมดูล = solo focus (โมดูลอื่นจาง)
- Overlay profiles: position preset / custom X-Y / opacity / toggle รายโมดูล — บันทึกได้หลายโปรไฟล์

## 6. Resilience & guard (ของจริงที่ต้องคงไว้)

| กลไก | เหตุผล |
| --- | --- |
| emit throttle 5Hz + slow-frame watchdog + panic hook → `error.log` | แก้ overlay ค้างหลังเล่นยาว |
| เตือนเมื่อ Dota อยู่ Exclusive Fullscreen | overlay ใช้ได้เฉพาะ borderless (`-window -noborder`) |
| CV ไม่ทำงาน → Lite mode (GSI-only) | เสียง/overlay/G-Master ยังทำงาน |

## 7. States

| state | การแสดง |
| --- | --- |
| ไม่อยู่ในเกม | stat modules ซ่อน; companion = "รอเข้าเกม…" |
| in-game ปกติ | G-Meter ปลอดภัย (เขียว), stats ตาม layout |
| gank alert | banner warn + G-Meter peg อันตราย |
| gank clear | belief-revision echo (ice) 2.2s |
| ไม่มีข้อมูล (เช่น NW=0) | แสดง `—` (honest state) |

## 8. Alignment กับ CR-007 (ไม่แตะโค้ด overlay ในรอบนี้)

- Token: เมื่อ WP-2 (OKLCH) ลง ให้ overlay ใช้ผ่าน **alias `--g-*` เดิม** — ห้ามเปลี่ยนค่า
  ที่ตามองเห็น; ค่าคงที่ฝังใน `FullOverlay.tsx` ([`C = {...}`](file:///g:/G-Maiden/src/src/overlay/FullOverlay.tsx#L24)) ให้คงไว้ก่อน จน CR รอบถัดไป
- จุดที่*ควร*ตามใน CR ถัดไป (จดไว้ ไม่ทำตอนนี้): อีโมจิ ⚠️/👁️/🔔/💀 → stroke icon ชุดเดียว
  กับ [`DeckIcons.tsx`](file:///g:/G-Maiden/src/src/DeckIcons.tsx); ฟอนต์ Segoe UI → Plex (ตาม WP-3) โดยต้องวัด FPS ก่อน/หลัง
- Quality tier ของ deck (**ไม่**ใช้กับ overlay) — overlay มีงบ FPS ของตัวเองและ blur 16px
  คือเพดานเดิมที่ผ่านการวัดแล้ว

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0-draft | 2026-07-19 | changelog table added per Step-5 SOP (G1.5) |
