# TODO / self-note — next session

อัปเดตล่าสุด: 2026-06-21 · MVP core ใช้งานใน Dota 2 ได้แล้ว (ดู `.brain/session/2026-06-21-*`).

## ต้องให้ผู้ใช้ทำ (ทำแทนไม่ได้)
- [ ] **เปิด Dota 2 จริง** → ยืนยัน overlay ขึ้นข้อมูลสด end-to-end. (verify ที่ทำไปเป็น simulated GSI
      รูปแบบจริง + config ติดตั้งแล้ว → ควรเวิร์กทันที). ถ้าไม่ขึ้น: เช็ค (1) g-maiden รันอยู่ไหม,
      (2) `:3000` ว่างไหม, (3) ไฟล์ cfg อยู่ `D:\Steam\...\dota 2 beta\game\dota\cfg\gamestate_integration\`.

## งานต่อ (เรียงตามคุณค่า)
- [ ] **MSI/NSIS installer** (G8.1) — ตอนนี้เป็น exe เดี่ยว. `pnpm tauri build` (เต็ม) + วาง GSI cfg
      อัตโนมัติ + onboarding. ปัจจุบัน user ต้อง copy cfg เอง/ผมทำให้แล้วเครื่องนี้.
- [ ] **อัปเดต CLAUDE.md** — ยังเขียน "specification stage / ไม่มีโค้ด" (ล้าสมัย). มี codebase แล้ว.
      ระวัง: มี diff ที่ผู้ใช้แก้ค้างก่อน session — อย่า clobber, ถามก่อน.
- [ ] **Voice/TTS จริง** — alert พูดออกเสียง (Piper local ตาม TDD) แทน banner อย่างเดียว.
- [ ] **G-Sentry/G-Motion/G-Signal เต็ม** — ต้อง minimap CV (GSI ไม่ให้ตำแหน่งศัตรู, ดู R-02/R-03).
      ต้องมีเกมจริงทดสอบ. เริ่มจาก spike S-1 (minimap capture + template match).
- [ ] **G-Master advisor** + Gemini persona (cloud brain).
- [ ] Control GUI: ทำการ์ด Modules ให้ toggle ได้จริง + เลือก hotkey เอง + theme.

## เทคนิคที่ค้างรู้ไว้
- รัน dev: `cd G:\G-Maiden; pnpm tauri dev` (Control + overlay). standalone: ดับเบิลคลิก
  `src-tauri\target\release\g-maiden.exe`.
- orchestrator UI: `cd orchestration; node server.mjs` → localhost:4577.
- Cargo.toml ตอนนี้ minimal + axum/tokio/global-shortcut. ออกแบบให้ task หลังเพิ่ม dep ของตัวเอง.
- กับดักทั้งหมดอยู่ใน session note ข้อ "บทเรียน/กับดัก" — โดยเฉพาะ stdin prompt, Tauri capabilities,
  debug-devUrl-vs-release-embed.

## หลักการที่ใช้ได้ผล session นี้
- ทำเอง > spawn agent สำหรับงาน build จริง (เร็ว, คุมคุณภาพได้, agent ติด permission/greeting bug).
- verify ทุกอย่างด้วยการ "รันจริง + screenshot" ไม่เชื่อแค่ compile ผ่าน.
- commit ทีละ milestone บน branch → ff merge → push. ของพัง/draft ไม่ commit.
