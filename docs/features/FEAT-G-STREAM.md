---
title: "FEAT-G-STREAM — Streamer Co-host Mode"
doc_id: "FEAT-G-STREAM"
status: "active"
version: "0.1.0"
updated: "2026-10-05"
owner: "Boss"
source_of_truth: true
complexity: "C-3"
risk: "HIGH"
---

# FEAT-G-STREAM — Streamer Co-host Mode

> **สถานะ (2026-07): ยังไม่ได้ทำ (spec ล่วงหน้า) — ไม่มีโมดูลนี้ในโค้ด (`src-tauri/src/`)**
> ไม่มี `mod stream` ใน `main.rs` และไม่มีไฟล์ `stream.rs` — เอกสารนี้เป็น design vision ล่วงหน้า ยังไม่ได้ implement.
> หมายเหตุ dependency: `G-Memory` และ `G-Persona` ที่อ้างถึงด้านล่างก็ยังไม่มีเป็นโมดูลจริงในโค้ดเช่นกัน.

> **Module:** G-Stream · **Priority:** Companion P2 · **Phase:** 8
> **PRD:** [[product-requirements|PRD]] §3A G-Stream · **SRS:** [[software-requirements-specification|SRS]] §3.12

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

## 9. DL-006 Lineage Contract (approved design; runtime not implemented)

### 9.1 Source and output boundary

| Source | Transport | Allowed output | Forbidden output |
| --- | --- | --- | --- |
| G-Sensory events and public GSI fields | In-process event handoff to the overlay | Clock, team score, public event labels, and explicitly approved hero/event text | Raw GSI, SteamID, MMR/rank, real name, exact private stats |
| G-Memory | Local in-process read only | Qualitative public-safe state, if explicitly enabled | Personal memory details, exact hotspots, history, or MMR |
| G-Log | None | No direct stream output | JSONL, risk traces, and local logs |

This contract defines overlay-only stream-safe output. There is no OBS socket, streaming
endpoint, telemetry route, or other external transport in this slice; the broadcaster may
capture the already-filtered overlay through normal screen capture.

### 9.2 Fail-closed redaction algorithm

```text
candidate = project(input, PUBLIC_ALLOWLIST)
if an unknown field is present or projection fails:
    drop the event
safe_event = candidate - SENSITIVE_DENYLIST
render/text-to-speech only safe_event
```

The allowlist is authoritative even when the denylist is incomplete. Text must be generated
from `safe_event`; arbitrary raw audio cannot be redacted after synthesis. Stream mode is
an output-layer toggle and must not gate, delay, or mutate G-Signal evaluation.

### 9.3 Fallback and evidence

- Redaction error → suppress the event or use a generic safe phrase; never pass through raw text.
- Missing public fields → omit them, never substitute private fields.
- Acceptance requires fixtures for MMR/name/memory/unknown-field redaction, a real-time
  toggle test, a no-egress check, and proof that G-Signal output remains available.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-05 | Added the DL-006 source, overlay-only boundary, fail-closed redaction, fallback, privacy, and evidence contract. |
