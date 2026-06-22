# FEAT-G-SENTRY — Fog of War Monitor

> **Module:** G-Sentry · **Priority:** Core · **Phase:** 2
> **SRS:** §3.1 · **Eng Spec:** §2.1 · **TDD:** §2 `sentry`

---

## 1. Purpose

ตรวจจับฮีโร่ศัตรูตำแหน่งแก๊ง (Mid, Pos 4/5) ที่หายจากวิสัยทัศน์เกิน 5 วินาที
แล้วส่ง event ให้ G-Motion ประเมินความเสี่ยง. เป็น **ต้นทางของ critical path** ทั้งหมด.

## 2. Input

| Source | Data | Rate |
| --- | --- | --- |
| GSI tick | `hero.is_visible`, `hero.role`, `clock_time` | ทุก 500ms (SRS §3.1) |
| Minimap CV | `enemy_position { hero, x, y }` | 5–15 Hz (adaptive, TDD §5) |

## 3. Internal State

```rust
struct SentryState {
    per_hero: HashMap<HeroId, HeroTracker>,
}
struct HeroTracker {
    last_seen_at: Instant,
    last_seen_pos: Vec2,
    is_visible: bool,
    role: Role,          // mid, pos4, pos5, carry, offlane
}
```

## 4. Logic

```
every GSI tick:
  for each enemy hero:
    if visible → update last_seen_at, last_seen_pos, is_visible=true
    if !visible && role in [mid, pos4, pos5]:
      missing_for = now - last_seen_at
      if missing_for > 5s:
        emit EnemyMissing { hero, missing_for_ms, last_pos, role }
```

- **Adaptive capture:** เมื่อ missing เริ่มนับ → สั่ง capture module เร่งเป็น ~15 Hz (TDD §5)
- **Dedup:** ไม่ emit ซ้ำถ้า `EnemyMissing` สำหรับ hero เดิมยังไม่ถูก resolve (กลับมามองเห็น)

## 5. Output Event

```rust
EnemyMissing {
    hero: HeroId,
    missing_for_ms: u32,
    last_pos: Vec2,
    role: Role,
}
```

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
- [ ] emit `EnemyMissing` event ถูกต้อง (hero, pos, role, duration)
- [ ] dedup: ไม่ emit ซ้ำสำหรับ hero ที่ยัง missing อยู่
- [ ] adaptive capture: เร่ง CV rate เมื่อเริ่มสงสัย
- [ ] CPU contribution ≤0.3% (ส่วนของ sentry logic เท่านั้น)
- [ ] cloud-loss: ทำงานได้โดยไม่ต้องใช้ cloud
