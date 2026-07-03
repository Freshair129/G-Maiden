# FEAT-G-STREAM — Streamer Co-host Mode

> **สถานะ (2026-07): ยังไม่ได้ทำ (spec ล่วงหน้า) — ไม่มีโมดูลนี้ในโค้ด (`src-tauri/src/`)**
> ไม่มี `mod stream` ใน `main.rs` และไม่มีไฟล์ `stream.rs` — เอกสารนี้เป็น design vision ล่วงหน้า ยังไม่ได้ implement.
> หมายเหตุ dependency: `G-Memory` และ `G-Persona` ที่อ้างถึงด้านล่างก็ยังไม่มีเป็นโมดูลจริงในโค้ดเช่นกัน.

> **Module:** G-Stream · **Priority:** Companion P2 · **Phase:** 8
> **PRD:** §3A G-Stream · **SRS:** §3.12

---

## 1. Purpose

(แผน) โหมดผู้ช่วยสำหรับสตรีมเมอร์ — ปรับ overlay/โทนสำหรับออกอากาศ
+ ปกปิดข้อมูลละเอียดอ่อน (MMR, personal stats, G-Memory data)
เพื่อให้ Maiden เป็น co-host ที่ปลอดภัยสำหรับ broadcast.

## 2. Features

### 2a. PII/Sensitive Data Redaction

| Data | Normal Mode | Stream Mode |
| --- | --- | --- |
| MMR / rank | แสดง | **ซ่อน** |
| Player real name | แสดง | **ซ่อน** |
| G-Memory personal stats | ใช้ + แสดง | ใช้ (internal) แต่ **ไม่แสดง/ไม่พูด** |
| Death hotspots | แสดง | aggregate only (ไม่ระบุตำแหน่งเฉพาะ) |
| G-Log raw data | local only | local only (ไม่เปลี่ยน) |

### 2b. Overlay Adjustments

- Cleaner layout สำหรับ broadcast (ลด clutter)
- Optional: แสดง Maiden avatar/expression
- Font size ใหญ่ขึ้น (readability สำหรับ viewers)
- Stream-safe colors (ไม่ใช้สีที่ problematic สำหรับ encoding)

### 2c. Co-host Persona

- Maiden พูดกับ "ทุกคนในห้อง" ไม่ใช่แค่ผู้เล่น
- เปิด greeting: *"สวัสดีทุกคนในห้องค่ะ~ วันนี้เราจะพา Crystal Maiden ไปได้ไกลแค่ไหนกันนะ"*
- Commentary สำหรับ viewers: อธิบายเกมมากกว่าปกติ (ถ้า verbosity ≥3)

## 3. Configuration

```json
{
  "stream_mode": {
    "enabled": false,
    "redact_mmr": true,
    "redact_player_name": true,
    "redact_memory_details": true,
    "overlay_style": "broadcast",   // broadcast | minimal | off
    "co_host_greetings": true
  }
}
```

## 4. Logic

```
if stream_mode.enabled:
  // Redaction layer
  filter all outgoing text/audio through redaction:
    replace MMR references with "อันดับปัจจุบัน"
    strip player real name → "คุณ" / "ผู้เล่น"
    suppress G-Memory personal detail in voice output
  
  // Overlay
  switch overlay layout to broadcast mode
  
  // Persona
  if co_host_greetings:
    on match start: play greeting clip
    address audience periodically
```

## 5. Privacy Guardrail

- G-Memory/G-Log data **ยังไม่ส่งออก** (inherit จาก GATE P6)
- Stream mode เพิ่ม layer: ไม่ **แสดง/พูด** ข้อมูลที่ stream viewers ไม่ควรเห็น
- แม้ G-Memory ใช้ภายในได้ (context for LLM) แต่ output ต้องผ่าน redaction

## 6. Constraints

- Toggle ได้ real-time (เปิด/ปิด stream mode ระหว่างเกม)
- ไม่กระทบ G-Signal latency (redaction อยู่ output layer)
- ไม่เพิ่ม CPU overhead มากกว่า 0.1%

## 7. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Overlay rendering | **G-Sensory** |
| Audio output | Audio Engine |
| Memory data (to redact) | **G-Memory** |
| Persona control | **G-Persona** (verbosity/tone) |

## 8. Acceptance Criteria

- [ ] stream mode on: MMR ไม่แสดง/ไม่พูด
- [ ] stream mode on: player name redacted
- [ ] stream mode on: G-Memory details ไม่พูดออกอากาศ
- [ ] co-host greeting เล่นตอนเริ่มแมตช์
- [ ] overlay switch to broadcast layout
- [ ] toggle real-time ไม่ crash
- [ ] G-Signal ทำงานปกติใน stream mode
- [ ] no-egress ยังคง pass (inherit GATE P6)
