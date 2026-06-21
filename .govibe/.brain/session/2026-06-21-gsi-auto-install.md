# Session — 2026-06-21 (turn 3) · GSI config auto-install

ต่อจาก `2026-06-21-voice-and-installer.md`. Focus: ลด G8.1 (installer) ให้เหลือแค่งานคอสเมติก
ด้วยการทำ GSI cfg auto-install — UX friction หลักที่เหลืออยู่จาก turn ก่อน.

## สิ่งที่ทำ (commit `08882e6`)

1. **`src-tauri/src/setup.rs`** (ใหม่, ~145 บรรทัด, zero new Cargo dep):
   - `read_steam_path()` — `reg query HKCU\Software\Valve\Steam /v SteamPath` →
     parse บรรทัด `REG_SZ` คืน `PathBuf`. Valve เก็บด้วย forward slash
     ("d:/steam") — std::path บน Windows รับได้.
   - `find_dota_library(steam)` — สแกน `<steam>/steamapps/libraryfolders.vdf` ทีละบรรทัด;
     จับ `"path"` ล่าสุดเป็น state, คืนเมื่อพบบรรทัดที่ขึ้นต้น `"570"` (Dota 2 appid).
     ไม่ต้อง full VDF parser.
   - `detect()` / `install()` — สถานะแบบ struct serde + เขียน cfg แบบ idempotent.
     ทุก error path มีข้อความไทยชี้ชัด (Steam ไม่มี / Dota ไม่มี / fs error).
2. **Tauri commands**: `detect_gsi_setup`, `install_gsi_config` (return SetupStatus).
3. **`SetupCard`** ใน Control GUI: auto-detect on mount; แสดง 🟢/🟡 + Steam path +
   Dota cfg dir + ปุ่มติดตั้ง/ติดตั้งซ้ำ + ข้อความสถานะ. แทนที่ตำแหน่งเดิมของการ์ด
   Modules; Modules ย้ายลงเป็นแถบล่างเต็มแถว (placeholder จนกว่าจะมีของจริง).

## Verify

- `cargo check` — clean (1.66s warm).
- `pnpm tauri build` — pass (release Rust + vite). MSI + NSIS bundle ออกครบ
  (`G-Maiden_0.1.0_x64_en-US.msi`, `G-Maiden_0.1.0_x64-setup.exe`).
- Launch release exe → SetupCard แสดง:
  - 🟢 "GSI config พร้อมใช้งาน"
  - Steam: `d:/steam` (มาจาก registry ตรง ๆ ตามที่ Valve เขียน)
  - Dota 2 cfg: `D:\steam\steamapps\common\dota 2 beta\game\dota\cfg\gamestate_integration`
  - ปุ่ม "ติดตั้งซ้ำ" (เพราะ cfg อยู่แล้ว)
  - **screenshot ยืนยันครบทุกฟิลด์ตรงกับ Dota 2 จริงบนเครื่อง user.**
- install path ทดสอบผ่าน static review + cargo check; ไม่ได้กดปุ่มซ้ำ (เพราะ idempotent +
  cfg อยู่แล้ว ไม่อยากเสี่ยง permission denied นอกเหนือ scope).

## บทเรียน

1. **VDF parsing แบบ "stateful line scan"** เพียงพอกับ Steam ทุกครั้ง:
   ติด `"path"` ล่าสุดไว้, คืนเมื่อเจอ `"570"`. ไม่ต้อง crate `keyvalues-serde` หรือ
   parser เต็ม. ทำงานได้ทั้ง 1 library และหลาย library.
2. **`reg query` shell-out > `winreg` crate** — สำหรับ read อย่างเดียวที่ใช้ไม่กี่ครั้ง
   pattern ที่ใช้กับ TTS (PowerShell SAPI) คงไว้ได้ — zero new dep + line parsing ง่าย ๆ.
3. **Tauri `#[tauri::command]` คืน struct ได้โดยตรง** ถ้า impl `Serialize` (Clone ไม่จำเป็น
   แต่ใส่ไว้เผื่อใช้ในอนาคต). ไม่ต้องห่อ `Result` ถ้าผู้ใช้รับสถานะผ่าน field
   ในที่นี้เก็บข้อความ error ใน `message` แทน throw — UX ดีกว่าให้ frontend handle.
4. **CRLF flicker** ขึ้นซ้ำกับ Cargo.toml (ไม่ได้แตะแม้แต่ช่อง). `git checkout --` ทิ้งทุก turn.

## State ปลาย turn

- Branch `main` ahead of origin by 4 commits (รวม brain + voice + setup + brain).
- Working tree: untracked `orchestration/docs/ADR-O-002--govibe-integration.md` +
  `SPEC--GOVIBE-INTEGRATION.md` (งานคู่ขนานของ user, ไม่แตะ).
- Next: Piper local TTS (เสียงไทยจริง), custom installer icons, onboarding wizard,
  G-Sentry/Signal minimap CV spike.
