---
title: "แผนแก้เสียง announcer สะดุดระหว่างเล่นเกม"
doc_id: 2026-10-29-announcer-playback-buffering
status: active
version: 0.1.0
updated: 2026-10-29
owner: G-Maiden
---

# Announcer Playback Buffering Implementation Plan

> Execute inline with the executing-plans workflow. Each task includes a regression check.

**Goal:** ลดงานอ่านดิสก์และถอดรหัสใน audio callback ของเสียง announcer โดยคงการขัดจังหวะจาก G-Signal และงบ RAM 900,000,000 bytes

**Architecture:** เตรียม observed non-critical clips เป็น PCM ใน worker แยกก่อนส่งให้ g-audio; จำกัดทั้งจำนวนคลิปที่เตรียม/รอ/กำลังเล่นและจำนวน samples ต่อคลิป ตรวจ session/preview/pack admission เดิมอีกครั้งที่จุด append จริง เส้นทาง Critical ไม่รอ worker นี้

**Tech Stack:** Rust, rodio 0.19, bounded std channels; ไม่เพิ่ม dependency

## Evidence and limits

- ผู้ใช้ยืนยันว่าเสียงสะดุดเฉพาะในเกม หน้า preview ไม่สะดุด
- ล็อกสองแมตช์ล่าสุดไม่พบ decode/open errors และแมตช์ล่าสุดไม่มี announcer admissions ห่างกันน้อยกว่า 5.5 วินาที จึงยังไม่มีหลักฐานว่าคิว ANN ตัดกันเป็นสาเหตุของครั้งที่รายงาน
- โค้ดปัจจุบัน append `Decoder<BufReader<File>>`; rodio อ่าน iterator นี้จาก output callback จึงยังมี disk reads และ decode ในจังหวะส่งเสียง
- เทสจำลองจะพิสูจน์การกำจัด I/O ระหว่างส่ง PCM; ไม่แทนการฟังจริงหรือพิสูจน์ driver/DPC underrun

## Tasks

- [x] Regression: จำลอง reader ที่ห้ามอ่านหลัง preparation; เสียงต้องยังเล่น PCM ครบโดยไม่แตะ reader
- [x] เตรียม non-critical observed clips ใน worker, จำกัด PCM และ slots ที่ถืออยู่รวมกำลังเล่น; reject เมื่อเต็มและแจ้ง receipt เดิม
- [x] คง Store verification, nonempty check, session/pack/preview admission, Critical priority และ immediate cancellation
- [x] เพิ่ม local diagnostics สำหรับเริ่ม/จบ/ถูกตัดพร้อมเวลาที่เล่น โดยไม่บันทึก PCM หรือส่งข้อมูลออก
- [x] ตรวจ PCM fidelity, bounds, slot release และ existing audio/session tests; รัน Rust/Clippy/TypeScript/ESLint/Vitest/doc gate และ native no-bundle build
- [x] Stage candidate พร้อม VRZO 0.2.0, แพ็กน้าค่อมเดิมและ Signal assets แล้วเปิดให้ทดสอบ โดยไม่แตะ Dota

## Validation notes

- Regression บนโค้ดเดิมทั้ง native test และ extracted harness ล้มเหลวตามคาดด้วย `audio callback attempted blocking file I/O`
- Extracted harness หลังแก้เล่น samples เดิมครบและผ่าน; frontend 491 tests / 55 files, TypeScript และ ESLint ผ่าน
- Fresh-context source review ตรวจ cancellation ระหว่างเตรียม/รอ admission และการปล่อย output gate ก่อน diagnostics แล้วไม่พบประเด็นค้าง
- แพ็ก VRZO 21 คลิป, น้าค่อมเดิม 15 คลิป และ HoN 12 คลิป อยู่ภายในเพดาน PCM ทุกคลิป
- เปรียบเทียบ PCM จากไฟล์จริงทั้ง 48 คลิปกับ streaming decoder เดิม: samples, channels และ sample rate ตรงกันทุกคลิป
- Final gates: Rust 543 passed / 7 existing ignored, Clippy `-D warnings`, frontend 491 tests / 55 files, TypeScript, ESLint, doc gate 215 tests และ native no-bundle build ผ่าน
- เปิด unsigned local candidate จาก source ที่ตรวจแล้ว พร้อม VRZO 0.2.0; trusted Control/Overlay โหลดสำเร็จและ process เป็นเจ้าของ loopback health listener แพ็กอื่นและ Signal 9 ไฟล์ตรงกับ source hashes
- การฟังในเกมจริงและ driver/DPC underrun ยังต้องยืนยันแยกจากชุดทดสอบนี้

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-29 | กำหนดขอบเขตแก้และแยกหลักฐานจำลองจากการยืนยันเสียงในเกม |
