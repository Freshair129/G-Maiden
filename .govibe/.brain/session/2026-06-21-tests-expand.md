# Session — 2026-06-21 (turn 10) · ขยาย unit tests 3 → 11

ต่อยอด testing foundation จาก turn 9 (gsi tests). คุม logic 2 ตัวที่ critical แต่ silent-fail
ได้ง่าย: `tts::base64` (Thai TTS pipeline) + `setup::parse_dota_library` (install detector).

## สิ่งที่ทำ (commit `072dc60`)

### `setup.rs` — refactor + 5 tests

- **Extract** `parse_dota_library(text: &str) -> Option<PathBuf>` แยกจาก I/O
  wrapper `find_dota_library(steam: &PathBuf)`. pure function → unit-testable
  โดยไม่ต้อง mock filesystem.
- 5 test cases:
  - `parses_single_library`: VDF fixture เหมือนเครื่อง user (D:\\steam, 1 library)
  - `picks_correct_library_when_dota_is_in_the_second`: VDF 2 library; Dota
    อยู่ใน "1" — ทดสอบ block-boundary tracking ว่า returns E:\\SteamLibrary
    ไม่ใช่ C:\\Program Files (x86)\\Steam
  - `returns_none_when_dota_not_installed`: VDF ไม่มี 570 → None
  - `returns_none_on_empty_or_malformed_vdf`: 3 sub-cases (empty, lone "570"
    without prior path, path without 570)
  - `cfg_dir_layout_is_dota_specific`: assert path ลงท้าย
    `\steamapps\common\dota 2 beta\game\dota\cfg\gamestate_integration` —
    กัน rename layout

### `tts.rs` — 3 tests

- `base64_matches_powershell_for_ascii`: 7 vectors ตรงกับ
  `[Convert]::ToBase64String` (empty, 1-pad, 2-pad, no-pad ครอบทุก padding case)
- `base64_handles_thai_utf8_bytes`: "ถอยก่อน" → "4LiW4Lit4Lii4LiB4LmI4Lit4LiZ"
  — verify มือทั้ง hex bytes (E0 B8 96 / E0 B8 AD / ฯลฯ) และ base64 sextet-by-sextet
  vs PowerShell expression. ถ้า encoder drift → SAPI พูดผิดเงียบ ๆ — test นี้คือ
  guard.
- `base64_no_panic_on_arbitrary_bytes`: 513-byte cycle (0..255 ซ้ำ) — แตะทุก
  chunk-length branch (1/2/3) + assert ceil(n/3)*4 + padding ≤ 2

### Result

| File          | Tests | Status |
|---------------|-------|--------|
| gsi.rs        | 3     | pass   |
| setup.rs      | 5     | pass   |
| tts.rs        | 3     | pass   |
| **Total**     | **11**| **all pass** (6.6s warm) |

## บทเรียน

1. **Extract pure-fn สำหรับ test เป็น cost ต่ำ** — `parse_dota_library` เปลี่ยนจาก
   I/O-bound (อ่านไฟล์ + parse) เป็น pure (parse) ใน 2 บรรทัด. ความง่ายของ test
   มากขึ้น 10x.
2. **Hand-verified base64 vector สำคัญ** — ผมคำนวณ "ถอยก่อน" ทั้ง 21 bytes ออกเป็น
   7 groups × 4 chars ด้วยมือ. ถ้าใช้ encoder อื่น verify อาจวน round-trip ตัวเอง
   เปล่า ๆ; hand-verify ผูกกับ PowerShell คนละ implementation = independent oracle.
3. **VDF block-boundary test** เป็นตัวจับ regression สำคัญ — multi-library case
   เป็น failure mode ที่ obvious ในชีวิตจริง (user ส่วนใหญ่มี Steam หลายไดร์ฟ)
   แต่ obvious ใน test ก็เป็นตัวคุม.
4. **`#[cfg(test)] mod tests` ปลายไฟล์** — แต่ละ module แยก test ของตัวเอง เห็น
   ของ pub + private ได้ครบ. ไม่ต้อง refactor lib + bin.

## State ปลาย turn

- Branch `main` ahead of origin by 19 commits.
- Working tree clean (เหลือ untracked orchestration ของ user).
- งานต่อ: Piper TTS (heavy), G-Sentry minimap CV (เกมจริง), G-Master + Gemini
  (key), Control GUI polish, CLAUDE.md update (ขอ confirm).
