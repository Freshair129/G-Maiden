---
title: "แผนกู้และแก้มินิแมปสด"
doc_id: 2026-10-29-minimap-live-preview-60fps
status: active
version: 0.1.0
updated: 2026-10-29
owner: G-Maiden
---

# แผนกู้และแก้มินิแมปสด

เป้าหมาย: กู้ source ตรง build เดิมแล้วแก้พรีวิวกับ CPU โดยคงความถูกต้องของ CV, งบ 900 MB และเสียง VRZO พร้อมทดสอบก่อนเปิด local candidate

- [x] กู้ source 30 ไฟล์จากประวัติและเทียบ SHA-256 กับ frozen source; สำเนาเดิมอยู่ `D:/gm-recovery-backend` และ `D:/gm-recovery-frontend`
- [x] วิเคราะห์ล็อก: preview ส่งเป็นบางช่วง, CPU เกิน 10% บาง sample, CV slow แม้ preview พัก; metrics เดิมบางช่วงรวมเวลาพักจึงใช้เป็น FPS ไม่ได้
- [x] ทดสอบและแก้การระบาย stale packet โดยไม่แสดงภาพเก่า; เพิ่ม diagnostics bounded สำหรับ child และช่วง capture/crop/pipe
- [ ] ตรวจความเท่ากันของข้อมูล CV/ภาพและทดสอบ regression, frontend, Clippy, doc gate และ native build
- [ ] เปิด candidate พร้อม VRZO; ตรวจ startup, ownership และลอกผลในเกมแยกจาก native presentation/resource acceptance

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-29 | บันทึกการกู้ซอร์สและขั้นตรวจแก้พรีวิวโดยไม่ผ่อนงบหรือความถูกต้อง |
