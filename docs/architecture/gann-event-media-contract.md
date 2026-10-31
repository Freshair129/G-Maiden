---
title: GANN-only announcer event media contract
doc_id: gann-event-media-contract
status: active
version: 0.1.0
updated: 2026-10-31
owner: G-Maiden
---

# GANN-only announcer event media contract

คำสั่งผู้ใช้วันที่ 2026-10-31 กำหนดให้เสียงและภาพของ announcer event มาจาก GANN เท่านั้น สัญญานี้แทน interface แบบ manifest/flat-cache ใน [[CR-009-gannstudio-authoring-install-contract]] โดยไม่เปลี่ยนกฎตรวจจับ event, Store entitlement, account หรือขอบเขตข้อมูลส่วนตัวของ [[mvp-decisions]]

## Package and playback

- `.gann` เป็น indexed ZIP รูปแบบ `g-ann-package` version 1 มี `gann.json`, registry `ann_<UUID>.json`, original/mixed WAV และ silent WebM ชื่อ ID ทุก payload มีขนาดและ SHA-256 ที่ตรวจสอบได้
- `registry.events[event]` เป็นรายการ `{sound_id,banner_id}` โดย banner อ้าง original และ playback sound ของคู่เดียวกัน ต้องผ่าน schema, reference, media-format และ hash admission ก่อนเล่น
- Studio สร้าง motion/ภาพให้เสร็จในขั้น authoring แล้วบรรจุลง GANN การกด Event Test ต้องอ่าน artifact นั้นด้วย reader เดียวกับ preview การ audition เสียงต้นฉบับระหว่างตัดต่อไม่ใช่ event playback
- Maiden อ่านและตรวจ GANN ตอน import/activation แล้วใช้ cache ที่ผูก pack/revision ใน runtime ไม่มีการแตก ZIP บน audio callback หรือ G-Signal hot path
- เสียง event ใช้ mixed WAV ของ mapping เท่านั้น; original ใช้ตรวจ identity ไม่มีการแทนด้วย original เมื่อ mixed เสีย ไม่มี default/flat-cache/embedded catalog/TTS หรือภาพ event ที่สร้างนอกแพ็กเป็น fallback
- วิดีโอถูกตรวจโครงสร้าง WebM และต้องมี video track ที่รองรับ ไม่มี audio track ตัว native player ยังต้อง decode จริง วิดีโอ muted เสมอและ rodio เป็นเจ้าของเสียง
- Missing/unmapped/invalid pair ต้องเงียบและบันทึกเหตุผล Session, pack revision, mute และ cancellation ต้อง fence เสียงและภาพที่เกี่ยวข้อง
- Dynamic advice ที่ไม่ได้เป็น announcer event แยกจาก resolver นี้ G-Signal detection/admission ยังคงเป็น Rust และไม่พึ่ง cloud, SLM หรือ WebView

## Event call graph

```mermaid
flowchart LR
  A[Studio authoring] --> G[Verified GANN]
  G --> I[Shared installer]
  I --> C[Archive + verified cache]
  C --> E[Activation / immutable event pairs]
  E --> P[Prewarmed critical PCM]
  GS[GSI] --> D[Native announcer / HP detectors]
  D --> R[Event mapping in selected GANN]
  E --> R
  R --> AU[rodio mixed WAV]
  CV[CV / G-Signal detector] --> P
  P --> AU
  AU --> L[Hash-bound playback lifecycle]
  L --> V[Overlay: paired muted WebM]
```

Unmapped/invalid mappings stop before audio admission; the overlay consumes the admitted pair's lifecycle and cannot independently select event media.

## Installation and activation

`g-ann-package::install(source, voice_root)` เป็น installer ร่วมของ Studio/Maiden เก็บ archive เดิมที่ `containers/<sha256>.gann` และ cache ที่ `packs/ann_<UUID>/` พร้อม origin record ไม่เขียน `active-pack.txt` การติดตั้งซ้ำ digest เดิมต้องตรวจ cache; ID เดิมที่มีเนื้อหาต่างกันต้องปฏิเสธและรักษาแพ็กเดิม

Studio ตรวจ `/health` ของพอร์ตที่เผยแพร่ใน profile นั้น (3000–3010):

```json
{"service":"g-maiden","port":3001,"voiceRootId":"<canonical-root-sha256>"}
```

`voiceRootId` ต้องตรงกับ cache ที่ผู้ใช้เลือกก่อนส่ง activation:

```json
{"packId":"ann_<UUID>","containerSha256":"<verified-archive-sha256>","activate":true}
```

`POST /announcer/install` ตรวจ origin/digest ของแพ็กที่มีบน disk ก่อนเปลี่ยน selection และตอบ `ok`, `packId`, `activated`, `containerSha256` ให้ตรวจเทียบ ไม่มี arbitrary-path write หรือ upload/extract ผ่าน HTTP route นี้ Local integrity ไม่เป็น Store receipt หรือ entitlement

## Evidence boundaries

Package tests ตรวจ archive/schema/rollback; native injected-GSI ตรวจ production handler, audio admission และ WebView playback; live Dota, acoustic synchronization และ resource/FPS acceptance เป็นผลคนละประเภท ต้องรายงานแยกกัน ดูแผน [[2026-10-31-gann-only-events]] และผลทดสอบที่ผูกกับ source/binary ของ candidate ห้ามนำผลเก่าหรือ source checks ไปอ้างว่าผ่าน native/live qualification

## Changelog

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-10-31 | Owner-directed GANN-only creation, installation, activation and event media contract. |
