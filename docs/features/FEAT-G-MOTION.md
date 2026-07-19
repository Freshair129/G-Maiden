# FEAT-G-MOTION — Heatmap & Path Prediction

> **Module:** G-Motion · **Priority:** Core · **Phase:** 3
> **SRS:** [[software-requirements-specification|SRS]] §3.2 · [[engineering-spec|Eng Spec]] §2.2 · [[technical-design-document|TDD]] §2 `motion`

---

## 1. Purpose

เก็บประวัติตำแหน่งศัตรูย้อนหลัง 5 นาที แล้วคำนวณความน่าจะเป็นของ gank
(`probability: f32`, 0..1) จากชุดฮีโร่ที่หายจากแมพ เพื่อป้อนให้ G-Signal ตัดสิน
ว่าถึง danger threshold หรือยัง.

> **สถานะ (2026-07-18): โค้ดจริงเป็น heuristic ตามเวลาที่ฮีโร่หายจากแมพ + heading-aware
> ปรับตามทิศก่อนหาย — ยังไม่ใช่ heatmap/path prediction เต็มรูปแบบ.** `Motion::assess` รวม
> per-hero risk แบบ "อย่างน้อย 1 ตัวกำลังแก๊ง" (1 − ∏(1−rᵢ)) แล้วคูณ boost ×1.15 เมื่อหาย
> ≥2 ตัวพร้อมกัน. ring buffer 5 นาที**ถูกใช้แล้ว**สำหรับ [`heading_multiplier()`](file:///g:/G-Maiden/src-tauri/src/motion.rs#L126) — อ่าน 2 sample
> ล่าสุดของฮีโร่ก่อนหายเพื่อเทียบทิศเดินกับทิศเข้ากลางแมพ (มุ่งเข้า = เสี่ยงแก๊งค์สูงขึ้น
> ×1.22 สูงสุด, เดินออก = ฟาร์ม/ถอย ×0.78 ต่ำสุด, ไม่มี trail = neutral ×1.0) ก่อนคูณเข้ากับ
> [`missing_risk(ms)`](file:///g:/G-Maiden/src-tauri/src/motion.rs#L168). ยังไม่มี full heatmap หรือ through-fog path/lane prediction — trail จบที่
> จุดหายจากแมพเท่านั้น (เก็บไว้สำหรับ G-Log tuning ในอนาคต). probability เป็น `f32` 0..1
> (ไม่ใช่ u8 0–100).

## 2. Input

| Source | Data |
| --- | --- |
| G-Sentry | รายการฮีโร่ที่ยัง missing `(hero, missing_ms, last_pos)` (จาก [`Sentry::missing`](file:///g:/G-Maiden/src-tauri/src/sentry.rs#L164)) |
| Vision (continuous) | Ring buffer ของ [`Detection`](file:///g:/G-Maiden/src-tauri/src/cv/detector.rs#L51) ย้อน 5 นาที (ยังไม่ใช้ทำนาย) |

## 3. Internal State

```rust
struct Motion {
    history: VecDeque<Sample>,   // 5-min ring buffer of Detection sightings
}
```

> **สถานะ (2026-07-18): ไม่มี `heatmap: Grid<f32>`** — state จริงมีแค่ ring buffer
> ของ sightings, แต่ hero/pos ในนั้น**ถูกอ่านแล้ว** โดย [`heading_multiplier()`](file:///g:/G-Maiden/src-tauri/src/motion.rs#L126) เพื่อประเมิน
> ทิศก่อนหาย (ดูหัวข้อ 1) — ยังไม่ใช่ full path/lane prediction.

## 4. Logic

```
assess(missing):                         // missing = [(hero, missing_ms, last_pos)]
  p_safe = 1.0
  for (hero, ms, _) in missing:
    base = missing_risk(ms)               // 0 ก่อน 5s; ramp ~0.7 peak ~12s; decay หลังจากนั้น
    if base <= 0: continue
    r = clamp(base * heading_multiplier(hero), 0.0, 1.0)   // ปรับตามทิศก่อนหาย
    names.push(hero); p_safe *= (1 - r)   // "อย่างน้อย 1 ตัวกำลังแก๊ง"
  probability = 1 - p_safe
  if names.len() >= 2: probability = min(probability * 1.15, 1.0)   // coordinated-gank boost
  emit GankRisk { probability, missing_heroes: names, eta_ms }
```

- **Per-hero risk:** ฟังก์ชันของเวลาหายจากแมพ ([`missing_risk`](file:///g:/G-Maiden/src-tauri/src/motion.rs#L168)) — 0 ก่อน 5s, ramp
  ถึง ~0.7 ราว 12s, แล้ว decay (floor 0.1) เพราะหายนานมักหมายถึง farm/TP ไม่ใช่แก๊ง
- **Heading multiplier (shipped 2026-07-18):** [`heading_multiplier(hero)`](file:///g:/G-Maiden/src-tauri/src/motion.rs#L126) อ่าน 2 sample
  ล่าสุดของฮีโร่นั้นใน ring buffer (trail ก่อนหายจากแมพ) เทียบทิศเดินกับทิศเข้ากลางแมพ —
  มุ่งเข้า (เตรียมแก๊ง) ยก risk สูงสุด ×1.22, เดินออก (ฟาร์ม/ถอย) ลด risk เหลือต่ำสุด ×0.78,
  ไม่มี trail ที่ใช้ได้ (sample เดียว/หยุดนิ่ง/อยู่กลางแมพอยู่แล้ว) → neutral ×1.0 (พฤติกรรมเดิม)
- **ETA estimate:** [`eta_estimate(ms)`](file:///g:/G-Maiden/src-tauri/src/motion.rs#L181) — ยิ่งหายนานยิ่งใกล้มาถึง (floor 1s); ไม่มีการ
  คำนวณระยะทางจริงหรือ lane
- **Ring buffer cleanup:** evict entries >5 min ทุกครั้งที่ [`record`](file:///g:/G-Maiden/src-tauri/src/motion.rs#L55)

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
- ระดับ high: ส่งต่อ G-Signal จัดการ (ดู [[FEAT-G-SIGNAL]]) — threshold ขึ้นกับ
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
