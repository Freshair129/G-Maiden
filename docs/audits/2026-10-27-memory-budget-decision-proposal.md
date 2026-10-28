---
title: "G-Maiden — Native RAM Budget Decision Proposal"
doc_id: "PROPOSAL-RAM-BUDGET-20261027"
status: accepted
version: "0.3.1"
updated: "2026-10-28"
owner: "G-Maiden"
related_docs: ["mvp-decisions", "PLAN-P1-REMEDIATION-20261027", "AUDIT-P1-REMEDIATION-RESULTS-20261027"]
---

# ทางเลือกหลังวัด RAM จาก native build

**Current MVP decision:900,000,000bytes aggregate Working Set** per owner instruction and [[mvp-decisions]] v0.5.0. Earlier400/800MB statements below are historical; no old result is reclassified as900MB acceptance. Continue event corrections per [[PLAN-MVP-EVENT-CORRECTIONS-20261028]].

**มติ800MBก่อนหน้า 2026-10-28: Owner สั่ง “เพิ่มramจาก400เป็น 800”.** ใช้ peak aggregate full Working Set **800,000,000 bytes** รวมทุก process ที่ใช้จริง ตาม [[mvp-decisions]] v0.4.0. มตินี้แทนการคง400MBของ2026-10-27; ไม่ใช่การอนุมัติ1,000MBในทางเลือก B. ผล400MBด้านล่างเป็นหลักฐานย้อนหลัง ไม่ใช่ acceptance ของ800MB.

หลังแก้ debug-console membership และใช้ WebView2 low-memory target ตัววัด native อ่านค่าได้จริง แต่ startup app + WebView2 + feeder อยู่ราว 590–630 MB; ก่อนลด memory target พบประมาณ 686 MB. เป็น startup samples ไม่ใช่ acceptance matrix เต็ม. CV จึงถูกพักตามสัญญา ไม่ได้แสดงว่าพร้อมทั้งที่เกินงบ.

## ทางเลือก A — คง 400 MB

ทางเลือกนี้เป็นมติเดิมเมื่อ2026-10-27 และถูกแทนด้วย800MBแล้ว.

คงตัววัดและ fail-closed เดิม แล้วทำ performance/design lane เพื่อลด RAM รวมต่อ. เป้าหมายคือคืน CV ภายในเพดานเดิม ไม่เปลี่ยนเป็น private bytes ไม่ตัด WebView2/child/model PIDs ออก และไม่ trim working set เพื่อให้ metric ดูผ่าน. การลด footprint ของ control/overlay อาจต้องปรับวงจรชีวิตหรือโครงสร้าง UI; ยังไม่รับรองว่าจะลดจากระดับที่วัดได้ถึง 400 MB โดยไม่กระทบการใช้งาน.

## ทางเลือก B — อนุมัติเปลี่ยนสัญญาเป็น 1,000 MB

ถ้า Owner อนุมัติอย่างชัดเจน จึงปรับ SRS/MVP/ADR/agent documentation, backend constant และ UI budget ให้ตรงกันเป็น **1,000,000,000 bytes**. ตัววัดยังรวมทุก process และ peak เหมือนเดิม; ไม่ยกเว้น shared model และไม่เรียก external Ollama จนกว่าจะพิสูจน์ admission ได้. CPU ≤10%, FPS ≤3% และ critical voice latency เดิมไม่เปลี่ยน.

หลังปรับต้องรัน tests/build และ native samples ใหม่. ตัวเลข 1,000 MB เป็นข้อเสนอสำหรับ footprint ที่วัดได้ ไม่ใช่การรับรอง acceptance; ยังต้องทำ warmup/idle/live-CV/Voice+Signal matrix ตาม canonical spec. ไม่เปิด cloud โดยอัตโนมัติ ไม่เปลี่ยน Store หรือแพ็กเสียงน้าค่อม.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-27 | Prepare explicit owner decision without changing the active 400 MB contract. |
| 0.2.0 | 2026-10-27 | Owner explicitly selected unchanged400MB; proceed measured memory remediation. |
| 0.3.0 | 2026-10-28 | Owner explicitly chose800MB; supersede the earlier400MB decision without approving1000MB or reclassifying old measurements. |
| 0.3.1 | 2026-10-28 | Record current900MB MVP decision; preserve historical400/800MB results without acceptance claims. |
