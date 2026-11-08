---
version: "1.0.2"
created_at: "2026-07-09T00:00:00+07:00,Fable"
last_update: "2026-07-09T00:00:00+07:00,Fable"
status: "active"
attributes:
  domain: "ui-ux"
  scope: "Combat HUD (in-game overlay) — design contract อิง implementation จริง"
  language: "th/en"
title: "07 — Combat HUD (In-game Overlay)"
doc_id: "07-combat-hud"
updated: "2026-11-08"
owner: "Boss"
---

# 07 — Combat HUD (In-game Overlay)

> The original CR-007 presentation notes below are a historical baseline. The current layout
> decision is recorded in section 5.1 (owner direction, 2026-11-08).
> Current sources: [`Overlay.tsx`](../../src/src/app/Overlay.tsx),
> [`FullOverlay.tsx`](../../src/src/overlay/FullOverlay.tsx),
> [`modules.ts`](../../src/src/overlay/modules.ts), and the in-app
> [`OverlayLayoutEditor.tsx`](../../src/src/overlay/OverlayLayoutEditor.tsx).

## 1. หลักการ (สืบจาก [[01-foundations|01-foundations]] §3)

1. **Passive + click-through เสมอ** — ผู้เล่นห้ามรู้สึกว่ามี "หน้าต่าง" อยู่บนเกม
2. **ห้ามบัง** minimap / skill bar (NFR). The owner-selected stat row is top-left;
   the announcer banner is top-centre below the game announcement line. Other notification
   defaults retain the right rail. See section 5.1 for measured reference bounds.
3. **ห้ามยก chrome ของ Deck มาใส่** — overlay แชร์เฉพาะ token (สี/type/สถานะ)
4. **งบ FPS ≤3%**: blur จำกัดที่ 16px (เทียบ deck 30px), ไม่มี ambient animation,
   transition เฉพาะ state change 200ms
5. **เงียบเป็นค่าเริ่มต้น ดังเมื่ออันตราย** — โมดูลข้อมูล opacity ตาม user setting,
   banner เตือนใช้ opacity สูงกว่า (0.82–0.88) เสมอ

## 2. Current presentation

Settings normalize `uiMode` to `full`; `Overlay` renders `FullOverlay`. Each module has its
own position, scale and enabled flag. GSI-only Lite operation means unavailable CV, not a
second overlay renderer. Announcer media renders in the separate native GANN surface.

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

### 5.1 Owner layout decision — 2026-11-08

Coordinates are centre-anchored screen percentages. `score` is disabled by default; every
other entry below is enabled. All other `DEFAULT_LAYOUT` entries retain their #91 values.
No other module needs moving to avoid an overlay-module collision.

| Module | x | y | scale | Basis |
| --- | --- | --- | --- | --- |
| `clock` | 4 | 4 | 1 | Explicit owner-selected pre-#91 stat row |
| `kda` | 9.5 | 4 | 1 | Same row |
| `gold` | 15 | 4 | 1 | Same row |
| `gpm` | 20.5 | 4 | 1 | Same row |
| `nw` | 26 | 4 | 1 | Same row |
| `companion` | 93.2 | 3.4 | 0.8 | Target card approximately x759–824/y5–27 in the 849×475 image |
| `banner` | 50 | 13 | 0.45 | Native 306×134px at 1920×1080; top ≈73px, just below the hero-bar lane labels (owner 2026-11-08) |
| `gmeter` | 7.5 | 71 | 0.9 | Directly above the minimap (owner 2026-11-08) |
| `xpm` | 31.5 | 4 | 1 | Enabled; continues the top-left stat-chip row (owner 2026-11-08) |
| `score` | 84.5 | 13 | 1 | Disabled by default (owner 2026-11-08) |

Evidence: owner-supplied `target-20261101.png` and `current-after-reset-20261108.webp`
in the git-excluded `.codex-evidence/` directory; these private captures are not published
with the documentation. The target supports the top-left row and top-right presence;
its downscaled row is not an exact pixel verification of the explicitly supplied stat centres.

At `BOX_REF` 1920×1080, the companion's 190×64 box at scale 0.8 has edges
x89.24–97.16%, y1.03–5.77%. The banner's 320×190 reference box at scale 0.7 is
224×133px, with edges x44.17–55.83%, y10.34–22.66% (top 111.7px, bottom 244.7px).
That reference top clears the captured first-blood line at approximately y80–101px.
The broad editor HUD regions intentionally still warn about the owner-selected top strip,
presence and banner; `hudOverlaps` reports warnings and does not suppress rendering.

**Native geometry remains a separate unresolved check:** `gann_native_windows.rs` currently
uses a 680px reference width and the media aspect ratio, not `MODULE_BOX`. The reference-box
clearance above is not proof of native banner clearance. Aligning those geometries would
also resize customized banners and requires the pending owner decision and native validation.

Persisted modules migrate only when all four fields (`x`, `y`, `scale`, `enabled`) exactly
equal any frozen historical default: pre-#91, #91 through source `6a26d628`, or the older
banner/standby defaults. `settingsSchema.ts` cites the source commits for each frozen table.
The destination is the current `DEFAULT_LAYOUT`; customized modules retain their values.
This applies to saved settings and layout-bearing profiles, including the owner's reset
banner `{89,44,0.7,true}`. Reapplying the migrated snapshot is idempotent.

Visibility remains separate from placement: FullOverlay uses `layout.enabled`, not legacy
`showTimer`/`showKda`/`showGold`. Companion requires an active match; stat chips also require
a fresh tick supplied by `Overlay`. The native banner can render independently of WebView
content. The supplied screenshot establishes missing chips, but does not establish which
runtime gate or native-window failure caused them. Render regressions cover both FullOverlay
and the settings/event path; live diagnosis and acceptance remain pending.

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
  ที่ตามองเห็น; ค่าคงที่ฝังใน `FullOverlay.tsx` ([`C = {...}`](file:///g:/G-Maiden/src/src/overlay/FullOverlay.tsx#L30)) ให้คงไว้ก่อน จน CR รอบถัดไป
- จุดที่*ควร*ตามใน CR ถัดไป (จดไว้ ไม่ทำตอนนี้): อีโมจิ ⚠️/👁️/🔔/💀 → stroke icon ชุดเดียว
  กับ [`DeckIcons.tsx`](file:///g:/G-Maiden/src/src/DeckIcons.tsx); ฟอนต์ Segoe UI → Plex (ตาม WP-3) โดยต้องวัด FPS ก่อน/หลัง
- Quality tier ของ deck (**ไม่**ใช้กับ overlay) — overlay มีงบ FPS ของตัวเองและ blur 16px
  คือเพดานเดิมที่ผ่านการวัดแล้ว

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0-draft | 2026-07-19 | changelog table added per Step-5 SOP (G1.5) |
| 1.0.0 | 2026-11-06 | status `draft` → `active`: referenced as the design SSOT (CLAUDE.md, code and sibling docs) and describes the shipped deck; not marked accepted because no owner approval is recorded |
| 1.0.1 | 2026-11-06 | relinked 1 code symbol anchor(s) to the symbol's current definition (or dropped the line anchor where the symbol no longer exists) — no content change |
| 1.0.2 | 2026-11-08 | Record owner-selected default positions, measured reference edges, exact historical-default migration, render gates and unresolved native geometry/runtime evidence. |
