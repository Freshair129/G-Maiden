---
title: "CR-037 — แชร์ own-GSI stats ระหว่างสมาชิกปาร์ตี้"
doc_id: "CR-037-party-gsi-own-stat-sharing"
status: "accepted"
version: "0.1.0"
updated: "2026-11-01"
owner: "G-Maiden"
approved_by: "Boss — explicit instruction to implement party own-GSI sharing and update repository documentation"
approved_date: "2026-11-01"
approval_basis: "Feature scope authorized in the current conversation; detailed transport/protocol decisions are assistant implementation decisions, not release or native acceptance."
related_docs: ["FEAT-G-PARTY", "mvp-decisions", "software-requirements-specification", "G-SERIES-DATA-LINEAGE", "2026-11-01-g-party-gsi-sharing"]
---

# CR-037 — แชร์ own-GSI stats ระหว่างสมาชิกปาร์ตี้

## ปัญหาและผลที่ต้องการ

GSI ของแต่ละเครื่องมีข้อมูลผู้เล่นเจ้าของเครื่อง ข้อมูลเพื่อนจึงไม่ควรถูกแต่งจาก GSI ของเรา. ผู้ใช้สั่งให้เพิ่มการแบ่งปัน own stats ระหว่างสมาชิกที่เปิดใช้เอง เพื่อดู HP/MP/alive/respawn ได้โดยไม่ต้อง camera-select และให้อัปเดตเอกสาร repo. งานนี้ไม่เพิ่มการอ่านเกมผ่าน memory ไม่เพิ่ม enemy vision และไม่อาศัยข้อมูลของคนที่ไม่ได้เข้าร่วม.

## ขอบเขตที่อนุญาตและการตัดสินใจ implementation

ขอบเขตฟีเจอร์ได้รับคำสั่งให้ทำแล้ว. รายละเอียดต่อไปนี้เลือกโดย assistant เพื่อทำให้ใช้งานและตรวจรับได้ ไม่ใช่การอ้างว่า Owner ตรวจ protocol ทุก field หรืออนุมัติ deployment/release:

1. ใช้ [[FEAT-G-PARTY]] เป็น field/transport/consent SSOT; เพิ่ม route แยกใน [[mvp-decisions]] MVP-005A โดยไม่ขยาย AI allowlist/denylist ของ MVP-005.
2. Native Rust sender/receiver sync async 500 ms กับ Node built-in in-memory relay; ห้องไม่เกิน 5 คน ไม่ต้องมี app account. Remote ต้อง HTTPS; HTTP literal loopback ใช้ทดสอบ local เท่านั้น. ไม่มีการ deploy/hosting อัตโนมัติ.
3. Create/join ต้อง checked explicit sharing consent พร้อม activation ทุกครั้งที่เชื่อมต่อโดยตั้งใจ. ไม่มี view-only mode, auto-join หรือ saved room credentials ใน slice นี้.
4. ส่ง own hero/level/HP/maxHP/MP%/alive/respawn ที่ครบ valid จาก app570/playing/verified local owner/live-or-pregame GSI เท่านั้น. Raw match ID/SteamID อยู่ local; room-scoped SHA-256 matchKey และ team ใช้ equality binding ไม่ใช่ anonymity หรือ game attestation.
5. Leave ล้าง local state/fence pending work; kick/rotate/expiry และ freshness จำกัดขอบเขตข้อมูลเก่าตาม FEAT. Relay เห็น shared stats ได้ ไม่มี E2EE หรือ official-party verification claim.
6. แสดงสถานะ peers ที่เข้าร่วมจริงพร้อม live/stale/waiting/different_match; ห้าม mock เติมทีม ห้ามส่ง received peer data ไป AI/Memory/Log โดยปริยาย.

## นอกขอบเขต

ไม่เปลี่ยน 62 MVP parent tasks หรือเลื่อน feature อื่นขึ้น P0; ไม่ขยาย cloud AI, CV, Voice, Memory, Log egress; ไม่ทำ public profiles/social telemetry, official Valve party attestation, hosted relay deployment, payment, release/tag หรือ broad GSI parser rewrite. งาน GSI recovery PR88 คงเป็นคนละชุด.

## ความเสี่ยงและเกณฑ์รับ

ต้องตรวจ consent bypass, token/invite disclosure, unauthorized room access, forged/cross-match source, replay/stale data, unbounded resources, reconnect races และข้อมูลค้างหลัง leave. Native/relay guards ต้องบังคับเอง ไม่พึ่ง UI. Validated GSI projection ต้องไม่ใช้ zero/default แทน missing.

เกณฑ์ PARTY-AC-001–010 อยู่ใน [[FEAT-G-PARTY]]; แผนและ evidence อยู่ใน [[2026-11-01-g-party-gsi-sharing]]. สถานะขณะเริ่ม CR: **implementation in progress, verification pending**. Real HTTP synthetic, portable Rust, frontend, native Windows/live Dota และ resource acceptance เป็นหลักฐานคนละประเภท; ยังไม่อ้างผลผ่านใดจากการยอมรับ CR.

## Rollback และการส่งมอบ

งานอยู่ใน isolated branch `wip/g-party-gsi-sharing`; ไม่แตะ main โดยตรง. หากพบข้อผิดพลาดให้ leave/หยุด relay และ revert scoped implementation ผ่าน PR ตามกติกา repo; ไม่มี database migration หรือ durable room state ต้องย้ายกลับ. Local core ยังทำงานเมื่อ relay ปิด. Release/deployment เป็นขั้นแยก ต้องมีคำสั่งและหลักฐานของตน.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-01 | บันทึก Owner-authorized G-Party scope, assistant-selected bounded relay protocol และการแยก implementation/native/live acceptance. |
