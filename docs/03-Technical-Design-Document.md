# G-Maiden — Technical Design Document (TDD)

> สถาปัตยกรรมระดับ implementation: component, การไหลของข้อมูล, โมเดล concurrency, การออกแบบ
> เส้นทางวิกฤต, resilience, การกำกับทรัพยากร, ADR และ Risk register.
> Source of truth ของ "จะสร้างยังไง". อ่านคู่กับ `02-Engineering-Spec.md` (contracts).

---

## 1. ภาพรวมสถาปัตยกรรม (Two-tier, latency-split)

ตาม SRS §2.1 — แยกตาม latency requirement:

- **Tier A — Local Gateway (G-Sensory):** Rust core ใน Tauri. ถือ critical path ทั้งหมด.
  รอดได้แม้ cloud หลุด (fallback local SLM/templates).
- **Tier B — Cloud Brain (Maiden Scribe):** Gemini. persona narration + วิเคราะห์ลึก. non-critical, degrade gracefully.

```
Dota 2  ──GSI POST :3000──►  ┌──────────── Rust Core (Tier A) ───────────┐
                             │ GSI Server (axum/tokio)                    │
Screen ─DXGI capture──────►  │ Minimap CV (ort/imageproc)                 │
                             │   │                                        │
                             │   ▼                                        │
                             │ G-Sentry ─► G-Motion ─► G-Signal ──┐       │
                             │                                    ▼       │
                             │ Audio Engine (rodio) ◄── interrupt channel │
                             │ G-Log (SQLite) ◄── decisions/outcomes      │
                             │ Brain Router ──► Cloud | LocalSLM | Tmpl   │
                             └──────┬─────────────────────┬──────────────┘
                                IPC │ (Tauri events)      │ async (non-critical)
                                    ▼                     ▼
                          React Overlay UI         Gemini 2.0 Flash (Tier B)
```

---

## 2. Component breakdown (Rust core)

| Component | หน้าที่ | Thread/Task |
| --- | --- | --- |
| `gsi_server` | รับ GSI POST, parse, ออก `GameTick` | tokio task |
| `capture` | DXGI duplication ของ region minimap | dedicated thread (throttled) |
| `vision` | ตรวจไอคอนศัตรู → ตำแหน่ง | thread pool (rayon) |
| `sentry` | ติดตาม missing >5s | tokio task |
| `motion` | ring buffer 5 นาที + ทำนายเส้นทาง | tokio task |
| `signal` | threshold + interrupt (critical) | **high-priority** path |
| `audio` | playback + interrupt channel | dedicated thread (realtime-ish) |
| `brain_router` | เลือก Cloud/SLM/Template + redaction | tokio task |
| `glog` | เขียน SQLite, ป้อน tuning กลับ | tokio task (batched writes) |
| `governor` | วัด CPU/RAM/FPS, สั่ง throttle | tokio task (1Hz) |

การสื่อสารภายในใช้ **bounded channels** (crossbeam/tokio mpsc). ช่อง interrupt ของ audio เป็น
**priority สูงสุด** และ non-blocking.

---

## 3. Critical path — G-Signal sequence (≤300ms)

```
capture(frame) ─30ms─► vision(positions) ─50ms─► motion(prob) ─20ms─►
signal: prob>85%? ─10ms─► [interrupt audio] ─30ms─► [play cached clip] ─40ms─► 🔊
                                                                   total ≈180ms
```

หลักการที่ทำให้ไม่หลุด budget:
1. **ไม่มี LLM/network ในเส้นทางนี้** — เสียงมาจาก cache, การตัดสินใจเป็น rule-based
2. capture loop **วิ่งล่วงหน้าอยู่แล้ว** — ขั้น 1 คือ "หยิบ frame ล่าสุด" ไม่ใช่ "เริ่ม capture"
3. interrupt เป็น channel send ไม่ block; audio thread จัดการสลับคลิปเอง
4. วัดด้วย `timestamp_ms` ทุก hop → ออก `ResourceStat`/trace เพื่อพิสูจน์ p99

---

## 4. โมเดล Concurrency & threading

- **async runtime:** tokio (multi-thread) สำหรับ I/O (GSI, cloud, SQLite)
- **CPU-bound:** vision ใช้ rayon pool แยก ไม่แย่ง tokio worker
- **realtime-ish:** audio thread แยก, OS priority สูงกว่าปกติเล็กน้อย
- **backpressure:** ทุก channel bounded; ถ้าเต็ม drop frame เก่า (capture) ดีกว่าค้าง
- **no shared mutable global:** state ต่อโมดูลถือใน task เดียว, สื่อสารด้วย message passing

---

## 5. Minimap Computer Vision (เหตุผล + ดีไซน์ — แก้ข้อจำกัด GSI)

GSI ของ Dota 2 **ไม่เปิดเผยตำแหน่งฮีโร่ศัตรู** (เห็นเฉพาะของเรา + ข้อมูลจำกัด). G-Sentry/G-Motion
ต้องการตำแหน่งศัตรู → อ่านจาก minimap:

1. DXGI Desktop Duplication ดึงเฉพาะ **bounding box ของ minimap** (config ได้ตาม resolution/HUD scale)
2. ตรวจไอคอนฮีโร่ศัตรู: เริ่มด้วย **template matching** (imageproc) ของ portrait 10 ฮีโร่ในเกมนั้น
   (รู้รายชื่อจาก draft/GSI) → ถ้าแม่นไม่พอ ยกระดับเป็น **ONNX detector เล็ก** (ort)
3. map พิกัด pixel → พิกัดเกม → ป้อน `sentry`/`motion`
4. capture แบบ **adaptive rate:** ปกติ ~5–8Hz, เร่งเป็น ~15Hz เมื่อ Sentry สงสัย (missing เริ่มนับ)

**Trade-off:** CV เพิ่ม CPU — จึงจำกัด region เล็ก + adaptive rate + GPU-assisted capture เพื่ออยู่ใน 2.5%.
นี่คือ Risk R-02.

---

## 6. Brain Router & Resilience (SRS §5.2)

```
                       ┌── online?  ──► Cloud (Gemini)  ── persona รวย, วิเคราะห์ลึก
Brain Router ──────────┤
(non-critical text)    ├── cloud fail / offline ──► Local SLM (Qwen2.5, lazy-load)
                       │
                       └── SLM ไม่พร้อม / latency สูง ──► Template engine (เร็วเสมอ)
```

- critical alerts (G-Signal) **ไม่พึ่ง router เลย** — ใช้ cached audio เสมอ → รอดทุกกรณี
- router ทำ **redaction** ก่อนส่งขึ้น cloud (ตัด PII/G-Log ดิบ)
- timeout/circuit-breaker: cloud fail ติดกัน N ครั้ง → สลับ local จนกว่าจะ healthy

---

## 7. การกำกับทรัพยากร (Resource Governor)

`governor` วัดทุก 1s แล้วบังคับ budget:
- **CPU > 2.5%** → ลด capture rate, ลด vision frequency, batch งาน
- **RAM ใกล้ 400MB** → unload SLM, ลด cache, GC ring buffer ส่วนเกิน
- **FPS impact > 3%** → ลด overlay redraw, ปิด effect หนัก (blur), drop ไป static HUD
- ส่ง `ResourceStat` ให้ UI แสดงสถานะ และ log ลง G-Log เพื่อจูน

Overlay: หน้าต่าง transparent แยก, composited โดย DWM, **click-through** (WS_EX_TRANSPARENT) ยกเว้น
แผง control. ห้ามวาดทับ region minimap/skill bar/stats (อ่านพิกัดจาก config resolution).

---

## 8. โครงสร้างโปรเจกต์ (เป้าหมาย)

```
G-Maiden/
├─ src-tauri/            # Rust core
│  ├─ src/
│  │  ├─ gsi/  vision/  sentry/  motion/  signal/
│  │  ├─ audio/  brain/  glog/  governor/
│  │  └─ main.rs
│  └─ tauri.conf.json
├─ src/                  # React (overlay + dashboard ใช้ร่วม)
│  ├─ overlay/  dashboard/  components/  store/
├─ assets/voice-cache/   # คลิปเสียง critical ที่ render ล่วงหน้า
├─ models/               # Piper voice + SLM (โหลดแยก, ไม่ commit ไฟล์ใหญ่)
├─ docs/                 # เอกสารชุดนี้
└─ tests/perf/           # latency/CPU/RAM/FPS harness (Definition of Done)
```

---

## 9. Architecture Decision Records

| ADR | การตัดสินใจ | เหตุผล |
| --- | --- | --- |
| **ADR-01** (มีอยู่แล้ว) | ทุกโมดูล prefix `G-` | brand unity / scalability |
| **ADR-02** | Tauri v2 (ไม่ใช่ Electron) | RAM/CPU budget; transparent overlay; WebView2 |
| **ADR-03** | critical path เป็น Rust ล้วน, cloud/UI ห้ามอยู่บนเส้นทาง ≤300ms | latency + resilience |
| **ADR-04** | เสียง G-Signal ใช้ **audio cache + slot-splicing** ไม่สังเคราะห์สด | budget latency |
| **ADR-05** | ตำแหน่งศัตรูจาก **minimap CV** (GSI ไม่ให้) | functional necessity |
| **ADR-06** | G-Log = SQLite local-only, no egress | privacy-first |
| **ADR-07** | SLM lazy-load เฉพาะ fallback; ปกติใช้ cloud/template | RAM budget |

---

## 10. Risk Register

| ID | ความเสี่ยง | ผลกระทบ | การรับมือ |
| --- | --- | --- | --- |
| **R-01** | SLM กิน RAM เกิน 400MB | ผิด NFR | lazy-load only; ใช้ 0.5B หรือ template fallback; นิยาม budget เป็น background footprint |
| **R-02** | minimap CV กิน CPU เกิน 2.5% / แม่นยำต่ำ | ผิด NFR / เตือนผิด | region เล็ก + adaptive rate + GPU capture; เริ่ม template ค่อยยก ONNX |
| **R-03** | GSI ไม่มีข้อมูลศัตรูพอ | ฟีเจอร์หลักอ่อน | พึ่ง CV เป็นแหล่งหลักของตำแหน่งศัตรู; GSI ใช้ของเรา/timing |
| **R-04** | Piper สังเคราะห์สดเกิน budget | G-Signal หลุด 300ms | critical ใช้ cache เสมอ; สดเฉพาะ non-critical |
| **R-05** | WebView2 เวอร์ชันต่างกันเรนเดอร์เพี้ยน | UI ไม่สม่ำเสมอ | pin runtime ตอน bundle; ทดสอบ Win10/11 |
| **R-06** | overlay บัง UI เกม / anti-cheat กังวล | UX/บัญชีเสี่ยง | read-only overlay, ไม่ inject เกม, ไม่อ่าน memory; ใช้ GSI+screen capture ที่ถูกกติกา |
| **R-07** | cloud latency กระตุก narration | persona สะดุด | queue preemptible + local fallback |

> **R-06 หมายเหตุ:** ออกแบบให้ **ไม่ยุ่งกับ process เกม** เลย (ไม่ inject, ไม่อ่าน memory) — ใช้เฉพาะ
> GSI (ทางการของ Valve) + screen capture ภายนอก เพื่อความปลอดภัยจาก VAC.
