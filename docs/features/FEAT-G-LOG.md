# FEAT-G-LOG — Feedback Loop & Local Analytics

> **Module:** G-Log · **Priority:** Core · **Phase:** 6
> **SRS:** [[software-requirements-specification|SRS]] §3.6 · [[engineering-spec|Eng Spec]] §2.6, §6 · [[technical-design-document|TDD]] §2 `glog`
> **GATE:** P6 — no-egress privacy test

---

## 1. Purpose

บันทึก decisions ที่ Maiden ส่ง + ผลลัพธ์ (death/teamfight outcome/win-loss)
เพื่อเทียบคำแนะนำ vs ผลจริง → ปรับ tuning parameters ของ G-Sentry/G-Signal
ในเกมถัดไป. **ข้อมูลทั้งหมดอยู่ local เท่านั้น — ห้ามส่งออกเด็ดขาด.**

## 2. Input

ที่บันทึกจริงวันนี้: tick stream + G-Signal/G-Sentry events. แถวที่ทำเครื่องหมาย
*(planned)* ยังไม่ได้ต่อสายเข้า G-Log.

| Source | Data |
| --- | --- |
| GSI tick | cleaned `GameTick` (~1 Hz) — **ทำแล้ว** |
| G-Signal | `gank_signal` (probability, missing heroes, eta) + `gank_revision` — **ทำแล้ว** |
| G-Sentry | `enemy_missing` (hero, missing_for_ms, last_pos) — **ทำแล้ว** |
| G-Master | `Advice` (recommendation given) — *(planned)* |
| G-Motion | `GankRisk` (probability vs actual outcome) — *(planned)* |
| Governor | `ResourceStat` (CPU/RAM/FPS telemetry) — *(planned)* |

## 3. Storage format (JSONL, local-only)

> **โค้ดจริง ([`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs)):** ไม่มี SQLite / rusqlite เลย. G-Log เขียน **JSONL หนึ่งไฟล์ต่อ
> แมตช์** ที่ `%LOCALAPPDATA%\G-Maiden\logs\match-<epoch-sec>.jsonl` — แต่ละบรรทัดเป็น JSON
> หนึ่ง record. (Schema SQLite ด้านล่างเดิมเป็นดีไซน์ที่ยัง**ไม่ได้ทำ** — เก็บไว้ในหัวข้อ
> "Planned" §5.)

**Tick record** — sampled ~1 Hz (debounce บน `clock_time`):

```json
{ "ts": 1719900000123, "tick": { /* cleaned GameTick ที่ overlay ได้รับ */ } }
```

**Typed event records** — เขียน time-aligned กับ tick stream ผ่าน [`note_event`](file:///g:/G-Maiden/src-tauri/src/log.rs#L205):

```json
{ "type": "gank_signal", "ts": ..., "probability": 0.91, "missing_heroes": ["CM","SF"], "eta_ms": 2500 }
{ "type": "gank_revision", "ts": ... }
{ "type": "enemy_missing", "ts": ..., "hero": "CM", "missing_for_ms": 6000, "last_pos": [0.25, 0.5] }
```

`ts` = Unix-epoch milliseconds. ไฟล์ถูก flush ทีละบรรทัด เพื่อให้ power-cut กลางแมตช์ยัง
เหลือ prefix ที่อ่านได้.

## 4. Logic (ปัจจุบัน)

[`note_tick`](file:///g:/G-Maiden/src-tauri/src/log.rs#L154) ตรวจ transition `in_game` เพื่อเปิด/ปิดไฟล์แมตช์ แล้วเขียน record ตามด้านล่าง.
ยังไม่มี outcome backfill หรือ metric ใด ๆ — บันทึกดิบเพื่อ join แบบ offline ทีหลัง.

```
during match:
  on GSI tick (clock_time advanced) → append {ts, tick} record (~1 Hz, flush ต่อบรรทัด)
  on G-Signal fire   → append {type:"gank_signal", ...}
  on Belief Revision → append {type:"gank_revision"}
  on enemy missing   → append {type:"enemy_missing", ...}
  in_game flips false → close match file
```

**การลบ/ความเป็นส่วนตัว:** [`delete_match`](file:///g:/G-Maiden/src-tauri/src/log.rs#L310) / [`delete_all`](file:///g:/G-Maiden/src-tauri/src/log.rs#L327) ลบไฟล์ที่ archive แล้ว แต่
**กันไฟล์ที่กำลังบันทึกอยู่** (active match) ไว้เสมอ; [`open_log_dir`](file:///g:/G-Maiden/src-tauri/src/log.rs#L533) เปิดโฟลเดอร์ให้ผู้ใช้
ตรวจสอบเองได้.

## 5. Output + Planned tuning loop

**ปัจจุบัน (ทำแล้ว):**
- append JSONL แบบ flush ต่อบรรทัด (non-blocking พอสำหรับ ~1 Hz)
- ไม่มี metric / TuningDelta / feedback ใด ๆ ส่งกลับเข้า runtime

**Planned (ยังไม่ได้ทำ — [`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs) เรียกส่วนนี้ว่า "Future use"):** replay ไฟล์ JSONL แบบ
offline เพื่อคำนวณ `signal_accuracy` / `advice_hit_rate`, สร้าง `TuningDelta { key,
old_value, new_value, reason }`, แล้ว inject เข้า config ของ G-Sentry/G-Signal ในแมตช์ถัดไป.
ตอนนี้ยังไม่มี `tuning_state`, accuracy metric, หรือ inject-on-next-match.

## 6. Privacy (GATE P6)

- **ห้ามเด็ดขาด:**
  - ไม่มี network egress จากข้อมูล G-Log
  - ไม่ส่งไฟล์ JSONL (`match-*.jsonl`) ขึ้น cloud
  - ไม่ sync กับ external service
  - ไม่ include G-Log data ใน cloud LLM prompts
- **Validation:** no-egress test — monitor all network calls ตลอด session, verify ว่า
  ไม่มี request พาข้อมูล G-Log ออก

## 7. Persona Behavior

- Post-match summary: *"วันนี้เราทำดีที่สุดแล้วนะ ถึงฉันจะช่วยได้ไม่มาก แต่แมตช์หน้า... ฉันว่าเราทำได้ดีกว่านี้แน่"*
- แสดง accuracy stats ใน overlay (optional toggle)
- ไม่ judge: บอกข้อมูล ไม่ตำหนิ

## 8. Constraints

- **Latency:** non-critical (append + flush ต่อบรรทัด, ~1 Hz)
- **Storage:** JSONL ~1 ไฟล์ต่อแมตช์; แมตช์ 40 นาทีอยู่ต่ำกว่า 2 MB สบาย ๆ
- **Write impact:** ≤0.1% CPU overhead from logging
- **Privacy:** GATE P6 — zero egress

## 9. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Signal data | **G-Signal** |
| Advice data | **G-Master** |
| Risk data | **G-Motion** |
| Match results | GSI |
| → Tuning output | **G-Sentry**, **G-Signal** (next match) — *(planned)* |

## 10. Acceptance Criteria

- [x] writes ไม่ block game loop (append JSONL, ~1 Hz)
- [x] JSONL record format ตรงตาม §3 (tick + typed events)
- [ ] tuning feedback ทำงาน: replay → TuningDelta → load next match *(planned — ยังไม่ได้ทำ)*
- [ ] **no-egress test pass** (GATE P6) — zero network calls with G-Log data
- [x] delete_match / delete_all กันไฟล์ที่กำลังบันทึกอยู่
- [ ] CPU overhead from logging ≤0.1%
