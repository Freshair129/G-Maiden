# FEAT-G-SIGNAL — Real-time Gank Warning (Critical Path)

> **Module:** G-Signal · **Priority:** Core · **Phase:** 3
> **SRS:** [[software-requirements-specification|SRS]] §3.3 · [[engineering-spec|Eng Spec]] §2.3, §3 · [[technical-design-document|TDD]] §3
> **GATE:** P3 — p99 ≤300ms, p50 ≤250ms

---

## 1. Purpose

ระบบแจ้งเตือนวิกฤตแบบทันที. เมื่อ G-Motion รายงาน probability ข้าม danger threshold
จะ **interrupt** เสียงที่กำลังเล่น แล้วเล่นคลิปเตือนทันที. รวมถึงพฤติกรรม
**Belief Revision** — เปลี่ยนคำพูดกลางประโยคเมื่อข้อมูลเปลี่ยน.

> **สถานะ (2026-07): threshold ที่ ship จริงเป็น runtime `Sensitivity` enum**
> ([`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs)), ตั้งผ่าน [`set_cv_signal_sensitivity`](file:///g:/G-Maiden/src-tauri/src/main.rs#L359). default = `Med`
> (`#[default]`) = **0.65 danger / 0.40 clear**. 0.85 เป็นแค่ระดับ `Low` / SRS
> baseline — เพิ่ม Sensitivity มาเพราะ bar 85% แทบไม่เคย fire ในเกมจริง. ระดับ:
> Low `(0.85, 0.50)`, Med `(0.65, 0.40)`, High `(0.50, 0.30)`.

**นี่คือ hard-latency path ที่สำคัญที่สุดของ G-Maiden.**

## 2. Input

| Source | Data |
| --- | --- |
| G-Motion | `GankRisk { probability: f32, missing_heroes, eta_ms }` |

## 3. Internal State

```rust
struct Signal {
    alerted: bool,   // hysteresis latch
    danger: f32,     // จาก Sensitivity ที่เลือก (default 0.65)
    clear: f32,      // จาก Sensitivity (default 0.40)
}
```

> **สถานะ (2026-07): struct จริงเป็น hysteresis latch เท่านั้น** — ไม่มี
> `currently_speaking` / `revision_in_flight` / `cooldown_ms`. thresholds อยู่บน
> instance (ไม่ใช่ const) ให้ capture loop สลับ `Sensitivity` ได้ทุก tick.

## 4. Logic

```
evaluate(risk):                                  // edge-triggered + hysteresis
  if !alerted && risk.probability >= danger:      // danger = จาก Sensitivity (default 0.65)
    alerted = true
    return Alert(SignalAlert { probability, missing_heroes, eta_ms })
  if alerted && risk.probability < clear:         // clear = จาก Sensitivity (default 0.40)
    alerted = false
    return Revision                               // Belief Revision — "เอ๊ะ! เดี๋ยวก่อน!"
  return None
```

> **สถานะ (2026-07):** Belief Revision fire เมื่อ risk **ตกกลับ** ต่ำกว่า clear
> threshold หลังจากเคย alert (ศัตรูโผล่กลับ / อ่านผิด). hysteresis (danger สูง,
> clear ต่ำ) กัน chattering แทนกลไก cooldown แบบเดิม. state machine เป็น pure —
> capture loop เป็นเจ้าของการ voice + log.

## 5. Output

```rust
enum SignalEvent { Alert(SignalAlert), Revision, None }

struct SignalAlert {
    probability: f32,
    missing_heroes: Vec<String>,
    eta_ms: u64,
}
```

→ ส่งเข้า **Audio Engine** (capture loop voice ต่อจาก event)

> **สถานะ (2026-07): ไม่มีฟิลด์ `severity` / `voice_clip_key` / `interrupt`** —
> output จริงคือ `SignalEvent` (Alert/Revision/None) + `SignalAlert` ข้างบน.

## 6. Belief Revision ([[software-requirements-specification|SRS]] §3.3, บังคับ)

เมื่อ Maiden กำลังพูดบทหนึ่งแล้วเงื่อนไขเปลี่ยน:

1. Audio engine รับ `Interrupt(reason)` ผ่าน channel priority สูงสุด
2. หยุดคลิปปัจจุบันที่ **word boundary** (ไม่ตัดดิบ)
3. เล่นคลิปสะดุด **"เอ๊ะ! เดี๋ยวก่อน!"** (cached)
4. ต่อด้วยบทเตือนใหม่ที่อัปเดตแล้ว
5. Log revision ลง G-Log (วัดผลว่าการเปลี่ยนใจเร็ว/ช้าส่งผลต่อการรอดอย่างไร)

## 7. Persona Behavior

- **Critical (ข้าม danger threshold):** *"ถอยเร็ว! ศัตรูกำลังมา!"* — เสียงเร่งด่วน ไม่มีมุก
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
| Anti-spam | Hysteresis latch | danger สูง / clear ต่ำ กัน chatter (แทน cooldown timer) |
| **ไม่มี LLM/network** | ทั้ง path | Rule-based + cached audio เท่านั้น |

## 9. Audio Cache Contract

คลิปเป็นไฟล์ `.wav` ของ **announcer pack** ใต้ `assets/voice-cache/{event}/*.wav`
เลือกแบบสุ่มต่อ event ด้วย [`audio::play_random`](file:///g:/G-Maiden/src-tauri/src/audio.rs#L341) ([`speak_event`](file:///g:/G-Maiden/src-tauri/src/main.rs#L76) fallback เป็น SAPI
TTS เมื่อ event ไม่มีคลิป). ไม่ใช่ key `.ogg` ตายตัว.

```
assets/voice-cache/
  danger/*.wav       — คลิปเตือน gank (G-Signal Alert)
  revision/*.wav     — คลิป belief-revision "เอ๊ะ! เดี๋ยวก่อน!"
  ...{event}/*.wav   — event อื่น ๆ ตาม gmaiden-events.json
```

> **สถานะ (2026-07): ไม่มี fixed `.ogg` clip key** — pack `.wav` อ่านสด (drop-in,
> ไม่ต้อง restart), สุ่มหนึ่งคลิปต่อ event.

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
- [ ] probability ข้าม danger threshold → alert fires ภายใน 10ms ของ signal logic
- [ ] Belief Revision: fire เมื่อ risk ตกต่ำกว่า clear threshold หลัง alert, เล่น stutter clip, ต่อบทใหม่
- [ ] hysteresis ป้องกัน chatter (alert ไม่ fire ซ้ำจนกว่าจะ clear แล้วข้าม danger ใหม่)
- [ ] ทำงานได้ offline (ไม่พึ่ง cloud/network)
- [ ] ไม่ crash เมื่อ audio engine ไม่พร้อม (graceful skip)
