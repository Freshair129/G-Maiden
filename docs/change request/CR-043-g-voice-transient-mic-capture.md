---
title: "CR-043 — G-Voice Slice 2: transient PTT microphone capture"
doc_id: "CR-043-g-voice-transient-mic-capture"
status: "accepted"
approved_by: "Boss (explicit approval in chat, 2026-11-07: อนุมัติตามร่าง)"
approved_date: "2026-11-07"
version: "0.1.1"
updated: "2026-11-07"
owner: "Boss"
complexity: "C-3"
risk: "HIGH"
related_docs: ["CR-041-g-voice-ptt-turn-lifecycle", "FEAT-G-VOICE", "mvp-decisions", "MVP-038-local-stt-evaluation", "software-requirements-specification"]
---

# CR-043 — G-Voice Slice 2: เปิดไมค์ชั่วคราวระหว่างกด PTT

> **สถานะ:** accepted 2026-11-07 — Boss อนุมัติตามร่าง รวม §8: ใช้ `cpal`, เพดาน 15 s / 480,000 bytes, timeout 2 s, `voice.micEnabled` ปิดเป็นค่าเริ่มต้น, UI toggle รวม PR เดียวกับ backend (draft จนดูด้วยตา).
> **Risk: HIGH** — เปิดไมโครโฟน (privacy boundary) และเพิ่ม direct dependency. ไม่เพิ่ม network path ใดๆ.

## 1. เหตุผลและขอบเขต

[[CR-041-g-voice-ptt-turn-lifecycle]] (merged `0693b2f1`) มี PTT + `VoiceTurn` แต่ backend ยังเป็น `NoSttBackend`.
[[MVP-038-local-stt-evaluation]] §6 กำหนดให้ตั้งเพดาน audio buffer ก่อน integration. Slice นี้เปิดไมค์**เฉพาะช่วงกด PTT**
เก็บ PCM ไว้ใน memory ภายใต้เพดาน แล้ว**ทิ้งทันที** — ยังไม่มี STT จึงยังไม่มี transcript.

**In scope:** capture backend, buffer bound, device/permission errors, การทิ้งข้อมูล, ตัวเลือกเปิด/ปิดไมค์, การพิสูจน์ no-persist/no-egress.
**Out of scope:** STT, การตีความ/คำตอบ, TTS คำตอบ, VAD/noise suppression, การเลือกอุปกรณ์ไมค์ (ใช้ default input device), resampling คุณภาพสูง.

## 2. Dependency

- ใช้ **`cpal` 0.15.3** เป็น direct dependency ใน `src-tauri/Cargo.toml` — crate และเวอร์ชันนี้**อยู่ใน `Cargo.lock` แล้ว**
  (transitive ผ่าน `rodio` 0.19) จึงไม่เพิ่ม crate ใหม่ใน dependency tree และไม่เพิ่ม network/telemetry code. License: Apache-2.0
- ไม่ใช้ `windows-capture`/WGC และไม่เขียน WASAPI ตรง (ทางเลือกสำรองถ้า cpal มีปัญหา ให้หยุดและเสนอ CR ใหม่)
- `Cargo.lock` ต้องไม่มี package ใหม่; reviewer ตรวจ diff ของ lock

## 3. Capture contract

| หัวข้อ | สัญญา |
| --- | --- |
| เปิดสตรีม | เมื่อ `VoiceTurn` เข้า `preparing` เท่านั้น (หลัง PTT press และ mic setting เปิด) |
| อุปกรณ์ | default input device ของ Windows; ไม่มีอุปกรณ์ → `unavailable(no_input_device)` |
| Format | ขอ native config ของอุปกรณ์; แปลงใน worker เป็น **mono f32 → i16 @ 16 kHz** (เฉลี่ยช่อง + decimation แบบ linear; คุณภาพเต็มรอ STT slice) |
| เพดาน buffer | **15 s × 16,000 Hz × 1 ch × 2 bytes = 480,000 bytes** (ตรง hold cap ของ CR-041); allocate ครั้งเดียวตอน preparing; ข้อมูลเกินเพดานถูกตัดทิ้ง ไม่ grow |
| อายุสูงสุดของข้อมูล | buffer ถูก zero แล้ว drop เมื่อ turn จบ (`decoding` ด้วย `NoSttBackend` ถัดไปเป็น `unavailable`), cancel, error หรือ app exit; อายุไม่เกิน hold cap + 1 s |
| Audio callback | callback ของ cpal ห้าม lock mutex ที่ Voice/G-Signal ใช้ และห้าม allocate; ส่งเฟรมผ่าน bounded lock-free ring (ขนาด ≤ 1 s) ให้ worker |
| ปิดสตรีม | release หรือ hold cap → หยุดและ drop stream ทันที (ปล่อย mic handle); เวลาตั้งแต่ release ถึง stream drop ≤ 100 ms (วัดใน test ด้วย fake device) |
| Preparing timeout | สร้างสตรีมไม่สำเร็จใน **2 s** → `unavailable(input_open_failed)` |

## 4. สถานะและเหตุผลเพิ่มใน `VoiceTurn`

เพิ่ม unavailable reasons: `mic_disabled`, `no_input_device`, `input_open_failed`, `mic_permission_denied`.
เพิ่ม failed reason: `input_device_lost` (อุปกรณ์หายระหว่าง listening). ไม่เปลี่ยนชื่อ state/reason เดิม.

Backend ใหม่ `MicCaptureBackend` (ยังไม่มี STT):

```text
press → preparing → (stream ready) listening → release → decoding
      → [ไม่มี STT] unavailable(stt_not_installed) → idle      # buffer ถูกทิ้งก่อน emit
```

ผลคือผู้ใช้ยังเห็น `stt_not_installed` เหมือนเดิม แต่ไมค์ทำงานจริงและเราวัด lifecycle ได้.
Event `voice-turn` คงมีเพียง 4 field เดิม — **ห้ามมีระดับเสียง, จำนวน sample หรือข้อมูลเสียงใดๆ**.

## 5. การยินยอมและการตั้งค่า

- Setting ใหม่ `voice.micEnabled` (bool) ใน `settings.json`, **ค่าเริ่มต้น `false`** — ไม่มีไมค์ทำงานจนผู้ใช้เปิดเอง
- `micEnabled=false` → press ได้ `unavailable(mic_disabled)` และไม่แตะ audio API ใดๆ
- UI: เพิ่ม toggle “อนุญาตให้ใช้ไมโครโฟนขณะกด PTT” ในการ์ด G-Voice พร้อมคำอธิบาย “เสียงอยู่ในเครื่องและถูกลบทันทีเมื่อปล่อยปุ่ม ไม่บันทึก ไม่ส่งออก” และข้อความไทยสำหรับ reason ใหม่ทั้งห้า
- Windows privacy “Let desktop apps access your microphone” ปิด → แมปเป็น `mic_permission_denied` ถ้าตรวจแยกได้; แยกไม่ได้ให้เป็น `input_open_failed` พร้อมข้อความแนะนำให้ตรวจ Windows Settings › Privacy › Microphone

## 6. Privacy invariants (ต้องมีเทสต์)

1. ไม่มีโค้ดเขียน PCM ลงไฟล์, log, G-Log, history, telemetry หรือ crash report
2. ไม่มี network call ใน capture path; module ไม่ import HTTP client
3. Buffer ถูก zero ก่อน drop ทุกทางออก (release, hold cap, cancel, preempt, error, exit)
4. Stream ไม่ถูกเปิดเมื่อ `micEnabled=false` หรือ PTT ไม่ได้กด; ไม่มี always-on mic
5. G-Signal preempt ระหว่าง listening → stream drop + buffer zero โดย preempt path ยังเป็น atomic เดียว (ไม่ lock)

## 7. Acceptance criteria

Rust (`cargo test` + `cargo clippy --all-targets -D warnings`) โดยใช้ trait `InputDevice` ที่ fake ได้:

- [ ] `micEnabled=false` → `mic_disabled`, fake device ไม่ถูกเปิด
- [ ] ไม่มีอุปกรณ์ / เปิดล้ม / timeout 2 s → reason ที่ถูกต้อง; ไม่ panic
- [ ] press → preparing → listening; release → stream ถูก drop ≤ 100 ms และ buffer ถูก zero; จบด้วย `stt_not_installed`
- [ ] ป้อน sample เกิน 15 s → buffer ไม่เกิน 480,000 bytes และไม่ realloc
- [ ] อุปกรณ์หายกลาง listening → `failed(input_device_lost)`, buffer zero
- [ ] preempt / cancel / exit ระหว่าง listening → stream drop + zero
- [ ] mono/16 kHz conversion: stereo 48 kHz sine fixture → ความยาวและ RMS ภายใน ±2%
- [ ] payload `voice-turn` ยังมี 4 field
- [ ] `Cargo.lock` ไม่มี package ใหม่

Frontend (`tsc`, eslint, `vitest run`): toggle ค่าเริ่มต้นปิด, บันทึก `voice.micEnabled`, ข้อความไทยของ reason ใหม่.

**ต้องใช้คน (ไม่ใช่ unit test):** บน Windows จริง — ไฟไมค์/ไอคอนไมค์ใน taskbar ติดเฉพาะตอนกด และดับภายใน ~100 ms หลังปล่อย;
ปิด privacy ไมค์ใน Windows แล้วได้ข้อความถูก; Process Monitor/`netstat` ระหว่างกดยืนยันไม่มีไฟล์/egress ใหม่;
วัด CPU idle เมื่อ mic toggle เปิดแต่ไม่ได้กด (ต้องไม่มี stream). Visual review ของ toggle ใหม่.

## 8. ข้อที่ขอให้ Boss ตัดสิน

1. ใช้ `cpal` (มีใน lock แล้ว) เป็น direct dependency
2. เพดาน 15 s / 480,000 bytes และ timeout เปิดไมค์ 2 s
3. `voice.micEnabled` ค่าเริ่มต้น **ปิด** (opt-in) — MVP-decisions ไม่ได้บังคับ แต่ร่างนี้เลือก privacy-first
4. UI toggle รวมใน PR เดียวกับ backend (draft จนดูด้วยตา) หรือแยก PR

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-07 | Draft Slice 2 transient PTT microphone capture: cpal dependency, 480,000-byte buffer cap, opt-in setting, privacy invariants and acceptance; no STT. |
| 0.1.1 | 2026-11-07 | Boss approved the draft as written, including all §8 decisions. |
