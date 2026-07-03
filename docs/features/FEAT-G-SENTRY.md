# FEAT-G-SENTRY — Fog of War Monitor

> **Module:** G-Sentry · **Priority:** Core · **Phase:** 2
> **SRS:** §3.1 · **Eng Spec:** §2.1 · **TDD:** §2 `sentry`

---

## 1. Purpose

ตรวจจับฮีโร่ศัตรู **ทุกตัว** ที่หายจากวิสัยทัศน์เกิน 5 วินาที แล้วส่ง event ให้
G-Motion ประเมินความเสี่ยง. เป็น **ต้นทางของ critical path** ทั้งหมด.

> **สถานะ (2026-07): `sentry.rs` ไม่มี concept ของ role** — flag ศัตรูทุกตัวที่หาย
> >5s เท่ากันหมด (ไม่กรอง Mid/Pos4/Pos5). การกรองตามตำแหน่งแก๊งยังไม่ได้ทำ.

## 2. Input

| Source | Data | Rate |
| --- | --- | --- |
| Minimap CV | `Detection { name, x, y }` (per-frame) | 5–15 Hz (adaptive, TDD §5) |

> **หมายเหตุ:** input จริงของ `Sentry::update` คือ `&[Detection]` จาก minimap CV
> (ไม่ใช่ `hero.role` จาก GSI — sentry ไม่มี role). last_pos ถูก normalise 0..1.

## 3. Internal State

```rust
struct Sentry {
    tracks: HashMap<String, Track>,   // key = hero name
}
struct Track {
    last_seen_ms: u64,
    last_pos: (f32, f32),             // normalised 0..1
    missing_emitted: bool,            // edge flag — emit once per absence
}
```

> **สถานะ (2026-07): ไม่มีฟิลด์ `role`** — struct จริงคือ `Track` ข้างบน
> (ไม่มี `is_visible`; ใช้ `last_seen_ms` + threshold แทน).

## 4. Logic

```
every CV frame (Sentry::update):
  for each detected hero:
    update last_seen_ms, last_pos; re-arm missing_emitted = false
  for each tracked hero:
    elapsed = now_ms - last_seen_ms
    if elapsed >= 5000ms && !missing_emitted:      // ทุกตัว, ไม่กรอง role
      missing_emitted = true
      emit EnemyMissing { hero, missing_for_ms, last_pos }
```

- **Adaptive capture:** เมื่อ missing เริ่มนับ → สั่ง capture module เร่งเป็น ~15 Hz (TDD §5)
- **Dedup:** ไม่ emit ซ้ำถ้า `EnemyMissing` สำหรับ hero เดิมยังไม่ถูก resolve (กลับมามองเห็น)

## 5. Output Event

```rust
EnemyMissing {
    hero: String,
    missing_for_ms: u64,
    last_pos: (f32, f32),   // normalised 0..1
}
```

> **สถานะ (2026-07): ไม่มีฟิลด์ `role`** ใน `EnemyMissing`.

→ ส่งเข้า **G-Motion** ผ่าน bounded channel

## 6. Persona Behavior (Maiden Voice)

- ระดับ info: *"ดูเหมือนเลนล่างจะเงียบแปลกๆ นะคะ... พวกเขาหายไปจากสายตาของฉันเกิน 5 วินาทีแล้ว"*
- ใช้โทนห่วงใย ไม่ตื่นตระหนก (panic เป็นหน้าที่ G-Signal)
- ถ้าหาย >15s อาจเพิ่มน้ำเสียงกังวล

## 7. Constraints

- **Latency:** sentry logic ≤10ms (Eng Spec §1 ขั้น 4)
- **CPU:** ตัว sentry เองเบา; bottleneck อยู่ที่ CV (ดู FEAT-G-SENSORY)
- **GSI limitation:** GSI ไม่ส่งตำแหน่งศัตรู → ต้องพึ่ง minimap CV (TDD §5, Risk R-02)
- **Channel:** bounded; ถ้า G-Motion ไม่ทัน consume → drop event เก่า

## 8. Dependencies

| ต้องการจาก | Module/Component |
| --- | --- |
| GSI tick stream | `gsi_server` (TDD §2) |
| Enemy positions | `vision` (minimap CV) |
| → ส่งออกไป | **G-Motion** |

## 9. Acceptance Criteria

- [ ] ตรวจจับ hero missing >5s ได้ภายใน 1 GSI tick หลังหลุด vision
- [ ] emit `EnemyMissing` event ถูกต้อง (hero, last_pos, missing_for_ms)
- [ ] dedup: ไม่ emit ซ้ำสำหรับ hero ที่ยัง missing อยู่
- [ ] adaptive capture: เร่ง CV rate เมื่อเริ่มสงสัย
- [ ] CPU contribution ≤0.3% (ส่วนของ sentry logic เท่านั้น)
- [ ] cloud-loss: ทำงานได้โดยไม่ต้องใช้ cloud
