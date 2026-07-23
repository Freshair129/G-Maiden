---
version: "1.0.1b"
title: "G-Maiden Closed Beta Privacy Notice"
doc_id: "GMAIDEN-CLOSED-BETA-PRIVACY-NOTICE"
created_at: "2026-07-21T16:00:00+07:00,ATHER"
last_update: "2026-07-22T13:20:00+07:00,ATHER"
owner: "Boss"
status: "beta"
superseded_by: null
attributes:
  doc_type: "privacy-notice"
  domain: "legal-privacy-access"
  scope: "G-Maiden Closed Beta"
  language: "th"
---

# G-Maiden Closed Beta Privacy Notice

**เวอร์ชัน:** 1.0.0-beta  
**วันที่มีผล:** 21 กรกฎาคม 2026 เวลา 23:05 น. (ICT)  
**ผู้ควบคุมข้อมูลและช่องทางติดต่อ:** G-Maiden — `gmad.support01@gmail.com`

> เอกสารเวอร์ชันนี้ได้รับอนุมัติสำหรับ Closed Beta โดย Boss เมื่อ 21 กรกฎาคม 2026

## 1. ข้อมูลที่อาจประมวลผล

| หมวด | ตัวอย่าง | วัตถุประสงค์ |
| --- | --- | --- |
| บัญชีและสิทธิ์ | Google identity ที่ Supabase Auth ส่งให้, email, GID, display name | ลงชื่อเข้าใช้, ป้องกันการสวมสิทธิ์, บริหารสิทธิ์ Closed Beta ของ G-Maiden |
| สิทธิ์ดาวน์โหลด | batch, สถานะ grant, เวลาเรียกตรวจสิทธิ์/ออก signed URL | อนุญาตหรือปฏิเสธการดาวน์โหลด, ป้องกันการใช้สิทธิ์ผิดบัญชี, audit ความปลอดภัย |
| การตอบรับเอกสาร | terms/privacy version และเวลา, สถานะ optional consent | แสดงและพิสูจน์การตอบรับเวอร์ชันที่ผู้ใช้เห็น |
| ข้อมูลเสริมที่ผู้ใช้เลือก | diagnostic ที่ระบุไว้, การรับข่าวสาร, post-match contribution | เฉพาะเมื่อผู้ใช้ opt in แยกต่างหาก |

## 2. ข้อมูลที่ไม่เก็บหรือไม่ส่งโดยอัตโนมัติ

G-Maiden จะไม่อัปโหลด raw live match state, CV detection, ตำแหน่งศัตรู, หรือ G-Log จากเครื่องผู้ใช้
เพียงเพราะผู้ใช้สมัครหรือยอมรับ Closed Beta Terms การแบ่งปันข้อมูลหลังจบแมตช์ ถ้ามีในอนาคต จะเป็น
feature แยกพร้อม consent แยกและรายละเอียดข้อมูลที่ชัดเจน

## 3. วัตถุประสงค์และฐานกฎหมาย

ผู้ควบคุมข้อมูลจะประมวลผลข้อมูลบัญชีและสิทธิ์เท่าที่จำเป็นเพื่อให้ Closed Beta, GID และสิทธิ์ดาวน์โหลด
ทำงานได้ ส่วน diagnostic, ข่าวสาร และการแบ่งปันข้อมูลเพื่อการพัฒนาจะไม่ถูกบังคับรวมกับการให้บริการ
และต้องอาศัยการเลือกที่แยกต่างหาก

การประมวลผลที่จำเป็นต่อบัญชี สิทธิ์ และความปลอดภัยอาศัยการปฏิบัติตามข้อตกลง ประโยชน์โดยชอบด้วย
กฎหมายด้านความปลอดภัย หรือหน้าที่ตามกฎหมายตามกรณี ส่วน diagnostic ข่าวสาร และ post-match
contribution อาศัย consent ที่แยกต่างหากและถอนได้

## 4. ทางเลือกและการถอนความยินยอม

ผู้ใช้ยังดาวน์โหลด Closed Beta ได้แม้ไม่เลือก diagnostic, ข่าวสาร หรือ post-match contribution
ผู้ใช้ต้องสามารถถอน optional consent จาก Account Settings หรือช่องทาง support โดยการถอนมีผลต่อการ
ประมวลผลในอนาคต และไม่กระทบการประมวลผลที่ทำโดยชอบก่อนถอนความยินยอม

## 5. ผู้ประมวลผลและการเปิดเผยข้อมูล

ผู้ประมวลผลที่ใช้ใน flow นี้คือ Google สำหรับ OAuth, Supabase สำหรับ Auth/ฐานข้อมูล/Storage ใน
ภูมิภาค Singapore และ Vercel สำหรับ hosting ของ Landing ข้อมูลอาจถูกประมวลผลข้ามประเทศตามที่
ผู้ให้บริการเหล่านี้ดำเนินงาน โดย G-Maiden จะส่งเฉพาะข้อมูลที่จำเป็นและไม่ส่ง raw match state,
CV detection หรือ G-Log ผ่าน account/entitlement flow

## 6. ระยะเวลาเก็บและอายุผู้ใช้

- ข้อมูลบัญชีและสิทธิ์: ตลอดอายุบัญชี และลบหรือทำให้ไม่สามารถระบุตัวตนภายใน 30 วันหลังคำขอลบ
  เว้นแต่ต้องเก็บตามกฎหมายหรือเพื่อข้อพิพาทที่กำลังดำเนินอยู่;
- Terms receipts และประวัติถอน optional consent: 3 ปีหลังสิ้นสุดบัญชีหรือการตอบรับล่าสุด;
- security/download audit: 1 ปี;
- signed download URL: หมดอายุภายใน 5 นาทีและไม่ใช้เป็น credential ระยะยาว;
- raw match state, CV detection และ G-Log: local-only ตามค่าเริ่มต้น

Closed Beta นี้สำหรับผู้มีอายุอย่างน้อย 20 ปี Flow นี้ไม่เก็บวันเกิดหรือเอกสารยืนยันอายุ

## 7. สิทธิของเจ้าของข้อมูลและการติดต่อ

ผู้ใช้ขอเข้าถึง แก้ไข ลบ คัดค้าน จำกัดการใช้ ถอน consent หรือขอสำเนาข้อมูลได้ที่
`gmad.support01@gmail.com` และมีสิทธิร้องเรียนต่อหน่วยงานกำกับตามกฎหมายที่เกี่ยวข้อง

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 1.0.1b | 2026-07-22 | beta | Normalized reader-facing entitlement naming from GMAD to G-Maiden while keeping technical delivery identifiers unchanged. | null | ATHER |
| 1.0.0b | 2026-07-21 | beta | Approved controller/contact, purposes, processors/transfers, retention, 20+ rule, local-only exclusions, and data-subject rights. | null | ATHER |
| 0.1.0b | 2026-07-21 | candidate | Initial Closed Beta privacy-notice data inventory and consent boundary; counsel review required. | null | ATHER |
