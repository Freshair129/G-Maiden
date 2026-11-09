---
title: GANN-only announcer event media contract
doc_id: gann-event-media-contract
status: active
version: 0.2.1
updated: 2026-11-09
owner: G-Maiden
---

# GANN-only announcer event media contract

คำสั่งผู้ใช้วันที่ 2026-10-31 กำหนดให้เสียงและภาพของ announcer event มาจาก GANN เท่านั้น สัญญานี้แทน interface แบบ manifest/flat-cache ใน [[CR-009-gannstudio-authoring-install-contract]] โดยไม่เปลี่ยนกฎตรวจจับ event, Store entitlement, account หรือขอบเขตข้อมูลส่วนตัวของ [[mvp-decisions]]

## Package and playback

- `.gann` เป็น indexed ZIP รูปแบบ `g-ann-package` version 1 มี `gann.json`, registry `ann_<UUID>.json`, original/mixed WAV และ silent WebM ชื่อ ID ทุก payload มีขนาดและ SHA-256 ที่ตรวจสอบได้
- `registry.events[event]` เป็นรายการ `{sound_id,banner_id}` โดย banner อ้าง original และ playback sound ของคู่เดียวกัน ต้องผ่าน schema, reference, media-format และ hash admission ก่อนเล่น
- `registry.taxonomy_version` เป็น optional string รูปแบบ `MAJOR.MINOR` ตาม [[ADR-21-event-taxonomy-sot]] §8: แต่ละส่วนเป็นเลข ASCII unsigned 32-bit ไม่มีศูนย์นำหน้า (ยกเว้น `0`), ช่องว่าง, patch หรือ suffix; ไม่มี field ถือเป็น `1.1` แต่ null/ชนิดอื่น/รูปแบบผิดต้องปฏิเสธ. Runtime อ่าน version จาก generated `gann-package/events.json`. Same-major เก่าหรือเท่ากันรับเฉพาะ id ที่รู้จัก; same-major ใหม่กว่ารับ unknown id เป็น inert โดยยังตรวจ hash/pair/WAV/silent WebM ครบและห้ามเลือกเล่น; ต่าง major ปฏิเสธโดยคง active selection. จำกัด event keys 128 แยกจากจำนวน taxonomy ปัจจุบัน
- Shared admission อยู่ใน `g-ann-package/src/playback.rs`: `validate_playback_with_report()` คืน effective pack/runtime versions และ `inert_events` (id → reason); `validate_playback()` เดิมยังคืน `Result<(), String>`. Maiden ใช้ shared registry check และบันทึก inert ids ใน local log ตอน import/activation แล้วตัดออกจาก playback snapshot รวม preview. Id ที่ taxonomy รู้จักแต่ detector ยัง pending ไม่ถูกเปลี่ยนให้เล่นได้โดย PR2
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

ดู [[gann-package-v1-local-authoring]] สำหรับ compression profile, portable project, named-pipe protocol, trust และ revision/installation ownership.

Maiden เป็น installer เพียงตัวเดียวใน production. Studio ส่ง local package request ผ่าน current-user/profile-bound named pipe พร้อม expected digest และ request ID. Maiden ตรวจ archive และ staged bytes ก่อน commit registry; install ไม่เท่ากับ equip. ไม่มีการแตกแพ็กผ่าน HTTP หรือ Studio direct-folder install.

`POST /announcer/install` ปัจจุบันตอบ HTTP 410 ให้ใช้ registered pipe; helper admission ของ HTTP เดิมเหลือเฉพาะ tests. ข้อความ endpoint ใน ADR-21 §8 อ้างเส้นทางเก่า; PR2 คง transport ปัจจุบันและให้ `PackageInstaller` ใช้ shared taxonomy admission. การเชื่อม Studio consumer อยู่ใน CR-049 PR3.

Selection, inventory และ preview ใช้ opaque installation ID; announcer ID เป็น media identity แยกต่างหาก. Runtime ถือ immutable revision lease จนเสียงและ declared visual tail จบ; pending selection ใช้เมื่อไม่มี match/lease. Cache adoption ที่ล้มเหลวต้อง retry และ re-admit หลัง repair generation เปลี่ยน.

แพ็กโฟลเดอร์เดิมที่ไม่อยู่ใน registry ต้องนำ `.gann` เข้าอย่างชัดเจน ไม่อนุมาน System/Store authority และไม่กลับไปใช้ active-pack.txt เป็น production fallback. Local integrity ไม่เป็น Store receipt หรือ entitlement.

## Evidence boundaries

Package tests ตรวจ archive/schema/rollback; native injected-GSI ตรวจ production handler, audio admission และ WebView playback; live Dota, acoustic synchronization และ resource/FPS acceptance เป็นผลคนละประเภท ต้องรายงานแยกกัน ดูแผน [[2026-10-31-gann-only-events]] และผลทดสอบที่ผูกกับ source/binary ของ candidate ห้ามนำผลเก่าหรือ source checks ไปอ้างว่าผ่าน native/live qualification

## Changelog

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-10-31 | Owner-directed GANN-only creation, installation, activation and event media contract. |
| 0.2.0 | 2026-10-31 | Shared compression/profile, Maiden-owned registry/IPC install, installation identity and revision leases; link local creator contract. |
| 0.2.1 | 2026-11-09 | Add optional taxonomy_version grammar, compatibility matrix, shared admission reports and verified inert playback exclusion; clarify retired HTTP install route. |
