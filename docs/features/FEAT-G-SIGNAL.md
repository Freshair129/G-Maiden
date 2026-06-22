# FEAT-G-SIGNAL — Real-time Gank Warning (Critical Path)

> **Module:** G-Signal · **Priority:** Core · **Phase:** 3
> **SRS:** §3.3 · **Eng Spec:** §2.3, §3 · **TDD:** §3
> **GATE:** P3 — p99 ≤300ms, p50 ≤250ms

---

## 1. Purpose

ระบบแจ้งเตือนวิกฤตแบบทันที. เมื่อ G-Motion รายงาน probability >85% จะ **interrupt**
เสียงที่กำลังเล่น แล้วเล่นคลิปเตือนทันที. รวมถึงพฤติกรรม **Belief Revision** —
เปลี่ยนคำพูดกลางประโยคเมื่อข้อมูลเปลี่ยน.

**นี่คือ hard-latency path ที่สำคัญที่สุดของ G-Maiden.**

## 2. Input

| Source | Data |
| --- | --- |
| G-Motion | `GankRisk { lane, probability, paths, eta_ms }` |

## 3. Internal State

```rust
struct SignalState {
    currently_speaking: Option<ClipKey>,
    interruptible: bool,
    revision_in_flight: bool,
    last_alert_at: Instant,
    cooldown_ms: u32,          // ป้องกัน spam (default 3000ms)
}
```

## 4. Logic

```
on GankRisk(risk):
  if risk.probability < DANGER_THRESHOLD (85%): return
  if cooldown_active: return

  if currently_speaking && revision_in_flight == false:
    // Belief Revision — กำลังพูดอยู่แต่ข้อมูลเปลี่ยน
    send Interrupt(reason: "belief_revision") → audio channel (priority สูงสุด)
    revision_in_flight = true
    queue: [stutter_clip("เอ๊ะ! เดี๋ยวก่อน!"), new_alert_clip(risk)]

  else:
    // Normal alert
    send SignalAlert { severity: critical, clip_key, interrupt: true } → audio engine

  last_alert_at = now
  log_to_glog(risk, "signal_fired")
```

## 5. Output

```rust
SignalAlert {
    severity: Severity,     // critical | warning
    voice_clip_key: String, // key → pre-rendered audio cache
    interrupt: bool,        // true = หยุดเสียงที่เล่นอยู่ทันที
}
```

→ ส่งเข้า **Audio Engine** (interrupt channel, non-blocking)

## 6. Belief Revision (SRS §3.3, บังคับ)

เมื่อ Maiden กำลังพูดบทหนึ่งแล้วเงื่อนไขเปลี่ยน:

1. Audio engine รับ `Interrupt(reason)` ผ่าน channel priority สูงสุด
2. หยุดคลิปปัจจุบันที่ **word boundary** (ไม่ตัดดิบ)
3. เล่นคลิปสะดุด **"เอ๊ะ! เดี๋ยวก่อน!"** (cached)
4. ต่อด้วยบทเตือนใหม่ที่อัปเดตแล้ว
5. Log revision ลง G-Log (วัดผลว่าการเปลี่ยนใจเร็ว/ช้าส่งผลต่อการรอดอย่างไร)

## 7. Persona Behavior

- **Critical (≥85%):** *"ถอยเร็ว! ศัตรูกำลังมา!"* — เสียงเร่งด่วน ไม่มีมุก
- **Belief Revision:** *"เอ๊ะ! เดี๋ยวก่อน! ...ไม่ใช่แล้ว ถอยเลยค่ะ!"*
- **ห้ามมีมุกตลกในระดับ critical** — persona comedy อยู่ที่ G-Master/G-Voice
- Nerf CM self-awareness ใช้ได้เฉพาะ post-alert debrief

## 8. Constraints

| Constraint | Target | หมายเหตุ |
| --- | --- | --- |
| End-to-end latency | p50 ≤250ms, p99 ≤300ms | **GATE P3** |
| Signal logic | ≤10ms | Eng Spec §1 ขั้น 4 |
| Audio clips | Pre-rendered cache | ห้ามสังเคราะห์สด (TTS ~80–150ms จะเกิน budget) |
| Interrupt channel | Non-blocking, priority สูงสุด | ไม่ queue หลัง narration ทั่วไป |
| Cooldown | 3s default | ป้องกัน alert spam |
| **ไม่มี LLM/network** | ทั้ง path | Rule-based + cached audio เท่านั้น |

## 9. Audio Cache Contract

```
alert_clips/
  gank_warning_critical.ogg    — "ถอยเร็ว! ศัตรูกำลังมา!"
  belief_revision_stutter.ogg  — "เอ๊ะ! เดี๋ยวก่อน!"
  gank_warning_lane_top.ogg    — "เลนบนอันตราย!"
  gank_warning_lane_mid.ogg    — "กลางเลนระวัง!"
  gank_warning_lane_bot.ogg    — "เลนล่างถอย!"
  ...per-hero slot clips        — "[ชื่อฮีโร่] กำลังมา!"
```

Slot-splicing: ต่อคลิปประโยคหลัก + คลิปชื่อฮีโร่ที่ cache ไว้ (Eng Spec §1)

## 10. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Gank probability | **G-Motion** |
| Audio playback | Audio Engine (`rodio`, interrupt channel) |
| Cached clips | Voice cache (pre-rendered) |
| → Log ออกไป | **G-Log** (signal accuracy tracking) |

## 11. Acceptance Criteria

- [ ] **p99 end-to-end ≤300ms** (capture → audio output, วัดด้วย timestamp_ms)
- [ ] **p50 end-to-end ≤250ms**
- [ ] probability >85% → alert fires ภายใน 10ms ของ signal logic
- [ ] Belief Revision: interrupt at word boundary, เล่น stutter clip, ต่อบทใหม่
- [ ] cooldown ป้องกัน spam (ไม่ fire ซ้ำภายใน 3s)
- [ ] ทำงานได้ offline (ไม่พึ่ง cloud/network)
- [ ] ไม่ crash เมื่อ audio engine ไม่พร้อม (graceful skip)
