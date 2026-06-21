# Session — 2026-06-21 (turn 2) · Maiden's voice + installer bundles

ต่อจาก `2026-06-21-orchestrator-and-mvp.md`. Focus: ทำ voice/TTS (รายการ TODO ที่ 3)
ให้ใช้งานได้จริง โดยไม่ต้องเปิด Dota 2 verify.

## สิ่งที่ทำ

1. **TTS module** (`src-tauri/src/tts.rs`) — speak() shell-out ไปยัง PowerShell SAPI
   ส่ง Thai text แบบ base64 round-trip ผ่าน arg (กัน codepage/quote escape) แล้วใช้
   `Add-Type -AssemblyName System.Speech` กับ `SpeechSynthesizer`. รันใน
   `std::thread::spawn` (fire-and-forget) + `CREATE_NO_WINDOW` flag เพื่อไม่ให้คอนโซลกระพริบ.
   Zero new Cargo dep (สอดคล้องหลัก Cargo.toml minimal ที่บันทึกไว้ใน todo-next).
2. **Tauri command `speak`** + register ใน `invoke_handler` (`main.rs`).
3. **UI** (`App.tsx`):
   - `voiceEnabled` ใน `Settings` + default `true` + persist localStorage + broadcast event.
   - `DANGER_LINE = 'ถอยก่อนค่ะเพื่อน เลือดเหลือน้อยแล้ว'`.
   - Rising-edge ใน Overlay: speak ครั้งเดียวเมื่อ HP ตกผ่าน threshold; re-arm เมื่อ
     HP > threshold + 5 (กัน flicker); throttle 8s กัน spam.
   - การ์ด Alerts ใน Control GUI: ปุ่ม **🔊 ทดสอบเสียง** + Toggle voiceEnabled
     + ข้อความอธิบาย Windows SAPI (commit `c46ea89`).

## Verify

- `cargo check` ผ่าน (3m 38s warm).
- `pnpm tauri build` ผ่าน (2m 47s release Rust + 40s vite) → **3 artifacts**:
  - `src-tauri/target/release/g-maiden.exe` 10.6 MB
  - `bundle/msi/G-Maiden_0.1.0_x64_en-US.msi`
  - `bundle/nsis/G-Maiden_0.1.0_x64-setup.exe`
- รัน exe → MainWindowTitle = "G-Maiden Overlay" (ทั้งสองหน้าต่างขึ้น).
- POST simulated GSI tick HP=18% → response `ok`; Control GUI การ์ด Live ขึ้น HP สีแดง 18%
  + Crystal Maiden + GSI status เขียว (screenshot ยืนยัน).
- SAPI ทดสอบแยกผ่าน standalone PowerShell + Thai text → ได้ยินเสียงจริง.

## เซอร์ไพรส์ + บทเรียน

1. **WIP `09f9048` ของ user ทำ TTS ไปแล้วระหว่าง session** (เวลา 16:53 หลัง brain note 16:45).
   - session note `2026-06-21-orchestrator-and-mvp.md` เลยล้าสมัยทันทีที่อ่าน.
   - implementation ของผม coincidentally ตรงกับ user เป๊ะ (`base64()` + `Stdio::null` +
     thread::spawn) → diff หลัง Write เหลือแค่ `use std::io::Write` import เกิน.
   - **บทเรียน:** หลังอ่าน brain note ให้ `git log --all --oneline` ก่อนทุกครั้ง.
2. **Bundle = ฟรี.** Tauri v2 default `bundle.targets` ออกทั้ง MSI + NSIS ตอน `tauri build`
   โดยไม่ต้องตั้งค่าเพิ่ม → G8.1 ลดเหลือแค่ icons + GSI cfg auto-install + onboarding.
3. **Cargo.toml CRLF flicker** ขึ้น `M` แม้ไม่ได้แตะ (เหมือนที่ session ก่อนเตือน). `git checkout --` ทิ้งได้.
4. **`pnpm tauri` ต้องรันจาก root** (`G:\G-Maiden\`) — `node_modules/.bin/tauri` อยู่ที่ root,
   ไม่ใช่ใน `src/`. Bash tool คงค่า cwd → ถ้าก่อนหน้า `cd src-tauri` ค้างจะใช้ relative
   `cd src` กลายเป็น `src-tauri/src` ทันที. **กฎ:** absolute path everywhere.
5. **`.brain/` ย้ายไป `.govibe/.brain/`** ใน 09f9048 พร้อมกัน. โครง `.govibe/.agents/` ของ
   user มาเป็นกรอบ multi-agent อีกระดับ — ไม่กระทบงานนี้แต่บันทึกไว้.

## State ปลาย turn

- Branch `main` ahead of origin by 2 commits: `09f9048` (user WIP) + `c46ea89` (my voice UI).
- Working tree clean.
- ยังไม่ push (รอ user สั่ง).
- Next: Piper local TTS (models/ รอแล้ว); installer icons + cfg auto-install; G-Sentry spike.
