# TODO / self-note — next session

อัปเดตล่าสุด: 2026-06-21 (turn 2) · Voice MVP ลง main + MSI/NSIS bundle ออกได้
แล้ว (ดู `.govibe/.brain/session/2026-06-21-voice-and-installer.md`).

## ต้องให้ผู้ใช้ทำ (ทำแทนไม่ได้)
- [ ] **เปิด Dota 2 จริง** → ยืนยัน overlay + voice end-to-end. POST simulated ทดสอบผ่านแล้ว
      (HP=18% → banner + ทาง code path ถึง `speak()`). ถ้าเสียงเงียบ: เช็ค Windows Volume Mixer,
      ลองกดปุ่ม **🔊 ทดสอบเสียง** ใน Control GUI การ์ด Alerts.
- [ ] (ทางเลือก) ติดตั้ง Thai voice ใน Windows → Settings · Time & Language · Speech · Manage
      voices · Add voice "ไทย". ตอนนี้ SAPI จะอ่านไทยด้วยเสียงอังกฤษ (เพี้ยน แต่ได้ยิน).

## งานต่อ (เรียงตามคุณค่า)
- [ ] **Piper local TTS** (TDD) — มาแทน Windows SAPI. `models/.gitkeep` มีไว้รอแล้ว.
      เสียงคุณภาพสูงกว่ามาก + พูดไทยชัด + latency ต่ำกว่า (ไม่ต้องเปิด PowerShell process).
      Spike: `piper-rs` หรือ shell-out `piper.exe` + รุ่น `th_TH-*.onnx`.
- [ ] **MSI installer · the remaining half** — bundle ออกแล้ว (`bundle/msi/...msi`,
      `bundle/nsis/...setup.exe`). เหลือ: (a) custom icons (ตอนนี้ Tauri default), (b) วาง GSI cfg
      อัตโนมัติตอนติดตั้ง (WiX custom action / NSIS), (c) onboarding หน้าแรกอธิบายว่าเปิด Dota 2 รอบแรก
      ต้องรีสตาร์ทเพื่อให้ GSI โหลด.
- [ ] **G-Sentry/G-Motion/G-Signal เต็ม** — ต้อง minimap CV (GSI ไม่ให้ตำแหน่งศัตรู, ดู R-02/R-03).
      ต้องมีเกมจริงทดสอบ. เริ่มจาก spike S-1 (minimap capture + template match).
- [ ] **G-Master advisor** + Gemini persona (cloud brain).
- [ ] อัปเดต CLAUDE.md — "specification stage" ล้าสมัย (มี codebase แล้ว). 09f9048 ตัด govibe
      sibling note ไปแล้ว → ไม่เร่ง. ขอ confirm ก่อนเขียนทับ.
- [ ] Control GUI: การ์ด Modules ให้ toggle ได้จริง + เลือก hotkey เอง + theme.

## เทคนิคที่ค้างรู้ไว้
- รัน dev: `cd G:\G-Maiden; pnpm tauri dev` (ที่ root, **ห้าม cd src ก่อน** — tauri CLI อยู่
  `node_modules/.bin/` ของ root). standalone: ดับเบิลคลิก `src-tauri\target\release\g-maiden.exe`.
- Test voice แยก: `pnpm tauri dev` แล้วกดปุ่ม **🔊 ทดสอบเสียง** ในการ์ด Alerts; หรือ
  POST simulated HP=18% tick ไป `http://127.0.0.1:3000/gsi` (rising-edge → speak ครั้งเดียว;
  re-arm เมื่อ HP > threshold+5).
- ทุก path ใช้ absolute (`G:\G-Maiden\...`) เพราะ Bash tool persistent cwd หลง dir ได้.
- ไฟล์ brain ปัจจุบันอยู่ที่ `.govibe/.brain/` (commit 09f9048 ย้าย). **ไม่ใช่** `.brain/` เดิม.

## ⚠️ กับดักใหม่จาก turn นี้
1. **ดู `git log --all --oneline` ก่อนเชื่อ session note** — user/agent อื่นอาจ commit ระหว่าง
   session ทำให้ note ล้าสมัย. turn นี้ผมเขียน `tts.rs` ใหม่หมดโดยไม่รู้ว่า user มี
   commit `09f9048` ที่ทำ TTS ไปแล้ว (โชคดี implementation ตรงกันเป๊ะ → diff เหลือแค่
   `use std::io::Write` import เกิน).
2. **Status `M` แต่ `git diff` ว่าง = CRLF flicker** (session ก่อนก็เจอ). `git checkout --` ทิ้ง
   ได้เลย. turn นี้ Cargo.toml ขึ้น M แม้ไม่ได้แตะ.
3. **Tauri v2 `pnpm tauri build` ออก MSI + NSIS ฟรี ๆ** ไม่ต้องตั้งค่าเพิ่ม (WiX + makensis รันให้
   อัตโนมัติ) เพราะ tauri.conf.json default bundle config ออกครบ. แต่ใช้ default icon ของ Tauri
   → ดูไม่ pro.
4. **Computer-use Bash tool คงค่า cwd** ข้าม call — `cd src` แล้วต่อ `cd src` กลายเป็น `src/src`.
   ใช้ absolute path หรือ `cd /g/G-Maiden && ...` ทุกครั้ง.

## หลักการที่ใช้ได้ผล (สะสม)
- ทำเอง > spawn agent สำหรับงาน build/integration จริง.
- verify ด้วย "รันจริง + screenshot + simulated POST" — ไม่เชื่อแค่ compile ผ่าน.
- ลด component ที่จำเป็นในแต่ละ iteration: Windows SAPI (zero dep) ก่อน Piper (ONNX dep + model).
- ทุก milestone commit ตัวเอง (ไม่ pile up); branch main OK ถ้าโต้ตอบไม่ได้กระทบ user.
