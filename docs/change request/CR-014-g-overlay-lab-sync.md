---
version: "0.3.0"
title: "CR-014 - G-Overlay Lab sync receiver"
doc_id: "CR-014-g-overlay-lab-sync"
updated: "2026-10-27"
owner: "ATHER"
created_at: "2026-08-10T00:00:00+07:00,ATHER"
last_update: "2026-10-27T00:00:00+07:00,Codex"
status: "accepted"
approved_by: "Boss"
approved_date: "2026-08-10"
attributes:
  doc_type: "change-request"
  scope: "G-AnnStudio layout authoring to G-Maiden runtime sync"
---

# CR-014 — G-Overlay Lab sync receiver

## Decision

Owner update (2026-10-27): G-Maiden มีตัวจัดวาง HUD ใน Settings → Overlay โดยใช้ renderer และ settings เดียวกับ overlay จริง ส่วน G-AnnStudio ยังคงส่ง layout ผ่าน receiver เดิมได้ ไม่ต้องเปิดอีกแอปเพื่อจัดวาง HUD

## In-app editor and fullscreen

1. ฝังภาพ Steam in-game 1920×1080 เป็นพื้นหลังเริ่มต้น ใช้พิกัดเปอร์เซ็นต์ร่วมกับ renderer และเตือนเมื่อทับ HUD ตามภาพอ้างอิง ลาก ปรับขนาด เปิด/ปิดโมดูล และบันทึกโปรไฟล์ได้
2. ใช้ค่าเริ่มต้นตามแนวขวาของภาพ ให้ Score, K/D/A และ Gold มองเห็นใน preview แม้ GSI offline; preview แยกจาก game-tick จึงไม่กระตุ้นเสียง คำแนะนำ หรือสถานะแมตช์
3. ปุ่มขยายเปิด fullscreen เฉพาะ editor บน control window; ปิดหรือ Escape คืนขนาดและตำแหน่งเดิม เก็บค่าที่แก้ไว้ เมื่อออกจากหน้าให้คืนหน้าต่างด้วย ปิด desktop preview เมื่อเข้า editor เต็มจอ
4. ใช้ StartupSettingsProvider เดิมบน main เพื่อคงการโหลด บันทึก และ broadcast settings ไม่สร้างเจ้าของ persistence ซ้ำ และรักษา session/freshness guard ของ overlay

ภาพอ้างอิง: `src/public/dota-overlay-reference.jpg` จาก Steam `20261019153246_1.jpg`; SHA-256 `0622e7c4c04c475c5ef42b778c43e66d0e32100d35557ec7b4e26629770f8894` ตามคำขอให้ฝังภาพของผู้ใช้ ค่า HUD zones อ้างอิงภาพนี้เท่านั้น ไม่ครอบคลุมร้านค้า/scoreboard ที่เปิดขยายหรือ minimap ด้านขวา

## Runtime contract

- Route: `POST /overlay/layout` on the existing loopback-only `127.0.0.1:3000` GSI server.
- Schema: `G-Suite/schemas/gmaiden-overlay-layout.schema.json`, `schemaVersion: 1`.
- Receiver accepts exactly all current module ids and a bounded `{x,y,scale,enabled}` value for each.
- A valid request merges only `settings.layout`, uses the existing atomic `settings.json` writer, then emits `settings` so the active overlay updates immediately. It also emits `overlay-layout-sync` so an open Command Deck updates its local state and cannot overwrite the synchronized layout on its next setting change.
- Invalid, partial, or unknown payloads return an error and do not modify settings.

## Boundaries

- This route must not write packs, files, audio, game data, CV output, credentials, or any field other than `settings.layout`.
- It is not on the GSI to G-Signal critical path and must not block it.
- `/announcer/install` remains unchanged: it only activates an already-installed voice pack.

## Verification

- ชุดทดสอบ editor ครอบคลุมขอบเขต/การทับ HUD, layout normalization, preview offline และการคืน fullscreen/ขนาด/ตำแหน่ง รวมถึงการปิดซ้ำและ retry หลังคืนหน้าต่างไม่สำเร็จ
- Native smoke ก่อนย้ายลง main: editor 1920×1080, Close และ Escape กลับหน้าต่าง 1200×780 โดยเก็บการเปิด/ปิดโมดูลไว้ หลักฐานนี้ไม่ใช่ live-match หรือการทดสอบจอที่สองจริง ต้องตรวจ build ที่รวมกับ main แยกก่อนส่ง PR

- Rust unit tests cover successful merge, invalid JSON/schema/type rejection, unknown module rejection, missing module rejection, and x/y/scale range rejection.
- The pure local-sync plan test proves unrelated settings survive, the layout-only payload is the `overlay-layout-sync` payload, and the full settings snapshot is the `settings` payload. The route is separate from `/gsi`; this is a local authoring seam and does not add network egress or work on the G-Signal path.
- G-Ann type-check covers its schema-compatible sender.
- Manual smoke remains required: change `banner` geometry in G-Ann, sync, and fire a G-Maiden kill preview. This evidence is not a live Dota/Boss-run measurement.

## Changelog

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0 | 2026-08-10 | approved | Initial approved C-3 contract for bounded G-Ann layout sync. | pending | ATHER |
| 0.2.0 | 2026-08-14 | accepted | Added bounded local-sync smoke evidence for rejection, merge, event payloads, and critical-path isolation. | pending | ATHER |
| 0.3.0 | 2026-10-27 | accepted | Owner-requested in-app HUD editor, embedded screenshot, render-only preview and temporary fullscreen. | pending | Codex |
