---
title: Announcer ID filesystem packages
doc_id: announcer-id-filesystem
status: active
version: 0.2.0
updated: 2026-10-30
owner: G-Maiden
---

# แพ็กเสียงและแบนเนอร์แบบ ID

G-AnnStudio เก็บแพ็กใน filesystem โดยใช้ `ann_<UUID>.json` เป็น manifest หลัก และเสียง `audio/snd_<UUID>.wav` ไม่มี SQL ไฟล์ manifest เดิมของแพ็กอื่นยังโหลดผ่านเส้นทางเดิม

## นำเข้าและเลือกใช้

ใน development build เปิด Voice เลือกคลังแพ็ก ใส่พาธโฟลเดอร์ที่มี manifest แล้วกดนำเข้าโฟลเดอร์ แอปตรวจ schema, ID, reference, path containment และ SHA-256 ก่อนคัดลอกไป staging และตรวจซ้ำก่อนติดตั้ง เมื่อสำเร็จกด Equip เพื่อเลือกใช้ การนำเข้าไม่เปลี่ยนแพ็กที่ใช้อยู่เอง ID ที่ติดตั้งแล้วไม่ถูกเขียนทับ การแก้แพ็กทำผ่าน Studio; UI แก้ manifest แบบเก่าไม่เขียนทับแพ็ก ID

การนำเข้าโฟลเดอร์ยังจำกัดเฉพาะ development authoring ส่วนแพ็กไฟล์เดียว `.gann` นำเข้าได้จากหน้าต่าง Control ทั้ง development และ consumer build ตามคำสั่งเจ้าของ โดยตรวจ index/hash และ native media ก่อนติดตั้ง แพ็ก local ไม่สร้างสิทธิ์ Store หรือเปลี่ยนการตรวจลายเซ็น

ตัวนำเข้า ZIP แบบเดิมปฏิเสธแพ็กที่มี manifest ID และปฏิเสธการเขียนทับโฟลเดอร์ ID ที่ติดตั้งแล้ว เพื่อไม่ให้ข้ามการตรวจไฟล์เสียงผสม/วิดีโอของตัวนำเข้าใหม่

## รูปแบบและการเล่น

- `sounds` รวม sound ID, role, relative path และ SHA-256; เก็บ original voice, mixed voice+SFX และ SFX แยกกัน
- `events` ชี้ original sound ID และ banner ID; แบนเนอร์ชี้ mixed sound ID และ silent WebM ที่ตรงกัน
- `components` กับ instance/cue IDs เก็บ authoring config ใน manifest; การแก้ config ต้องเรนเดอร์ baked WebM ใหม่
- `unmapped_sound_ids` เก็บเสียงที่ยังไม่มีอีเวนต์ โดยไม่สร้าง trigger เอง

เสียงต้นฉบับเลือกหนึ่งครั้งจาก active pack และ event cache จากนั้นเล่น mixed WAV คู่กันเพียงครั้งเดียว ภาพเริ่มจาก native audio lifecycle พร้อมแยก provenance ของเสียงที่เลือกกับเสียงที่เล่น หากไม่สามารถตรวจเสียงผสมได้ ระบบใช้กลไก fallback ของ audio เดิมโดยไม่แสดงภาพผิดคู่ ไม่มีการเล่น SFX ซ้ำแยกจาก mixed WAV

วิดีโอส่งผ่าน protocol `g-announcer-video` โดยรับเฉพาะ announcer ID, banner ID และ cache revision ไม่รับพาธหรือ URL จาก manifest/renderer ตรวจ active cache และ digest ก่อนตอบ ตัวควบคุม overlay คง session, expiry, stop, cancel และ pack-change fences เดิม

## ขอบเขตตรวจรับ

แพ็กตัวอย่าง self-contained v2 มี 63 WAVs, 21 silent WebMs, 15 events, 21 banners และ 105 component configs อยู่ใต้โฟลเดอร์เดียวกัน ID คงเดิมจาก registry v1 วิดีโออ้าง `video/<banner_id>.webm`

ตัวตรวจจำกัด manifest 2 MiB, WAV 16 MiB, media ต่อไฟล์ 32 MiB และแพ็กรวม 512 MiB; คัดลอกทีละไฟล์ ระหว่างนำเข้าและเปลี่ยนแพ็กจึงตรวจไฟล์ได้โดยไม่เพิ่ม I/O เข้า audio callback หรือ G-Signal hot path

ทดสอบกับแพ็กจริงแยกจาก unit suite ด้วย `GM_ID_PACKAGE_FIXTURE` และ ignored test `voice_api::id_manifest::tests::real_studio_package_resolves_all_21_pairs` โดยระบุ `--include-ignored` ผลทดสอบนี้ครอบคลุม import, activation, exact pairing, cache fencing และ changed/missing assets ใน temporary root ไม่ใช่ acoustic/live-match หรือ resource acceptance

## คอนเทนเนอร์ไฟล์เดียว `.gann`

เปิด Voice แล้วกด **นำเข้า .gann** เลือกไฟล์ เมื่อการตรวจเสร็จให้กด Equip แพ็กที่เลือกอยู่จะไม่เปลี่ยนเองระหว่างนำเข้า เก็บต้นฉบับที่ตรวจแล้วใน `voice-cache/containers/<sha256>.gann` และสร้าง playback cache ที่ `packs/<announcer_id>/` เพื่อไม่แตก ZIP บนเส้นทางเสียงระหว่างอีเวนต์ นำเข้าไฟล์เดิมซ้ำได้; same ID ที่เนื้อหาแตกต่างจะถูกปฏิเสธโดยรักษาแพ็กเดิม

คอนเทนเนอร์เป็น indexed ZIP v1: `gann.json` ระบุ format/version/announcer ID, ชื่อ canonical `ann_<UUID>.json` และทุก payload พร้อม byte length/SHA-256 ไฟล์เสียงและวิดีโอใช้ ID เดิม ส่วนต้นฉบับโมชั่น/ฟอนต์เก็บเป็นข้อมูลที่ไม่รันใน `motion/` จำกัดไฟล์คอนเทนเนอร์และขนาดขยาย 512 MiB, payload 2048 ไฟล์, ต่อไฟล์ 32 MiB, JSON index/manifest 2 MiB; ปฏิเสธ unsafe paths, symlinks, case collisions, payload ที่ไม่อยู่ใน index และ hash/size ผิด

G-AnnStudio เปิดไฟล์เดียวกัน ตรวจ config และ preview mixed WAV กับ silent WebM ได้ รวมทั้งเก็บสำเนา byte-identical ผ่าน temporary sibling ก่อน commit การประกาศ file association ใช้เมื่อ build ติดตั้งจริง; no-bundle smoke build ยังไม่จดทะเบียนใน Windows สคริปต์ authoring ภายในแพ็กไม่ถูก execute และไม่ได้เพิ่ม SQL

สร้าง/ตรวจไฟล์ด้วย CLI `cargo run --manifest-path src-tauri/gann-package/Cargo.toml -- pack <folder> <ann_ID.json> <output.gann>` หรือ `verify <file.gann>` ชุด security regression ของคอนเทนเนอร์อยู่ใน crate นี้และรันแยกจาก runtime tests ส่วน `GANN_FIXTURE` เปิด ignored native import test ที่ตรวจแพ็กจริงใน temporary root

## Changelog

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-10-30 | Filesystem ID manifest import and paired playback contract. |
| 0.2.0 | 2026-10-30 | Add single-file local container admission, playback cache and G-Ann opener contract. |
