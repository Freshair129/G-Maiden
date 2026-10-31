---
title: "GANN v1 local authoring and installation"
doc_id: gann-package-v1-local-authoring
status: active
version: 0.1.0
updated: 2026-10-31
owner: G-Maiden
---

# GANN v1 local authoring and installation

ข้อกำหนดของ candidate สำหรับสร้าง ทดสอบ ส่งออก และติดตั้งแพ็กในเครื่อง ตามคำสั่งผู้ใช้วันที่ 31 ตุลาคม 2026 งาน Store backend/payment/publication ทำภายหลัง เอกสารนี้ระบุ interface และพฤติกรรม source ไม่ใช่ release หรือ native/live acceptance ดู [[gann-event-media-contract]] สำหรับกฎ event/audio/video

## Format and compression

- `.gann` ยังเป็น indexed ZIP `g-ann-package` version 1 และ registry `schema_version:1`.
- Shared producer profile `gann-zip-1`: JSON/WAV/optional inert source/font ใช้ Deflate level 6; silent WebM ใช้ Stored เพราะมี video codec อยู่แล้ว ทุก payload hash หลังคลายบีบอัดด้วย SHA-256.
- Writer เรียง descriptor ก่อนแล้ว ASCII-sorted paths, timestamp 1980-01-01, regular files 0644. Profile verifier ตรวจ header ส่วน local/central ตรงกัน ไม่มี hidden prefix/suffix, encryption, extras, duplicate records หรือ comments.
- Reader รับ methods 0/8 ภายใต้ v1 โดยไม่แปลงแพ็กเก่า Save Copy คง bytes เดิม ส่วน build ที่เนื้อหา/toolchain เปลี่ยนสร้าง revision ใหม่.
- Container และ expanded รวม descriptor อย่างละไม่เกิน 512 MiB, payload ไม่เกิน 32 MiB, descriptor/registry อย่างละ 2 MiB, ไม่เกิน 2048 payloads. Reject duplicate JSON keys/unsafe paths/hash mismatch; แตกไฟล์ลง staging ด้วย bounded streaming.

## Trust

Shared crate มี detached Store release verifier เตรียมไว้: pure Ed25519 ตาม RFC 8032, signed message `gmaiden-gann-store-release-v1\n` ตามด้วย JCS payload (RFC 8785), Base64url unpadded signature 64 bytes. Client รับ trust keys จากแอป ไม่เชื่อ public key ในแพ็ก Envelope สูงสุด 16 KiB และผูก publisher/item/announcer/revision/container SHA-256/size/compression profile.

การตรวจ package binding อ่าน archive/profile จริงซ้ำ ไม่เชื่อ fields ของ Package/CompressionReport ที่ caller อาจแก้เอง Local integrity, release authenticity และสิทธิ์ผู้ซื้อเป็นคนละผลตรวจ Local import ไม่ได้ Store authority. ยังไม่มี production release signer/keys หรือ Store backend จากงานชุดนี้; Store installer fail closed จนมี authorization adapter ที่เชื่อถือได้

## Portable Studio project

`.ann` v2 เป็น archive ของ `project.json` และ managed assets เก็บ clips, raw sources, fonts, variants, captions, banner layers/motion, SFX cues, event mappings, inactive stock, stable IDs และ build history ใช้ relative references ภายใน ไม่มี dependency กับ absolute source path หรือ localStorage.

Project/archive expanded limits: 2 GiB, asset 512 MiB, 4096 assets, project JSON 16 MiB; reject unsafe paths/remote refs/corrupt assets. บันทึก atomic ภายใต้ OS project lock พร้อม autosave/recovery แยกจากไฟล์เดิม โปรเจกต์เก่าต้อง Import และ relink อย่างชัดเจน.

Global banner canvas มี persisted `bannerVariantId` เป็น owner แยกจาก waveform selection การเลือกจากทุกหน้าต้อง flush/load variant ผ่าน project helper. Async build/save/open/recovery ต้องตรวจ originating project/announcer ID และ generation/session ก่อนใช้ผล ป้องกันผลของโปรเจกต์หนึ่งไปทับอีกโปรเจกต์.

## Creator journey

1. สร้างหรือเปิดโปรเจกต์ ตั้งชื่อ ผู้สร้าง และภาษา.
2. นำเข้า audio/video ผ่าน managed media job เก็บ source เดิมและ normalized mono48k PCM16 WAV ใน workspace ไม่เขียนทับ sibling files ของผู้ใช้.
3. ตัดคลิปและ map canonical events/variants; unsupported/unmapped stock ไม่เข้าระบบสุ่มและไม่เปลี่ยนเป็น Kill.
4. แก้ layers/caption/timing/declarative keyframes/SFX. SFX เลยช่วงเสียงต้องเลือก Extend หรือ Trim/Fade อย่างชัดเจน.
5. Freeze snapshot → render dry/mixed WAV และ silent VP8 → shared package writer/reader → atomic revision commit. Failed/cancelled build ไม่เปลี่ยน current revision; unchanged input/toolchain/raster output reuse artifact เดิม.
6. ทดสอบจาก archive จริง แล้ว Export bytes เดิม หรือติดตั้งผ่าน Maiden ที่เลือก. UI ต้องปิดการใช้ artifact ที่ superseded/dirty/เป็นของโปรเจกต์อื่น.

ผู้ใช้ไม่ต้องใช้ Codex, Python/Node, terminal, เขียน JSON หรือคัดลอก cache เอง AI และบัญชีเป็นทางเลือก เครื่องมือ render ถูก pin/hash และรวมใน installer โดย build preparation; ตรวจ source/license ของเครื่องมือก่อนเผยแพร่แอปตาม release policy.

Audio timeline ของงานใหม่ไม่เกิน 15000 ms; original dry/mixed ยาวเท่ากัน `config.duration_seconds` คือช่วงเสียง `visual_tail_ms` เป็น integer 0–3200 (default 0), silent video จบหลังเสียงได้เท่าที่ประกาศ mute/stop/preempt/session change ยกเลิก tail และ lease ของคู่สื่อนั้น.

## Maiden ownership and IPC

Maiden เป็นเจ้าของ profile registry, installations และ selection. Studio ไม่ค้นหา root จาก exe/cwd และไม่แตกแพ็กลง cache ของ Maiden เอง.

Windows named pipe จำกัด SID ของ current user, rejects remote clients, verifies registered server PID/executable hash/SID, protocol/profile/nonce handshake และ frames ไม่เกิน 16 KiB นี่เป็นการแยก OS user/profile ไม่ใช่ attestation ของทุกแอปใน Windows user เดียวกัน.

`LocalInstall` ระบุ request ID, profile ID, source path, expected digest, optional project binding และ equip policy (`never`, `now_if_idle`, `after_match`). Installer copy และตรวจ bytes จริงใน profile ของตนก่อน trust. Request ID/identity ถูก journal เพื่อ retry โดยไม่สร้าง lineage ซ้ำ.

Registry records ใช้ `(authority, announcer_id, revision, digest)` และ opaque installation ID; inventory/selection/preview ใช้ installation ID โดยเปิดเผย announcer ID และ capabilities แยกต่างหาก. Local lineage/binding ออกโดย Maiden และไม่สามารถ shadow System/Store.

Stage → verify → atomic registry commit; equip เป็น atomic selection แยกจาก install. เก็บ revision เก่าไว้ทั้งหมดสำหรับ repair/rollback และไม่ GC lease ที่ runtime ถืออยู่. Runtime เปลี่ยน selection เมื่อ idle และไม่มี lease; match barrier/session/revision generation fence ป้องกันการสลับกลาง event. Prepared descriptor ออก lease โดยไม่ทำ disk IO ใน hot path.

Cache adoption บันทึก publication สำเร็จเท่านั้นและตรวจ generation ของ repair; failure ต้อง retry แม้ selection ID เดิม. InstallResult แยก installed/active/deferred/activation_error เพื่อไม่รายงานว่าเปิดใช้สำเร็จจากการ copy อย่างเดียว.

Production registry host เป็น selection authority เดียว แพ็กเก่าในโฟลเดอร์ที่ยังไม่ register เก็บ bytes ไว้และต้องนำ `.gann` เข้าอย่างชัดเจน ไม่อนุมาน System authority หรือกลับไปอ่าน active-pack.txt เมื่อ host มีปัญหา. Official System catalog ต้องมี trusted internal admission ก่อนเปิดใช้ Local core/GSI เริ่มได้โดยไม่ต้อง sign in/network.

## Validation boundaries

Shared package tests, native core/harness, native desktop compilation, installed UI flow, acoustic sync, live event correctness และ CPU/RAM/FPS เป็นหลักฐานต่างประเภท ใช้ผลของประเภทหนึ่งแทนอีกประเภทไม่ได้.

Targets จาก [[mvp-decisions]]: Windows x64 19045/26100, G-Signal p50 ≤250 ms และทุก sample ≤300 ms, normalized CPU ทุก1s sample ≤10%, peak aggregate Working Set ≤900000000 bytes, Dota FPS impact ≤3%. ไม่เพิ่ม GSI/CV/G-Log/voice transcript egress สำหรับงานนี้.

## Changelog

| Version | Date | Change |
|---|---|---|
| 0.1.0 | 2026-10-31 | Local creator package/profile/IPC/revision contract; Store backend deferred and runtime qualification remains separate |
