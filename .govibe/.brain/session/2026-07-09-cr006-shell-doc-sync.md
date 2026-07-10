# Session 2026-07-09 - CR-006 shell sync เข้า main + ปิดรอบเอกสาร

## Entry point
ปิดงาน CR-006 ฝั่ง UI shell/design-system หลัง user ไล่แก้ layout จริงจาก screenshot หลายรอบ จนสุดท้าย merge เข้า `main` แล้วต้องทิ้งบันทึกที่ใช้ต่อรอบหน้าได้จริง

## Arc
รอบนี้เริ่มจากงาน layout/control-window ที่ user ไม่ได้ต้องการ “ดีไซน์ใหม่” แต่ต้องการให้ shell ของ Command Deck ฟิตกับภาพอ้างอิงจริงทีละจุด โดยเฉพาะ subtract rim, L1 white glass plate, topbar island, sidebar/power zone, และการจัด layer ให้สื่อสารกันได้แบบ A/B/C/D มากกว่าคุยกันเชิง CSS ล้วน ๆ

สิ่งที่ยากจริงไม่ใช่แค่ค่าพิกัด แต่เป็นการที่ CR-006 เคยมีหลายระบบเรขาคณิตซ้อนกัน: legacy shell, CSS ทดลองหลายรอบ, scaled stage, และ mock/spec ที่ drift จากโค้ดจริง ทำให้พอแก้จุดหนึ่ง อีกจุดจะเละตามได้ง่ายมาก ผู้ใช้จึงบังคับทิศทางหลายครั้งให้ “กลับมาดูภาพจริงก่อน”, “เช็กบน html/screenshot ก่อนค่อย build”, และ “อย่าเผลอเปลี่ยน layout ownership ระหว่างแก้ cosmetic”

ปลายรอบจึงเปลี่ยนโฟกัสจาก “ไล่ polish ต่อ” มาเป็น “ล็อกของจริงให้ตรงกัน”: เอา shell ที่ผู้ใช้ยอมรับแล้วขึ้น `main`, เขียน RCA ของ regression/geometry drift, แล้ว rewrite design-system docs ให้ตรงกับ live UI แทนการคง mock เก่าที่ทำให้ session ถัดไปหลงทิศ

มี build หลายรอบเพื่อให้ user เปิด exe ตรวจจริงบน Desktop ได้ และมีรอบคัดลอก artifact ไป Desktop พร้อมแก้ปัญหาไฟล์ถูก Explorer ล็อก แต่ release-signing ยังทำ local ไม่ได้ตามเดิมเพราะไม่มี `TAURI_SIGNING_PRIVATE_KEY` ใน env ซึ่งเป็นข้อจำกัดที่รู้แล้ว ไม่ใช่ blocker ใหม่

ปลาย session งานโค้ดหลักถือว่าจบที่ shell + docs sync เข้า `main`; สิ่งที่ยังค้างจริงเหลือแค่งาน polish เฉพาะจุด โดยเฉพาะ power radial placement/shape ซึ่ง user ยังมองว่าเป็น defect แยก ไม่ใช่เหตุให้รื้อ shell ใหญ่ทั้งก้อนอีกรอบ

## สิ่งที่ทำ
- UI / control window
  - `src/src/CommandDeck.tsx` - ปรับ CR-006 shell geometry, topbar/sidebar/audio/power layout, และ ownership ของ section ต่าง ๆ ให้ตรงกับรอบ review สุดท้าย (`17214968`)
  - `src/src/styles.css` - sync shell tokens/spacing/radii/glass treatment ให้ตรงกับ live shell (`17214968`)
- Design system / docs
  - `docs/design-system/03-layout.md` - rewrite ให้สะท้อน shell ปัจจุบันบน `main` ไม่ใช่ mock เก่า (`189eb2e5`)
  - `docs/design-system/04-components.md` - rewrite component inventory ให้ตรงกับของที่ render อยู่จริง (`189eb2e5`)
  - `docs/design-system/assets/cr006-layer-dev-overlay.svg` - อัปเดต layer/dev overlay ให้สื่อสาร L0/L1/L2/L3/L4 ตาม shell ปัจจุบัน (`189eb2e5`)
- RCA
  - `.brain/rca/2026-07-09-cr006-shell-disable-regression.md` (`189eb2e5`)
  - `.brain/rca/2026-07-09-cr006-subtract-rim-layout-instability.md` (`189eb2e5`)
  - `.brain/rca/2026-07-09-design-system-cr006-doc-drift.md` (`189eb2e5`)
- Build / artifacts
  - สร้าง exe/msi/nsis หลายรอบจาก repo ปัจจุบันเพื่อตรวจ UI จริง
  - คัดลอก artifact ไป Desktop ให้ user เปิดตรวจ

## Verify
- `pnpm -C src build` - ผ่านในรอบ build ก่อนเข้าสเต็ป bundle/exe
- `pnpm tauri build` - build ไปถึงขั้น bundle artifact ได้ แต่จบไม่สมบูรณ์ที่ signing step เพราะ local env ไม่มี `TAURI_SIGNING_PRIVATE_KEY` (คาดหมายได้ ไม่ใช่ regression)
- Visual verify - ใช้ screenshot/exe review กับผู้ใช้จริงหลายรอบจน shell หลักยอมรับได้ก่อน merge docs ตาม
- **ไม่ได้รัน** `cargo test`, `cargo clippy`, `pnpm -C src test`, `npx tsc --noEmit` ในช่วงปิดรอบนี้ เพราะงานช่วงท้ายเป็น UI shell/doc sync + artifact verify เป็นหลัก

## Key numbers / results
- commit ที่ขึ้น `main` ในรอบนี้
  - `17214968` - `feat(ui): refine CR-006 command deck shell`
  - `189eb2e5` - `docs(design-system): sync CR-006 shell spec and RCA`
- branch ปัจจุบันตอนปิดรอบ: `main` ตรงกับ `origin/main`
- artifact บน Desktop ล่าสุดที่ใช้เปิดตรวจจริง
  - `C:\Users\freshair\OneDrive\เดสก์ท็อป\G-Maiden-cr006-layout-session.exe`
  - `C:\Users\freshair\OneDrive\เดสก์ท็อป\G-Maiden-cr006-layout-session-20260709-1008.exe`
  - `C:\Users\freshair\OneDrive\เดสก์ท็อป\G-Maiden_0.8.0_x64-setup-cr006-layout-session.exe`

## Artifacts / live actions
- เอกสาร/ไฟล์ที่เปลี่ยนตามรายการด้านบน
- ไม่มี migration / Supabase change / Edge Function deploy / live DB mutation
- มีการคัดลอก build artifact ไป Desktop และเคลียร์ Explorer file lock เพื่อแทนที่ไฟล์เดิม

## State ปลาย turn
- branch: `main`
- remote state: sync กับ `origin/main`
- working tree หลังงานปิดรอบนี้ควรเหลือเฉพาะ brain/memory writes ของ end-session และไฟล์ temp ที่ยังไม่ได้ตัดสินใจลบ
- leftover ที่ตั้งใจไม่แตะอัตโนมัติ: `tmp-power-radial-check.html`
- pending จริง
  1. แก้ power radial placement/shape แบบ surgical โดยไม่รื้อ shell geometry ทั้งก้อน
  2. verify shell ปัจจุบันบน exe จริงอีกครั้งหลังงาน polish จุดสุดท้าย
  3. ถ้าจะเดินต่อเรื่อง CPU/perf หรือ visual polish ให้ยึด docs/design-system ที่ rewrite รอบนี้เป็นฐาน ไม่ย้อนกลับไปอ้าง mock เก่า
