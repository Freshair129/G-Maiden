---
title: "FEAT-G-LOG — Feedback Loop & Local Analytics"
doc_id: "FEAT-G-LOG"
status: "active"
version: "0.1.0"
updated: "2026-10-04"
owner: "Boss"
source_of_truth: false
complexity: "C-2"
risk: "LOW"
---

# FEAT-G-LOG — Feedback Loop & Local Analytics

> **Module:** G-Log · **Priority:** Core · **Phase:** 6
> **SRS:** [[software-requirements-specification|SRS]] §3.6 · [[engineering-spec|Eng Spec]] §2.6, §6 · [[technical-design-document|TDD]] §2 `glog`
> **GATE:** P6 — no-egress privacy test

---

## 1. Purpose

บันทึก decisions ที่ Maiden ส่ง + ผลลัพธ์ (death/teamfight outcome/win-loss)
เพื่อเทียบคำแนะนำ vs ผลจริง → ปรับ tuning parameters ของ G-Motion สำหรับเกมถัดไป
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
| G-Motion | `risk_trace` (measured probability timeline vs death outcomes) — **ทำแล้วสำหรับ FULL replay** |
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

**การลบ/ความเป็นส่วนตัว:** [`delete_match`](file:///g:/G-Maiden/src-tauri/src/log.rs#L359) / [`delete_all`](file:///g:/G-Maiden/src-tauri/src/log.rs#L376) ลบไฟล์ที่ archive แล้ว แต่
**กันไฟล์ที่กำลังบันทึกอยู่** (active match) ไว้เสมอ; [`open_log_dir`](file:///g:/G-Maiden/src-tauri/src/log.rs#L582) เปิดโฟลเดอร์ให้ผู้ใช้
ตรวจสอบเองได้.

## 5. Output + Planned tuning loop

**ปัจจุบัน (ทำแล้ว):**
- append JSONL แบบ flush ต่อบรรทัด (non-blocking พอสำหรับ ~1 Hz)
- `replay_fit` แยก `FULL` (มี `risk_trace`) ออกจาก `APPROX` (reconstructed legacy rows) อย่างชัดเจน
- `replay_fit --write-tuning` สร้างและเขียน `TuningDelta` local สำหรับ G-Motion เกมถัดไป เมื่อผ่านเงื่อนไขหลักฐาน

**Local tuning contract:** `replay_fit --write-tuning` อ่านเฉพาะ FULL logs, ต้องมีอย่างน้อย `3` แมตช์, เลือก candidate ที่ Sensitivity `Med` เท่านั้น, และต้องมี `candidate_f1 >= baseline_f1 + 0.01`. ผลลัพธ์เป็น schema-versioned `TuningDelta` ที่มี `old_params`/`new_params`, F1 baseline/candidate และจำนวนแมตช์; ไม่รับ `APPROX`, ค่า NaN/out-of-range หรือ baseline ที่ไม่ใช่ค่า shipped default.

การเขียนเป็น local temp-file replace ไปที่ `%LOCALAPPDATA%\G-Maiden\motion-tuning.json` พร้อมสำรอง profile เดิมที่ valid เป็น `.json.bak`. `Motion::for_next_match` โหลดเฉพาะ profile ที่ validate ผ่านตอนสร้างหรือ reset capture pipeline ที่ match boundary; หากไฟล์หลักเสีย/หาย/ไม่ผ่าน validation จะลอง backup แล้วกลับไปใช้ default. ไม่มีการเปลี่ยนค่ากลางแมตช์ และไม่มีการจูน threshold ของ G-Signal ใน slice นี้.

**ยัง planned:** outcome backfill สำหรับ advice, `advice_hit_rate`, real-match accuracy receipt และ no-egress runtime receipt. [`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs) ยังคงเป็น writer; replay/tuning อยู่ใน [`replay_fit.rs`](file:///g:/G-Maiden/tests/perf/src/bin/replay_fit.rs) และ [`tuning.rs`](file:///g:/G-Maiden/src-tauri/src/tuning.rs).

## 6. Privacy (GATE P6)

- **ห้ามเด็ดขาด:**
  - ไม่มี network egress จากข้อมูล G-Log
  - ไม่ส่งไฟล์ JSONL (`match-*.jsonl`) ขึ้น cloud
  - ไม่ sync กับ external service
  - ไม่ include G-Log data ใน cloud LLM prompts
- `motion-tuning.json` และ `.json.bak` เป็นไฟล์ local-only เช่นกัน; flag `--write-tuning` ไม่แก้ไขไฟล์ JSONL ต้นฉบับและไม่ทำ network request
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
| → Tuning output | **G-Motion** (next match, validated local profile) — **ทำแล้วใน code path; real-match receipt ยังไม่ทำ** |

## 10. Acceptance Criteria

- [x] writes ไม่ block game loop (append JSONL, ~1 Hz)
- [x] JSONL record format ตรงตาม §3 (tick + typed events)
- [x] code-level tuning feedback: FULL replay → validated `TuningDelta` → temp-file write/backup → next-match load
- [ ] real-match tuning accuracy receipt (ยังไม่ claim จาก unit/producer tests)
- [ ] **no-egress test pass** (GATE P6) — zero network calls with G-Log data
- [x] delete_match / delete_all กันไฟล์ที่กำลังบันทึกอยู่
- [ ] CPU overhead from logging ≤0.1%

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-04 | Reconciled the local FULL-only replay-to-next-match G-Motion tuning contract and its fail-closed boundaries. |
