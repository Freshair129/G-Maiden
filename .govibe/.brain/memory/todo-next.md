# TODO / self-note — next session

อัปเดตล่าสุด: 2026-06-21 (turn 10) · unit tests 3 → 11 (gsi + setup + tts ครอบครัวเดิม)
(ดู `.govibe/.brain/session/2026-06-21-tests-expand.md`).

## ต้องให้ผู้ใช้ทำ (ทำแทนไม่ได้)
- [ ] **เปิด Dota 2 จริง** → ยืนยัน overlay + voice end-to-end. POST simulated ทดสอบผ่านแล้ว
      (HP=18% → banner + ทาง code path ถึง `speak()`). ถ้าเสียงเงียบ: เช็ค Windows Volume Mixer,
      ลองกดปุ่ม **🔊 ทดสอบเสียง** ใน Control GUI การ์ด Alerts.
- [ ] (ทางเลือก) ติดตั้ง Thai voice ใน Windows → Settings · Time & Language · Speech · Manage
      voices · Add voice "ไทย". UI จะเด้งโชว์ใน dropdown 'เลือกเสียง' อัตโนมัติ และ warning
      สีเหลืองจะหายไป.

## งานต่อ (เรียงตามคุณค่า)
- [ ] **Piper local TTS** (TDD) — เป้าหมายระยะถัดไป. ตอนนี้ SAPI + voice picker (commit
      `893ea6d`) เพียงพอแล้วถ้า user ติดตั้ง Thai voice เพิ่ม. Piper ยังคุ้มสำหรับ:
      (1) เสียงคุณภาพ neural แทน formant-synth, (2) latency in-process (~20ms vs ~200ms),
      (3) ใช้บน G-Signal hard-path ตอนทำ gank warning. ต้อง spike: หา Thai voice
      ที่ใช้ได้จริง (community model?) + เลือก `piper-rs` (ONNX dep) vs shell-out
      `piper.exe`.
- [x] ~~**MSI installer**~~ — ✅ จบ G8.1 (commit `ac56d87`): ice-gem icon ลง bundle ทุกขนาด,
      Welcome modal 2-step (auto-detect + auto-install) + 'gm-onboarded' localStorage flag.
      เหลือเทสต์ใน Dota 2 จริง = งาน user.
- [ ] **G-Sentry/G-Motion/G-Signal เต็ม** — ต้อง minimap CV (GSI ไม่ให้ตำแหน่งศัตรู, ดู R-02/R-03).
      ต้องมีเกมจริงทดสอบ. เริ่มจาก spike S-1 (minimap capture + template match).
- [ ] **G-Master advisor** + Gemini persona (cloud brain).
- [ ] อัปเดต CLAUDE.md — "specification stage" ล้าสมัย (มี codebase แล้ว). 09f9048 ตัด govibe
      sibling note ไปแล้ว → ไม่เร่ง. ขอ confirm ก่อนเขียนทับ.
- [ ] Control GUI: การ์ด Modules ให้ toggle ได้จริง + เลือก hotkey เอง + theme.
- [x] ~~**Bug `in_game` INIT**~~ — ✅ จบใน turn 9 (commit `22a8572`): จับเฉพาะ
      PRE_GAME / GAME_IN_PROGRESS + unit tests แรกของโปรเจกต์ (3 ผ่าน).

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
