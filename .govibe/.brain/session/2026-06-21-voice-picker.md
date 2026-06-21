# Session — 2026-06-21 (turn 5) · SAPI voice picker + rate slider

ต่อจาก `2026-06-21-icon-and-onboarding.md`. Focus: ปรับปรุง voice ที่มีอยู่ก่อน Piper —
ปลด UX bug ตัวใหญ่: บนเครื่องนี้ SAPI default เป็น "Microsoft David" (เสียงผู้ชาย)
ซึ่งฟังไม่เข้า persona ของ Maiden เลย.

## สิ่งที่ทำ (commit `893ea6d`)

### Backend (`tts.rs`)

- **Voice struct** + **`list_voices()`**: รัน `GetInstalledVoices()` ผ่าน SAPI
  ออกมาเป็น pipe-delimited (กัน Format-Table whitespace + codepage), parse กลับ
  เป็น `Vec<Voice {name, culture, gender, age}>`. ไม่ใช้ XML/JSON เพราะ tab/space
  จาก `Format-Table` ถูก trim บางบรรทัด.
- **`speak()`** signature ใหม่: รับ `Option<voice>` + `Option<rate>`:
  - voice ส่งผ่าน base64 เหมือน text — กัน name ที่อาจมี Unicode (Thai voice
    บางตัว) หรือ quote
  - `SelectVoice()` ห่อ try/catch — ถ้า voice ถูกถอนระหว่างทาง fall back เงียบ ๆ
    เป็น system default แทน TTS ใบ้
  - rate clamp `-10..10` ตาม SAPI spec
- **`main.rs`**: เพิ่ม `list_voices` ใน invoke_handler; `speak` รับ optional
  voice/rate.

### Frontend (`App.tsx`)

- `Settings`: เพิ่ม `voiceName: string`, `voiceRate: number` (default 0).
- `VoiceInfo` interface สำหรับ JSON ที่ Rust ส่งกลับ.
- Control mount: เรียก `list_voices` ครั้งเดียว → ถ้า `voiceName` ยังว่าง,
  auto-pick voice แรกที่ `gender === 'Female'`. **บนเครื่องนี้:** Zira ถูกเลือก
  (ไม่ใช่ David ที่เป็น system default) → Maiden ฟังเข้า persona ทันที.
- การ์ด Alerts เพิ่ม 2 rows:
  - 'เลือกเสียง' dropdown แสดงทุก voice (Name + culture + gender ภาษาไทย)
  - 'ความเร็ว' slider `-5..5` step 1 + แสดงค่า `+/-N`
- Warning สีเหลือง: "ตอนนี้ยังไม่มี Thai voice → จะใช้เสียงอังกฤษอ่านข้อความไทย"
  แสดงเฉพาะเมื่อ `voices.length > 0 && voices.every(v => !v.culture.startsWith('th'))`.

### Verify

- `cargo check` clean (1.62s warm).
- `pnpm tauri build` pass → MSI + NSIS + exe.
- Launch → Alerts card แสดง "Microsoft Zira Desktop (en-US, หญิง)" ใน dropdown
  เริ่มต้น, warning สีเหลือง, ปุ่มทดสอบ + slider พร้อม (screenshot ยืนยัน).
- Voice value flow ผ่าน: settings event → Overlay (rising-edge) + Control test
  button ใช้ตัวเดียวกันผ่าน `s.voiceName || null, s.voiceRate`.

## บทเรียน

1. **`GetInstalledVoices()` enum format**: ใช้ pipe-delimited (`"{0}|{1}|{2}|{3}"`)
   มั่นคงกว่า `Format-Table` หรือ JSON (depth ของ VoiceInfo ลึก, ConvertTo-Json
   ทำให้ output เกิน buffer). Parse กลับด้วย `split('|').map(trim)`.
2. **`SelectVoice()` throws** ถ้า voice ถูกถอน — ห่อ try/catch เพื่อ fall back
   เป็น default แทนเงียบหายเสียง. UX ดีกว่า fail loud.
3. **Auto-pick default ตาม persona**: เครื่องส่วนใหญ่ SAPI default = David (ชาย).
   ถ้า persona เป็นหญิง (Maiden) ต้อง override ครั้งแรกเอง. logic อยู่ใน UI
   (เห็นข้อมูล voices มากกว่า backend) — ไม่ต้อง persist ใน backend default.
4. **Rust + Tauri command** รับ `Option<String>` + `Option<i32>` ใช้ `null` จาก
   frontend ตรง ๆ — ไม่ต้อง wrap ใน object.

## State ปลาย turn

- Branch `main` ahead of origin by 8 commits.
- Working tree: เหลือ untracked `orchestration/docs/ADR-O-002` + `SPEC--GOVIBE-INTEGRATION.md`.
- งานต่อ: **Piper local TTS** (เหลือเป็น iteration ใหญ่ — research Thai model ก่อน),
  **G-Sentry minimap CV** (ต้องเกมจริง), **G-Master + Gemini** (cloud + API key).
