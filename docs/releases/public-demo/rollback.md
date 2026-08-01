---
title: "G-Maiden Public Demo Rollback"
doc_id: "public-demo-rollback"
status: "draft"
version: "0.1.0"
updated: "2026-08-01"
owner: "Boss"
---

# Public Demo Deployment and Rollback

## Scope

เอกสารนี้ครอบคลุมเฉพาะหน้า Public Demo ใน `landing/` ได้แก่ route `/demo` และ `/public-demo` ไม่ครอบคลุม desktop runtime, GSI, updater หรือระบบชำระเงิน

## Pre-deploy checks

1. `pnpm --dir landing test`
2. `pnpm --dir landing typecheck`
3. `pnpm --dir landing build`
4. เปิด `/demo` และ `/public-demo` บน desktop viewport
5. เปิด `/demo` บน mobile viewport
6. ตรวจ play, pause, restart, timeline, jump controls, captions และ mute
7. ตรวจว่า feature state แสดง Shipped / Partial / Preview / Planned ครบ
8. ตรวจ Closed Beta CTA โดยไม่บันทึก client secret หรือ raw device/match data

## Rollback triggers

Rollback เมื่อพบข้อใดข้อหนึ่ง:

- route ใหม่ทำให้ landing page หลักเปิดไม่ได้
- demo controls ใช้งานไม่ได้บน browser ที่รองรับ
- Closed Beta CTA ทำให้ authentication/enrollment flow เดิมเสีย
- analytics ส่ง URL query, credential, raw match หรือ device-identifying data
- mobile layout ปิดกั้นเนื้อหาหลักหรือ CTA
- production error rate ของ demo ถึงหรือเกิน 1%

## Rollback procedure

1. ระบุ deployment ล่าสุดก่อน PR ที่เพิ่ม Public Demo
2. promote deployment ก่อนหน้าให้กลับเป็น production หรือ revert merge commit ของ PR
3. ตรวจ `/` ว่าหน้า landing เดิมกลับมาทำงาน
4. ตรวจว่า `/demo` และ `/public-demo` ไม่ถูก expose หรือกลับไปยัง fallback ที่ปลอดภัย
5. ตรวจ Google OAuth/GID enrollment จากหน้า landing เดิม
6. บันทึกเวลา rollback, deployment SHA, trigger และผู้ดำเนินการใน release log

## Data and security note

Public Demo ใช้ synthetic data และไม่ควรมี migration หรือ persistent match data ดังนั้น rollback ไม่ต้องทำ data restoration หากพบว่ามีข้อมูลนอกขอบเขตถูกบันทึก ให้หยุด analytics ingestion และเปิด security incident แยกจาก deployment rollback ทันที

## Post-rollback verification

- landing page ตอบสนองบน desktop และ mobile
- OAuth/GID flow เดิมทำงาน
- ไม่มี client secret ใน browser bundle
- analytics pageview ถูกตัด query string
- issue/incident มีหลักฐาน root cause และเงื่อนไขสำหรับ redeploy

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-08-01 | Initial deployment and rollback procedure |
