# Session — 2026-06-21 (turn 7) · Belief Revision

ต่อจาก `2026-06-21-persona-lines.md`. CLAUDE.md ระบุ Belief Revision เป็น **required
behavior of G-Signal, not optional polish** ตั้งแต่ต้น — ผมเลือกทำเรื่องนี้ก่อน Piper/
G-Sentry/G-Master เพราะเป็น persona-critical และทำได้ด้วย infra ที่มี (GSI + SAPI shell-out).

## สิ่งที่ทำ (commit `8e62689`)

### Backend (`tts.rs`)

- **`static CURRENT: Mutex<Option<Child>>`** — Maiden พูดได้ทีละเส้น (single-slot SAPI).
- **`cancel()`**: take Child ออกจาก slot + `kill()` + `wait()` → idempotent.
- **`speak()`** เรียก `cancel()` นำหน้าทุกครั้ง + spawn ใหม่ + stash Child ลงใน slot.
  ตัด thread รออีกต่อไป (PowerShell exit เองอยู่แล้ว; slot จะถูก replace ตอน speak
  ครั้งถัดไป หรือ cancel). ผลลัพธ์: Mutex.lock() แค่ครั้งเดียวต่อ speak, ไม่มี race
  กับ reaper thread.
- `main.rs`: เพิ่ม `cancel_speech` Tauri command.

### Frontend (`App.tsx`)

- **`REVISION_LINES.dangerRetracted`** — 3 บรรทัดสไตล์ "เอ๊ะ! เดี๋ยวก่อน...":
  - "เอ๊ะ! เดี๋ยวก่อน — ไม่ต้องถอยแล้วนะคะ ปลอดภัยแล้ว"
  - "อ้าว! พลิกได้เก่งมาก — ขอโทษที่เพิ่งบอกถอย"
  - "เอ๊ะ! โทษทีค่ะ คิดเร็วไปหน่อย — ตามล่าต่อได้"
- **State tracking**:
  - `lastSpokeKind: 'danger' | 'persona' | 'revision' | null` — รู้ว่าเส้นที่กำลัง
    พูดเป็นชนิดอะไร (เฉพาะ `'danger'` ที่ revise ได้)
  - `dangerHpAtSpeak` — เก็บ HP ตอนพูดเส้นเตือน → ใช้คำนวณว่า HP เด้งเป็น "recovery
    จริง" ไม่ใช่ flicker
- **Revision effect** trigger เมื่อ:
  - `lastSpokeKind === 'danger'` (มีเส้นเตือนกำลังเล่นอยู่)
  - `100ms < sinceSpoke < 2500ms` (window: หลัง SAPI เริ่มจริง แต่ก่อนเส้นจบ)
  - `hpRecovered` (HP >= old + 25 **และ** > threshold + 15) **หรือ** `gotKill`
    (kills เพิ่ม)
- เมื่อ trigger: `invoke('cancel_speech')` → `setTimeout(90)` → `invoke('speak', revisionLine)`.
  90ms gap: ทดสอบพบว่า Windows audio บางครั้งกินพยางค์แรกถ้าเส้นใหม่เริ่มทันทีที่เส้นเก่า
  ถูก kill.
- Persona effect ติด `lastSpokeKind = 'persona'` → Belief Revision ไม่ revise persona lines
  (เพราะ logic ตรวจเฉพาะ `'danger'`).

## Verify

- `cargo check` clean.
- `pnpm tauri build` pass; bundles ออก.
- POST scenario:
  1. baseline (HP 82%, kills 4) — เซ็ต prev
  2. HP→18% — speak DANGER_LINE
  3. รอ 1s — ภายใน window
  4. HP→78% + kills 4→5 — Belief Revision conditions ครบ (HP recovered AND kill)
- ProcessTree หลัง sequence: **powershell ใหม่ตอน 17:46:46** = SAPI process ของ
  revision line ที่ spawn หลัง cancel + 90ms delay → หลักฐาน execution path ครบ.
- LIVE card สะท้อน state สุดท้าย: HP 78% เขียว, K/D/A 5/1/3 (screenshot).

## บทเรียน

1. **`static Mutex::new(None)` const ใน Rust 1.63+** — single-slot pattern แค่บรรทัด
   เดียว, ไม่ต้องใช้ `OnceLock` หรือ `LazyLock`.
2. **อย่าใช้ reaper thread ถ้าไม่จำเป็น** — แค่ store Child ใน slot; PowerShell exit
   เอง; slot ถูก replace ตอน speak ถัดไป. Mutex contention เป็น 0 ตอน hot path.
   เสีย Handle leak นิดเดียว (สูงสุด 1 leftover) — ยอมรับได้.
3. **90ms gap หลัง cancel** เป็นจำเป็น — Windows audio queue ใช้เวลา flush; ถ้า speak
   ใหม่เร็วเกินไป SAPI กินพยางค์แรก.
4. **HP recovery threshold ต้องเช็คสองชั้น** — แค่ "HP เพิ่มขึ้น" ไม่พอ (flicker ก็เพิ่ม)
   ต้อง "เพิ่มขึ้น ≥ +25 **และ** > threshold + 15" ถึงนับเป็น "ปลอดภัยจริง".
5. **lastSpokeKind ก่อน `lastSpokeAt`** — เก็บชนิดเส้นที่พูดเป็น ref แยก ทำให้ logic
   ถัดไปเช็คได้ว่า revise คืออะไร (ไม่ใช่ revise ทุกอย่างที่เพิ่งพูด).

## State ปลาย turn

- Branch `main` ahead of origin by 13 commits.
- Working tree: untracked `orchestration/docs/{ADR-O-002, ADR-O-003, SPEC--GOVIBE-INTEGRATION,
  SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP}.md` + `orchestration/poc/` (งานคู่ขนานของ user
  — ADR-O-003 และ SPEC--LOCAL-MODEL-ANTI-ERROR-LOOP ใหม่ใน turn นี้).
- งานต่อ: Piper TTS (iteration ใหญ่), G-Sentry minimap CV (ต้องเกมจริง), G-Master + Gemini.
  Persona Maiden ตอนนี้ครบทั้ง 3 ข้อตาม CLAUDE.md: gentle+intelligent + Nerf-CM
  self-deprecation + Belief Revision.
