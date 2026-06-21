# Session — 2026-06-21 (turn 13) · G-Log privacy controls + consistency cleanup

3 ตัวเล็กในรอบเดียว: 2 consistency fixes ที่เจอตอน review codebase + 1 ฟีเจอร์
privacy ที่สอดคล้องค่านิยม CLAUDE.md.

## สิ่งที่ทำ (commit `54b9303`)

### (1) `speak_event('advice')` consistency

**ก่อน:** MasterCard "🔊 อ่าน" button + auto-advice ใช้ `invoke('speak')` (SAPI
ตรง ๆ) — bypass WAV pipeline. ถ้า user วาง `voice-cache/advice/01.wav` จะ
ไม่ถูกใช้.

**แก้:** เปลี่ยนเป็น `invoke('speak_event', { event: 'advice', fallback })` →
unified กับ persona/danger/revision events. ทันทีที่ user วาง WAV ใน
`voice-cache/advice/` ระบบเริ่มใช้ทันที.

### (2) `EVENTS` list เพิ่ม `'advice'`

**ก่อน:** `voice_cache_status` รายงาน count ของ 7 events ไม่รวม advice. UI
VoiceCacheCard แสดง "advice: ?" ไม่ครบ.

**แก้:** เพิ่ม `'advice'` ใน main.rs EVENTS const → status รวม advice count
+ UI แสดงครบ.

### (3) G-Log privacy controls

ตรงตามค่านิยม CLAUDE.md: "G-Log raw data and player stats stay local only —
never upload them." User ควรมีอำนาจลบประวัติได้.

**Backend** (`log.rs`):

- `MatchLog` struct: name + size + modified_ms (mtime ผ่าน std::fs::Metadata).
- `list_matches()`: scan log_dir → filter `match-*.jsonl` → **exclude
  currently-recording file** (กัน delete-during-write corruption) → sort
  newest first โดย mtime desc.
- `delete_match(name)`: **defensive guards** 3 ชั้น:
  1. `name.contains('/' | '\\' | "..")` → reject (กัน path traversal)
  2. ต้อง `name.starts_with("match-") && name.ends_with(".jsonl")` → reject
     อื่น ๆ (กัน delete file นอกขอบเขต)
  3. ตรวจกับ `current_path()` → reject ถ้าเป็นไฟล์ที่กำลังบันทึก
  - ข้อความไทยอธิบายทุกกรณี
- `delete_all()`: iterate list_matches + delete_match → คืนจำนวนลบจริง.
  recording file รอดเสมอ (privacy reset ระหว่างแมตช์ใช้งานได้).

**Commands**: `list_match_logs`, `delete_match_log`, `delete_all_match_logs`.

**UI** (LogCard):

- ปุ่ม "📋 ประวัติ" toggle (active state สีฟ้าอ่อน) ขยายแสดง:
  - สรุป "N แมตช์ · รวม X MB"
  - ปุ่ม "ล้างทั้งหมด" สีแดง + `window.confirm()` (ยอมรับ irreversible)
  - List แต่ละแมตช์: filename + date local + size + ปุ่ม ✕ ลบเฉพาะตัว
  - max-height 180 + scroll (กัน UI ล้นถ้ามี 100+ แมตช์)
- ปุ่ม "📂 โฟลเดอร์" ย่อจาก "เปิดโฟลเดอร์" กันแถวล้น

## Verify

| Layer | ผ่าน |
|-------|------|
| `cargo test` | 15/15 (ของเดิม — ไม่ break) |
| `cargo check` | clean |
| `tsc --noEmit` | clean |
| `pnpm tauri build` | bundles ออก |
| Defensive review | path traversal + non-match-file + recording-file ตัวกัน 3 ชั้น |

UI integration test (click "📋 ประวัติ" + ลบไฟล์) ไม่ทำในรอบนี้ — logic เล็ก
+ defensive + reviewable. user verify ตอนใช้จริง.

## บทเรียน

1. **Consistency review หลังจาก feature wave** = หาเส้นทางที่ "ทำงานได้แต่
   ไม่ผ่าน abstraction ใหม่" — turn นี้ MasterCard speak button bypass
   WAV pipeline เพราะถูกเขียนก่อน speak_event ออก. ค้นด้วยการ grep
   `invoke('speak'` → 1 hit ใน MasterCard.
2. **Defensive guards เรียงตามความ specific** — path traversal (general) →
   format (G-Maiden-specific) → state (runtime-specific). ผ่านชั้นแรกก่อน
   จะคิดชั้นที่ 2 → readable code + error message ชี้จุดได้ตรง.
3. **`std::fs::Metadata::modified()` ผ่าน UNIX_EPOCH** ใช้ได้ทุก platform.
   ไม่ต้อง chrono — frontend แปลง epoch ms เป็น local date เอง.
4. **Currently-recording file = singleton invariant** → expose `current_path()`
   ออกจาก log module → ใช้ทั้งใน list_matches (skip) และ delete_match (reject)
   → single source of truth.
5. **Privacy controls = trust signal** — user ที่เห็น UI ลบประวัติได้รู้สึก
   มั่นใจกับโปรเจกต์มากกว่าโปรเจกต์ที่บอกว่า "local only" แต่ไม่ให้ลบ.

## State ปลาย turn

- Branch `main` ahead of origin by 25 commits.
- Working tree: orchestration files ของ user + tests/perf/Cargo.toml edit user.
- งานต่อ: WAV asset (user), G-Sentry minimap CV (เกมจริง), Control GUI polish
  (theme/hotkey custom).
