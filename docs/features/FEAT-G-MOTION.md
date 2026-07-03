# FEAT-G-MOTION — Heatmap & Path Prediction

> **Module:** G-Motion · **Priority:** Core · **Phase:** 3
> **SRS:** §3.2 · **Eng Spec:** §2.2 · **TDD:** §2 `motion`

---

## 1. Purpose

เก็บประวัติตำแหน่งศัตรูย้อนหลัง 5 นาที แล้วคำนวณความน่าจะเป็นของ gank
(`probability: f32`, 0..1) จากชุดฮีโร่ที่หายจากแมพ เพื่อป้อนให้ G-Signal ตัดสิน
ว่าถึง danger threshold หรือยัง.

> **สถานะ (2026-07): โค้ดจริงเป็น heuristic ตามเวลาที่ฮีโร่หายจากแมพ ไม่ใช่
> heatmap/path prediction.** `Motion::assess` รวม per-hero risk แบบ "อย่างน้อย 1
> ตัวกำลังแก๊ง" (1 − ∏(1−rᵢ)) แล้วคูณ boost ×1.15 เมื่อหาย ≥2 ตัวพร้อมกัน. ring
> buffer 5 นาทีมีจริง แต่ hero/pos ในนั้น **ยังไม่ถูกใช้** ทำนายเส้นทาง — เก็บไว้
> สำหรับ path-prediction + G-Log tuning ในอนาคต. probability เป็น `f32` 0..1 (ไม่ใช่
> u8 0–100).

## 2. Input

| Source | Data |
| --- | --- |
| G-Sentry | รายการฮีโร่ที่ยัง missing `(hero, missing_ms, last_pos)` (จาก `Sentry::missing`) |
| Vision (continuous) | Ring buffer ของ `Detection` ย้อน 5 นาที (ยังไม่ใช้ทำนาย) |

## 3. Internal State

```rust
struct Motion {
    history: VecDeque<Sample>,   // 5-min ring buffer of Detection sightings
}
```

> **สถานะ (2026-07): ไม่มี `heatmap: Grid<f32>`** — state จริงมีแค่ ring buffer
> ของ sightings (และ hero/pos ในนั้นยังไม่ถูกอ่านเพื่อทำนาย).

## 4. Logic

```
assess(missing):                         // missing = [(hero, missing_ms, last_pos)]
  p_safe = 1.0
  for (hero, ms, _) in missing:
    r = missing_risk(ms)                  // 0 ก่อน 5s; ramp ~0.7 peak ~12s; decay หลังจากนั้น
    if r <= 0: continue
    names.push(hero); p_safe *= (1 - r)   // "อย่างน้อย 1 ตัวกำลังแก๊ง"
  probability = 1 - p_safe
  if names.len() >= 2: probability = min(probability * 1.15, 1.0)   // coordinated-gank boost
  emit GankRisk { probability, missing_heroes: names, eta_ms }
```

- **Per-hero risk:** ฟังก์ชันของเวลาหายจากแมพ (`missing_risk`) — 0 ก่อน 5s, ramp
  ถึง ~0.7 ราว 12s, แล้ว decay (floor 0.1) เพราะหายนานมักหมายถึง farm/TP ไม่ใช่แก๊ง
- **ETA estimate:** `eta_estimate(ms)` — ยิ่งหายนานยิ่งใกล้มาถึง (floor 1s); ไม่มีการ
  คำนวณระยะทางจริงหรือ lane
- **Ring buffer cleanup:** evict entries >5 min ทุกครั้งที่ `record`

## 5. Output Event

```rust
GankRisk {
    probability: f32,             // 0..1 (ไม่ใช่ u8 0–100)
    missing_heroes: Vec<String>,
    eta_ms: u64,
}
```

> **สถานะ (2026-07): ไม่มี `lane` และ `predicted_paths`** — ยังไม่มี heatmap/paths/
> lanes. output จริงคือ struct ข้างบน.

→ ส่งเข้า **G-Signal**

## 6. Persona Behavior

- ระดับ medium: *"มีโอกาสสูงถึง 78% ที่พวกเขาจะกบดานอยู่แถวนี้"* (persona ยัง
  พูดถึง "แผนภูมิความร้อน" ได้ในเชิง flavor แต่ backend ยังไม่มี heatmap จริง)
- ระดับ low: ไม่พูด (ไม่รบกวน)
- ระดับ high: ส่งต่อ G-Signal จัดการ (ดู FEAT-G-SIGNAL) — threshold ขึ้นกับ
  `Sensitivity` ที่ผู้เล่นตั้ง (default Med = 0.65), ไม่ใช่ 0.85 ตายตัว

## 7. Constraints

- **Latency:** ≤20ms (Eng Spec §1 ขั้น 3)
- **Memory:** ring buffer 5 min at 20Hz ≈ 6000 entries × ~64 bytes ≈ 384KB
- **ไม่มี cloud dependency:** heuristic ล้วน, ทำงานได้ offline
- **Accuracy tradeoff:** เริ่มด้วย simple heuristic; ปรับจูนจาก G-Log feedback loop (Phase 6)

## 8. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Missing events | **G-Sentry** |
| Position history | `vision` ring buffer |
| → ส่งออกไป | **G-Signal** |
| Tuning feedback | **G-Log** (Phase 6) |

## 9. Acceptance Criteria

- [ ] คำนวณ probability `f32` 0..1 ภายใน 20ms
- [ ] ring buffer เก็บ 5 min แม่นยำ (ไม่รั่ว, evict ตรงเวลา)
- [ ] coordinated-gank boost (×1.15) เมื่อหาย ≥2 ตัวพร้อมกัน
- [ ] eta_estimate สมเหตุสมผล (heuristic ตามเวลาหาย, floor 1s)
- [ ] memory ≤1MB สำหรับ motion state ทั้งหมด
- [ ] ไม่ crash เมื่อ ring buffer ว่าง (เกมเพิ่งเริ่ม)
