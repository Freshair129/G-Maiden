---
title: "CR-041 — G-Voice Slice 1: PTT binding, remap and VoiceTurn lifecycle"
doc_id: "CR-041-g-voice-ptt-turn-lifecycle"
status: "accepted"
approved_by: "Boss (explicit approval in chat, 2026-11-07: อนุมัติตามร่าง)"
approved_date: "2026-11-07"
version: "0.1.1"
updated: "2026-11-07"
owner: "Boss"
complexity: "C-2"
risk: "MEDIUM"
related_docs: ["FEAT-G-VOICE", "mvp-decisions", "MVP-038-local-stt-evaluation", "software-requirements-specification"]
---

# CR-041 — G-Voice Slice 1: PTT binding, remap และ VoiceTurn lifecycle

> **สถานะ:** accepted 2026-11-07 — Boss อนุมัติตามร่าง รวมข้อ §8 (hold cap 15 s, minimum 250 ms, Voice = `Normal` จึงถูก announcer ตัดได้, ใช้เลข CR-041).
> **Risk: MEDIUM** — เพิ่ม global shortcut, settings key, Tauri command และ event ใหม่ (public IPC surface).
> ไม่เปลี่ยน privacy boundary: slice นี้ **ไม่เปิดไมโครโฟน** และไม่มี transcript.

## 1. เหตุผล

[[FEAT-G-VOICE]] §9 และ [[mvp-decisions]] กำหนด PTT `Ctrl+Alt+V` พร้อมตรวจ collision และ remap แต่ไม่มีสัญญาว่า
remap เก็บที่ไหน ชนแล้วทำอย่างไร และ turn มีสถานะอะไรบ้าง. [[MVP-038-local-stt-evaluation]] ยังไม่เลือก STT
ดังนั้น slice นี้สร้างเฉพาะส่วนที่ไม่ขึ้นกับ STT: binding, remap, state machine, unavailable state และการให้ G-Signal
ยกเลิก turn ได้ เพื่อให้ slice ต่อไป (mic capture, STT) เสียบเข้ากับ lifecycle เดียวกัน.

หลักฐาน source ปัจจุบัน (`origin/main` `ff118cec`): `src-tauri/src/lib.rs` ลงทะเบียนแค่ `Ctrl+Alt+S`, `Alt+↑`,
`Alt+↓`, `Alt+M` และ handler ทิ้ง event ที่ไม่ใช่ `ShortcutState::Pressed`; ไม่มี PTT, ไม่มี VoiceTurn.

## 2. ขอบเขต

**In scope (Slice 1a — backend):**

1. ลงทะเบียน PTT ค่าเริ่มต้น `Ctrl+Alt+V` และรับทั้ง press และ release
2. ตรวจ collision, remap แบบ atomic และเก็บค่าใน settings เดิม
3. `VoiceTurn` state machine + Tauri event `voice-turn`
4. เมื่อยังไม่มี STT backend: press → `unavailable` (`stt_not_installed`) โดยไม่เปิดไมค์
5. G-Signal (critical audio) ยกเลิก turn ที่ค้างโดยไม่รอ lock ของ Voice

**Slice 1b — UI (PR แยก, draft จนกว่าจะมีคนดูด้วยตา):** แถว PTT ใน Settings › Voice แสดง binding,
ปุ่ม remap, ข้อผิดพลาด collision และสถานะ unavailable ด้วย `--g-*` tokens; ไม่มี page-level scroll.

**Out of scope:** mic capture, audio buffer, STT, interpretation/answer, TTS ของคำตอบ, subtitle overlay,
intent/slot inventory, การตรวจ binding ภายใน Dota 2 (ตรวจจาก app ไม่ได้).

## 3. สัญญา PTT binding และ remap

| หัวข้อ | สัญญา |
| --- | --- |
| ค่าเริ่มต้น | `Ctrl+Alt+V` |
| ที่เก็บ | `%LOCALAPPDATA%\G-Maiden\settings.json` คีย์ `voice.pttShortcut` (string รูปแบบ accelerator เช่น `"Ctrl+Alt+V"`); ไม่มีคีย์หรือค่าอ่านไม่ได้ → ใช้ค่าเริ่มต้น |
| รูปแบบที่รับ | modifier อย่างน้อยหนึ่งตัวจาก `Ctrl`/`Alt` (เพิ่ม `Shift` ได้) + key หนึ่งตัวจาก `A–Z`, `0–9`, `F1–F12`; ปฏิเสธ key เดี่ยวไม่มี modifier และ `Win` |
| Reserved (ภายในแอป) | `Ctrl+Alt+S`, `Alt+Up`, `Alt+Down`, `Alt+M` — ตั้งเป็น PTT ไม่ได้; `Alt+M` คงเป็น mute |
| Collision ภายใน | ปฏิเสธตอน validate (`reserved_conflict`) ก่อนแตะ registration |
| Collision ภายนอก | `register()` ล้มเหลว (OS/แอปอื่นถือไว้) → `registration_failed`; ตอน startup ให้ PTT อยู่สถานะ `unavailable` แอปส่วนอื่นทำงานต่อ; **ห้ามเปลี่ยนไปใช้ key อื่นเอง** |
| Remap | Tauri command `set_voice_ptt_shortcut(accelerator)`: validate → register ใหม่ → ถ้าสำเร็จจึง unregister เดิมและเขียน settings; ถ้าล้มเหลว binding เดิมยังทำงานและไม่เขียน settings; คืน `Ok(accelerator)` หรือ `Err{code}` |
| อ่านสถานะ | Tauri command `get_voice_ptt_status()` → `{ accelerator, registered, error_code? }` |
| Dota binds | ตรวจไม่ได้จากแอป; UI แสดงคำเตือนว่าให้เลือกปุ่มที่ไม่ได้ผูกในเกม |

Error codes: `invalid_accelerator`, `reserved_conflict`, `registration_failed`, `settings_write_failed`.

## 4. สัญญา press/release

- `Pressed` เริ่ม turn; `Pressed` ซ้ำจาก key auto-repeat ขณะยังกดค้าง → ignore (idempotent)
- `Released` จบช่วง listening ของ turn นั้น; release ที่ไม่มี turn ค้าง → ignore
- Hold cap **15 s**: เกินแล้วจบ listening อัตโนมัติ (`hold_cap`); ค่านี้เป็นขอบบนของ buffer ใน Slice 2
- Release ก่อน **250 ms** → `cancelled` (`too_short`) ไม่ส่งต่อ STT
- ค่าทั้งสองเป็น starting point สำหรับ UAT ไม่ใช่ค่าที่ calibrated

## 5. VoiceTurn state machine

```text
idle ──press──► preparing ──ready──► listening ──release/hold_cap──► decoding ──► answering ──► speaking ──► idle
  │                │                    │                              │             │            │
  │                └─model missing──► unavailable(reason) ──► idle      └────── cancelled(reason) / failed(reason) ──► idle
  └─press, no STT backend──► unavailable(stt_not_installed) ──► idle
```

- มี turn active ได้ครั้งละหนึ่ง; `request_id` เป็น `u64` เพิ่มขึ้นเรื่อยๆ ภายใน process (ไม่ persist)
- Press ระหว่าง `decoding`/`answering`/`speaking` → turn เดิม `cancelled(superseded)` แล้วเริ่ม turn ใหม่
- Terminal states (`unavailable`, `cancelled`, `failed`) emit แล้วกลับ `idle` ทันที
- Cancel reasons: `too_short`, `superseded`, `signal_preempt`, `app_exit`. Failed reasons: `internal_error`
- Unavailable reasons: `stt_not_installed`, `ptt_unregistered`, `model_unavailable`

ใน Slice 1 มี backend เดียวคือ "ไม่มี STT" จึงเดินทาง `idle → unavailable(stt_not_installed) → idle` เท่านั้น;
state อื่นถูกนิยามไว้และทดสอบด้วย fake backend.

### Event `voice-turn`

```json
{ "requestId": 7, "state": "unavailable", "reason": "stt_not_installed", "monotonicMs": 123456 }
```

Payload ห้ามมี audio, transcript, คำถาม หรือข้อความคำตอบ. Event ไม่ถูกเขียนลง G-Log, history, telemetry หรือไฟล์ใด.

## 6. G-Signal preemption

- เมื่อ audio ระดับ `Priority::Critical` ถูก admit, Voice turn ที่ไม่ใช่ `idle` → `cancelled(signal_preempt)`
- กลไก: G-Signal path เพิ่มค่า atomic cancel generation เท่านั้น — **ไม่ acquire lock ของ Voice, ไม่รอ worker,
  ไม่ allocate**; Voice worker ตรวจ generation เองแล้วยกเลิก
- เสียงคำตอบของ Voice ใช้ `Priority::Normal` (Slice ต่อไป) จึงถูกตัดด้วย critical path เดิม
- G-Signal ไม่ขึ้นกับ Voice: Voice ล้มหรือไม่มี STT ต้องไม่กระทบ GSI → G-Signal → cached alert

## 7. Acceptance criteria (Slice 1a)

Rust unit tests ที่ต้องเขียนก่อนและผ่าน (`cargo test` จาก `src-tauri/`):

- [ ] parse/validate: รับ `Ctrl+Alt+V`, `Ctrl+Shift+F9`; ปฏิเสธ `V`, `Win+V`, `Alt+M` (`reserved_conflict`), ข้อความเสีย (`invalid_accelerator`)
- [ ] settings: ไม่มีคีย์/ค่าเสีย → `Ctrl+Alt+V`; remap สำเร็จเขียน `voice.pttShortcut` และคงคีย์อื่นใน settings
- [ ] remap atomic: registrar ปลอมที่ register ใหม่ล้มเหลว → binding เดิมยัง registered และ settings ไม่เปลี่ยน
- [ ] startup registration ล้มเหลว → `get_voice_ptt_status` รายงาน `registration_failed`; ไม่ panic
- [ ] press โดยไม่มี STT → emit `unavailable(stt_not_installed)` แล้ว `idle`; ไม่มี mic API ถูกเรียก (ไม่มี dependency capture ใน Cargo.toml)
- [ ] auto-repeat press ไม่สร้าง turn ซ้ำ; release เดี่ยว ignore; release < 250 ms → `too_short`; hold ≥15 s → `hold_cap`
- [ ] fake backend: press ระหว่าง `speaking` → `superseded` แล้ว turn ใหม่มี `request_id` มากขึ้น
- [ ] critical admission → turn active เป็น `cancelled(signal_preempt)`; preempt path ไม่ถือ lock ของ Voice (ทดสอบโดยถือ lock Voice ค้างแล้ว preempt ต้องคืนทันที)
- [ ] payload `voice-turn` serialize แล้วมีเพียง `requestId`, `state`, `reason`, `monotonicMs`
- [ ] เทสต์เดิมทั้งหมดผ่าน; `cargo clippy --all-targets -D warnings` ผ่าน; `Alt+M` ยังเป็น mute

ไม่ถือเป็นหลักฐาน native/live acceptance: การชนกับแอปอื่นจริงบน Windows, พฤติกรรมเมื่อ Dota focus อยู่ และ
100-trial preemption ของ [[mvp-decisions]] MVP-006 ต้องวัดแยก.

## 8. ข้อที่ขอให้ Boss ตัดสิน

1. Hold cap 15 s และ minimum 250 ms เหมาะไหม
2. Announcer (`Priority::Announcer`) ควรตัดคำตอบ Voice ได้ไหม — ร่างนี้ให้ Voice เป็น `Normal` จึงถูก announcer ตัดได้
3. ใช้เลข CR-041 (CR-039/CR-040 ถูกใช้ในชื่อ branch ของงานอื่นแล้ว)

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-07 | Draft Slice 1 contract for G-Voice PTT binding, remap, VoiceTurn lifecycle and G-Signal preemption; no microphone, no implementation. |
| 0.1.1 | 2026-11-07 | Boss approved the draft as written, including the §8 decisions; implementation may start for Slice 1a. |
