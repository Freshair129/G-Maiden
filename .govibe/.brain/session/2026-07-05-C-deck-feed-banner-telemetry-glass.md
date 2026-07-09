# Session 2026-07-05 (C) — deck: signals→grid, caster feed, event banner, telemetry rail, topbar, flatten pass

> ต่อจาก 2026-07-05 (B). เขียนปิด 2026-07-06. Branch `feat/deck-glass-redesign-ds` (ยังไม่ merge/tag).

## Entry point
User: **"แก้ ui ที่พังต่อ"** บน branch deck redesign เดิม แล้วไล่แก้/เพิ่มทีละจุดตาม feedback จนจบที่ flatten pass + วางแผน glass-transparency.

## Arc (เล่าเหตุ + บทเรียน)
1. **Port drift + pregame minimap** — vite `strictPort:false` ดริฟต์หลุด :5173 ชนกับ `tauri.conf devUrl`+preview → **pin strictPort :5173** (launch.json ก็ 5173). Pregame minimap เดิมโชว์ terrain radial-gradient เป็น "ก้อนเทา 3 ก้อน" → fade + placeholder **"WAITING FOR MATCH"**.
2. **G-Signal sector "ลอย" — แก้ผิด 2 รอบก่อนเจอ root cause** (บทเรียนใหญ่, มี RCA แยก `.govibe/.brain/rca/2026-07-05-deck-signal-sector-float.md`). ต้นเหตุจริง: signal cards เป็น **FAB `position:absolute` นอก grid** ทับช่อง `gsignal` grid-area ที่จองไว้ (`styles.css:3385`). รอบ 1 ลบ notch (frost≈void มองไม่เห็น), รอบ 2 ทำ flat (จางลงแต่ไม่ align) — **user ชี้เอง "แบ่ง sector ตาม grid"** → ย้าย render เป็น `.gsignal-bento` grid cell จริง. **บทเรียน: element ดูผิดที่ → เช็ค layout ownership (grid/flow vs absolute) ก่อนแต่ง cosmetic** ([[structure-before-cosmetic]]).
3. **user เตือน "เช็คก่อนส่ง" 2 ครั้ง** → เปลี่ยนมา verify ด้วย `getBoundingClientRect`/`offset*` เทียบ sibling + screenshot ทุกครั้งก่อนรายงาน.
4. **Agent caster feed** — จุด "Tactical AI" เดิม → sliding-window: Maiden พิมพ์ (typewriter+caret) บรรทัดใหม่ดันเก่าขึ้นจาง. ยังไม่มี event narration จริง → demo วน persona lines (เผื่อต่อ `agent-message`).
5. **Announcer event banner** (First Blood/Double Kill/streak) — ทำที่มินิแมพก่อน → user ให้ย้าย **เข้า Agent sector เหนือ feed** → **center ครึ่งซ้าย** → **แยกออกจาก feed (absolute, ไม่ยุบตามข้อความ) + ครึ่งกลางแนวตั้ง + grid col 2** → user ให้ **ขึ้น 10% (top 40%)** + **wire จริง**: listen `announcer-banner` Tauri event (`event` id ครอบ kill+streak ทั้งชุด, tone blood/gold/fire), demo เป็น fallback ตอนไม่มี Tauri.
6. **Minimap ทับ Companion state** — `.minimap-bento` grid item มี `min-height:auto` (content ~620px) > cell (~531px) → ล้นทับแถว 3 ~80px. Pin **`min-height:0 !important`** → map flex-shrink พอดี, slots ครบ.
7. **Restructure left rail + telemetry** (user): เอา G ออกจาก sidebar, sidebar ลงล่าง (top 300), **panel top-left ยืดลง (nlt 216→286)**, **P1=logo** (codex ออกแบบ icon เกล็ดหิมะ+G, inline `LogoMark`), **P2-P5=telemetry** ย้ายจาก topbar (CPU load+temp/RAM/GPU load+temp/VRAM). Topbar หด (ntw 348→256→324).
8. **Topbar features + fixes** (user + ref images): **version ใต้ G-MAIDEN** (`getVersion()`), **ปุ่ม update** (updater `check()`, status=toast กัน topbar โต), **กระดิ่ง+dropdown** (sample feed). **แก้ drag พัง** — capability `core:window:allow-start-dragging` หาย → เพิ่ม + `startDragging()` บน topbar. **แก้ topbar/notch ซ้อน** — topbar 300px แต่ notch 256 → ยื่น 49px → ntw 324.
9. **Flatten pass 1** (user เลือก "flatten ก่อน แล้วค่อย transparency"): panel = ดำแบนสีเดียว `rgba(18,20,26,.72)` (เลิก gradient ฟ้า) + ตัดเงา; bento-card แบน (`rgba(255,255,255,.025)`+เส้นบาง) ตัด gloss/เงา/tilt-3D; lime คงเดิม.

## สิ่งที่ทำ (commit)
- `c010e517` port pin :5173 + pregame minimap placeholder
- `27363cdd` 3rd Subtract notch + power radial menu · `33ae6603`/`eb52bf21`/`b77445f4` signals grounded → **เข้า grid** · `060382d3` RCA doc
- `a573ffef` raise content top band beside P1 · `e08a1fea` agent caster feed
- `32d3e907`→`643d0ea8` event banner (สร้าง→เข้า agent sector→ครึ่งซ้าย→detach) · `36219c8f` **wire announcer-banner + raise 10%**
- `c133c22e` minimap overlap fix (`min-height:0`)
- `2be6f4b7` **P1 logo tile + P2-P5 telemetry rail** · `c8de30b8` **topbar version/bell/update + drag/notch fix** · `d3b14d4a` **flatten pass 1**
- **PR #8** เปิดแล้ว: https://github.com/Freshair129/G-Maiden/pull/8

## Verify (ที่รันจริง)
- `npx tsc --noEmit` (จาก `src/`) — **ผ่าน** ทุกรอบ (หลายครั้ง)
- preview geometry ผ่าน `preview_eval` — ทุก layout fix (notch corners, overlap gaps, banner center, telemetry cell fit "100% 64°")
- screenshot — **ทำงานช่วงต้น** (หลัง fix port + dispatch resize) แต่ **timeout ช่วงท้าย** (subsystem, หน้า render ปกติ verify ด้วย eval) → flatten pass **ยังไม่เห็นภาพจริง** (verify computed styles อย่างเดียว)
- **ไม่ได้รัน** `cargo test` / clippy / lint (งาน frontend ล้วน; capability json แก้แต่ยังไม่ build)

## Key numbers / artifacts
- **Desktop build สำเร็จ** (exit 0, 11m49s): `src-tauri/target/release/bundle/{msi,nsis}/G-Maiden_0.8.0_*` — **แต่ build ตอนโค้ด `c133c22e`** = ยังไม่มี logo/telemetry/topbar/flatten. drag/version/bell/update **ทดสอบได้เฉพาะ desktop → ต้อง rebuild**.
- codex ออกแบบ logo P1 (snowflake+G, ice+lime) → inline `LogoMark` ใน CommandDeck.
- ไฟล์แตะหลัก: `src/src/CommandDeck.tsx`, `Dashboard.tsx`, `styles.css`, `companion.ts`(อ่าน), `vite.config.ts`, `src-tauri/capabilities/default.json`.

## State ปลาย turn
- Branch `feat/deck-glass-redesign-ds`, **ahead origin 3** (2be6f4b7/c8de30b8/d3b14d4a) — จะ push ตอนปิด session.
- Tree สะอาด ยกเว้น `docs/design-system/08-real-progress.md` (untracked, ไฟล์ scratch memory-card ซูชิ — ไม่ใช่ของ session นี้, ไม่ commit).
- **ไม่มี live action** (ไม่แตะ gstore DB/Edge Fn).
- **Pending/deferred:** (1) **glass ทะลุ desktop = window `transparent:true`** — architectural, verify ต้อง rebuild, user เลือกทำทีหลัง. (2) de-nest sub-card ชั้นในลึกกว่านี้. (3) flatten pass 1 **ต้อง eyeball** ว่า contrast จางไปไหม. (4) **rebuild desktop** เพื่อทดสอบ drag/version/bell/update + เห็น flatten จริง. (5) notification bell = sample feed, ยังไม่ wire จริง. (6) agent caster feed = demo, ยังไม่มี narration event จริง.
