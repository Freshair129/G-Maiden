# Session — 2026-06-21 (turn 9) · fix in_game gating + unit tests แรกของโปรเจกต์

ต่อจาก `2026-06-21-glog.md`. turn ก่อนเจอ bug ของ `in_game` ที่ตื่นเร็วเกินไปตอน state
INIT — ผมเพิ่มเข้า TODO เอง. turn นี้จัดการให้จบ + เพิ่ม unit test ครั้งแรกของโปรเจกต์
เพื่อกัน regression.

## สิ่งที่ทำ (commit `22a8572`)

### Fix

- `gsi.rs::handle()` เดิม: `in_game = !empty && !=DISCONNECT` → INIT, HERO_SELECTION,
  STRATEGY_TIME, WAIT_FOR_*_LOAD, POST_GAME ทั้งหมดถือว่า "in game" → overlay/voice/log
  ตื่นเร็วเกิน (G-Log เขียน 1 บรรทัดก่อนแมตช์เริ่มจริงใน turn 8).
- ใหม่: `fn is_in_game(s: &str) -> bool` → `matches!(s, "PRE_GAME" | "GAME_IN_PROGRESS")`.
  PRE_GAME นับเพราะผู้เล่นอยู่บนแผนที่แล้ว (รอ horn). POST_GAME ตัดออก (scoreboard
  ไม่ใช่ gameplay).

### Unit tests แรกของโปรเจกต์ (`#[cfg(test)] mod tests` ใน `gsi.rs`)

- **`in_game_only_during_active_play`**: 10 state ปลอม (รวม `""`, INIT, HERO_SELECTION,
  STRATEGY_TIME, TEAM_SHOWCASE, 2 LOAD states, POST_GAME, DISCONNECT, future-value)
  + 2 state จริง (PRE_GAME, GAME_IN_PROGRESS). กัน regression ตอน Valve เพิ่ม state.
- **`missing_fields_default_to_zero_not_panic`**: GSI ส่ง payload ว่าง `{}` ระหว่าง
  state-change ได้ — handle ต้องไม่ panic, ทุก field default 0/false/"".
- **`happy_path_in_match`**: full JSON payload Crystal Maiden แมตช์จริง → field
  mapping ครบ (clock, hero name, kills, hp, ฯลฯ).

`cargo test`: **3 passed; 0 failed** (cold compile 1m 58s).

## Verify integration

- Build pass; release exe + MSI + NSIS ออกครบ.
- POST 7 states ติด ๆ: INIT / HERO_SELECTION / STRATEGY_TIME / WAIT_LOAD /
  PRE_GAME / GAME_IN_PROGRESS / POST_GAME.
- **G-Log ออก 2 บรรทัด** (PRE_GAME + GAME_IN_PROGRESS) ทั้งที่ POST 7 ครั้ง →
  gating ถูก 100%.
- 4 ticks ก่อน PRE_GAME ไม่ทำให้ overlay ขึ้น/voice ยิง/log บันทึก.

## บทเรียน

1. **`matches!(s, A | B)` pattern** อ่านง่ายและ exhaustive กว่า list of != และ ==
   เป็น pattern ที่ใช้ดี ๆ ใน Rust ตอน enum-like string handling.
2. **`#[cfg(test)] mod tests` ใน file เดียวกัน** เหมาะกับ unit tests; pub members
   มองเห็นได้, private ก็มองเห็น (เพราะอยู่ใน mod เดียวกัน). ไม่ต้อง refactor
   เป็น lib + bin เพื่อทดสอบ.
3. **`run_handle(payload)` mock helper** copy logic จาก async `handle()` แบบ sync —
   ทำให้ unit test ไม่ต้อง tokio runtime หรือ AppHandle. trade-off: ถ้า handle()
   เปลี่ยน schema field ต้องอัพ test ด้วย. รับได้เพราะแมป field ไม่ค่อยเปลี่ยน.
4. **คลื่นการ verify**: unit test (3 passed) ↗ build pass ↗ POST integration test
   (7 → 2 lines). 3 ชั้น = confidence สูงกว่าชั้นเดียว.

## State ปลาย turn

- Branch `main` ahead of origin by 17 commits.
- Working tree: untracked เป็น orchestration work ของ user (เหมือนเดิม).
- งานต่อ: Piper TTS, G-Sentry minimap CV, G-Master + Gemini, Control GUI polish.
  Bug list ตอนนี้ว่างเปล่าใน TODO!
