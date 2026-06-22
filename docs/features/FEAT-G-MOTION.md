# FEAT-G-MOTION — Heatmap & Path Prediction

> **Module:** G-Motion · **Priority:** Core · **Phase:** 3
> **SRS:** §3.2 · **Eng Spec:** §2.2 · **TDD:** §2 `motion`

---

## 1. Purpose

เก็บประวัติตำแหน่งศัตรูย้อนหลัง 5 นาที แล้วคำนวณความน่าจะเป็นของเส้นทาง gank
(0–100%) เพื่อป้อนให้ G-Signal ตัดสินว่าถึง danger threshold (>85%) หรือยัง.

## 2. Input

| Source | Data |
| --- | --- |
| G-Sentry | `EnemyMissing { hero, missing_for_ms, last_pos, role }` |
| Vision (continuous) | Ring buffer ของ `enemy_position` ย้อน 5 นาที |

## 3. Internal State

```rust
struct MotionState {
    ring_buffer: RingBuffer<EnemySnapshot>,  // 5 min window, ~6000 entries at 20Hz
    heatmap: Grid<f32>,                       // probability density per cell
}
```

## 4. Logic

```
on EnemyMissing(hero):
  history = ring_buffer.filter(hero, last_5_min)
  paths = predict_gank_paths(hero.last_pos, hero.role, history)
  probability = aggregate_path_probability(paths, player_lane)
  emit GankRisk { lane, probability, paths, eta_estimate }
```

- **Path prediction:** ใช้ heuristic (ไม่ใช่ ML) — map topology + hero role + historical frequency
- **ETA estimate:** ระยะทาง last_pos → player_lane / average movement speed
- **Ring buffer cleanup:** evict entries >5 min ทุก tick

## 5. Output Event

```rust
GankRisk {
    lane: Lane,
    probability: u8,        // 0–100
    predicted_paths: Vec<Path>,
    eta_ms: u32,
}
```

→ ส่งเข้า **G-Signal**

## 6. Persona Behavior

- ระดับ medium (50–84%): *"จากแผนภูมิความร้อน... มีโอกาสสูงถึง 78% ที่พวกเขาจะกบดานอยู่บริเวณเนินเขานี้"*
- ระดับ low (<50%): ไม่พูด (ไม่รบกวน)
- ระดับ high (≥85%): ส่งต่อ G-Signal จัดการ (ดู FEAT-G-SIGNAL)

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

- [ ] คำนวณ probability 0–100 ภายใน 20ms
- [ ] ring buffer เก็บ 5 min แม่นยำ (ไม่รั่ว, evict ตรงเวลา)
- [ ] predicted_paths ≥1 เส้นทางเมื่อ probability >50%
- [ ] eta_estimate สมเหตุสมผล (±30% ของ actual movement time)
- [ ] memory ≤1MB สำหรับ motion state ทั้งหมด
- [ ] ไม่ crash เมื่อ ring buffer ว่าง (เกมเพิ่งเริ่ม)
