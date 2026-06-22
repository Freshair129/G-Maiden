# FEAT-G-LOG — Feedback Loop & Local Analytics

> **Module:** G-Log · **Priority:** Core · **Phase:** 6
> **SRS:** §3.6 · **Eng Spec:** §2.6, §6 · **TDD:** §2 `glog`
> **GATE:** P6 — no-egress privacy test

---

## 1. Purpose

บันทึก decisions ที่ Maiden ส่ง + ผลลัพธ์ (death/teamfight outcome/win-loss)
เพื่อเทียบคำแนะนำ vs ผลจริง → ปรับ tuning parameters ของ G-Sentry/G-Signal
ในเกมถัดไป. **ข้อมูลทั้งหมดอยู่ local เท่านั้น — ห้ามส่งออกเด็ดขาด.**

## 2. Input

| Source | Data |
| --- | --- |
| G-Signal | `SignalAlert` (fired/missed, probability, latency) |
| G-Master | `Advice` (recommendation given) |
| G-Motion | `GankRisk` (probability vs actual outcome) |
| GSI | Match result, deaths, teamfight outcomes |
| Governor | `ResourceStat` (CPU/RAM/FPS telemetry) |

## 3. Schema (SQLite, local-only)

```sql
CREATE TABLE matches (
    id TEXT PRIMARY KEY,
    hero TEXT NOT NULL,
    started_at INTEGER,
    ended_at INTEGER,
    result TEXT           -- win | loss | abandon
);

CREATE TABLE decisions (
    id TEXT PRIMARY KEY,
    match_id TEXT REFERENCES matches(id),
    t_ms INTEGER,         -- game clock ms
    module TEXT,           -- g-signal | g-master | g-motion
    payload TEXT,          -- JSON of decision/advice
    outcome TEXT           -- survived | died | teamfight_won | teamfight_lost
);

CREATE TABLE signals (
    id TEXT PRIMARY KEY,
    match_id TEXT REFERENCES matches(id),
    t_ms INTEGER,
    probability INTEGER,  -- 0–100
    latency_ms INTEGER,   -- end-to-end measured
    survived BOOLEAN
);

CREATE TABLE tuning_state (
    key TEXT PRIMARY KEY,
    value TEXT,            -- JSON
    updated_at INTEGER
);
```

## 4. Logic

```
during match:
  on SignalAlert → write signals row (async batch)
  on Advice → write decisions row (async batch)
  on death/teamfight → backfill outcome in decisions/signals

post match:
  calculate accuracy metrics:
    signal_accuracy = signals where survived=true / total signals
    advice_hit_rate = decisions with positive outcome / total decisions
  
  update tuning_state:
    if signal_accuracy < 80% → adjust DANGER_THRESHOLD (±5%)
    if signal latency p99 > 280ms → flag for investigation
  
  tuning_state feeds back into G-Sentry/G-Signal on next match start
```

## 5. Output

- **During match:** async writes (batched, non-blocking)
- **Post match:** `TuningDelta { key, old_value, new_value, reason }`
- **On next match start:** load `tuning_state` → inject into G-Sentry/G-Signal config

## 6. Privacy (GATE P6)

- **ห้ามเด็ดขาด:**
  - ไม่มี network egress จากตาราง G-Log
  - ไม่ส่ง SQLite file ขึ้น cloud
  - ไม่ sync กับ external service
  - ไม่ include G-Log data ใน cloud LLM prompts (redaction at brain_router)
- **Validation:** no-egress test — monitor all network calls ตลอด session, verify ว่า
  ไม่มี request พาข้อมูล G-Log ออก

## 7. Persona Behavior

- Post-match summary: *"วันนี้เราทำดีที่สุดแล้วนะ ถึงฉันจะช่วยได้ไม่มาก แต่แมตช์หน้า... ฉันว่าเราทำได้ดีกว่านี้แน่"*
- แสดง accuracy stats ใน overlay (optional toggle)
- ไม่ judge: บอกข้อมูล ไม่ตำหนิ

## 8. Constraints

- **Latency:** non-critical (batched async writes)
- **Storage:** SQLite ≤50 MB per 100 matches; auto-archive old matches
- **Write impact:** ≤0.1% CPU overhead from logging
- **Privacy:** GATE P6 — zero egress

## 9. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Signal data | **G-Signal** |
| Advice data | **G-Master** |
| Risk data | **G-Motion** |
| Match results | GSI |
| → Tuning output | **G-Sentry**, **G-Signal** (next match) |

## 10. Acceptance Criteria

- [ ] writes ไม่ block game loop (async batch)
- [ ] SQLite schema ตรงตาม Eng Spec §6
- [ ] tuning feedback ทำงาน: post-match → update tuning_state → load next match
- [ ] **no-egress test pass** (GATE P6) — zero network calls with G-Log data
- [ ] storage ≤50 MB per 100 matches
- [ ] CPU overhead from logging ≤0.1%
