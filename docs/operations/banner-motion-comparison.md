---
title: "Overlay motion — four-method comparison"
doc_id: "banner-motion-comparison"
version: "0.2.0b"
status: "accepted"
approved_by: "Boss"
approved_date: "2026-09-13"
updated: "2026-09-13"
owner: "Boss"
attributes:
  domain: "ui-ux"
  change_class: "C-2"
  risk: "MEDIUM"
---

# ขอบเขตทดลอง motion banner

Boss อนุมัติการทดลองสี่วิธีด้วยข้อความ “ลองทำมาทุกแบบเเล้วเทส” หลังข้อเสนอเปรียบเทียบ
ภาพแยกชั้น, sprite sheet, วิดีโอ alpha และ 3D สด. Approval นี้ครอบคลุมต้นแบบและการวัดผล
ไม่ใช่การเปลี่ยน production Overlay หรือออก release. App version คง 0.13.2.

## Parent และ peer contracts

- [SRS](../product/software-requirements-specification.md): G-Signal ไม่เกิน 300 ms;
  CPU/RAM/FPS budgets ต้องตรวจด้วย runtime จริงก่อนรับงาน integration.
- [IA](../design-system/05-sitemap-ia.md): แยก control window กับ transparent overlay;
  การทดลองไม่เปลี่ยน layout ของ 7 หน้าและ settings ที่เพิ่งแก้.
- [FullOverlay](../../src/src/overlay/FullOverlay.tsx): จุดเชื่อมในอนาคตคือ bannerUi;
  event/audio/entitlement และการจัดตำแหน่งโมดูลยังใช้ contract เดิม.
- [Voice banner payload](../../src-tauri/src/voice_api/banner.rs): ทดลองด้วย asset ท้องถิ่น
  ที่สร้างขึ้นใหม่ ไม่ส่งข้อมูลผู้เล่น ไม่เปลี่ยน manifest หรือ IPC.

## Shared scene and timing

สร้างตราผลึกน้ำแข็งจาก Blender สำหรับตัวอย่าง MAIDEN / RAMPAGE บนพื้นที่ 640×320.
ใช้ camera composition และสีเดียวกัน: ice cyan, silver edge, deep blue; ไม่มีภาพเกมหรือ
ตัวละครของบุคคลอื่น. คลิป 3 วินาที 30 fps, เปิดประมาณ 0.4 s, ค้างถึง 2.4 s, ออก 0.6 s.
ข้อความเป็น live text แยกจาก asset. พื้นหลังตรวจ alpha มี checker, dark และ light.
เสียงปิดใน benchmark ทุกวิธีเพื่อให้เทียบ renderer ได้ตรงกัน.

| วิธี | รูปแบบ |
| --- | --- |
| layers | Blender render แยกองค์ประกอบแล้วขยับ transform/opacity; เป็น motion แบบประมาณ ไม่อ้าง pixel parity กับ 3D |
| sprite | 90 rendered frames ใน atlas; เล่น 30 fps โดยไม่ decode video |
| video | ใช้ 90 frames ชุดเดียวกับ sprite แปลง WebM alpha; ปิด audio |
| realtime | mesh จากฉากเดียวกัน render ผ่าน WebGL; ระบุความต่างของ shader/lighting กับ offline render |

## Benchmark protocol

1. เก็บ hardware/runtime/version และ sizes ทั้ง encoded bytes กับ decoded texture estimate.
2. แต่ละ run โหลด renderer เดียว; warm-up ก่อน sampling และสุ่ม/หมุนลำดับ 3 รอบ.
3. ใช้ CDP focus emulation ให้หน้า active ตลอดทั้ง Chrome/WebView2 เพื่อกัน host occlusion
   หยุด rAF; เป็น controlled-renderer benchmark ไม่ใช่การรับรอง native visibility.
   วัด idle baseline, CPU time ของ browser/WebView process tree, working set/private memory,
   rAF median/p95/long intervals และ video presented/dropped frames เมื่อ API รองรับ.
4. วัด GPU ผ่าน Windows process engine counters ถ้าเข้าถึงได้; ถ้าไม่ได้ให้รายงาน unavailable.
   rAF ไม่ใช่ Dota FPS และ GPU engine utilization ไม่ใช่ VRAM allocation.
5. Browser prototype และ native WebView2 overlay เป็น evidence คนละชุด. ไม่มีเกมจริง
   ห้ามสรุปว่าผ่าน NFR FPS ≤3% หรือ latency ของ G-Signal.
6. ตรวจ screenshot ทุกวิธีและพื้นหลัง, alpha corner, duration/end cleanup, replay,
   ไม่มี network egress, console errors/context loss และหยุด animation เมื่อจบ.

## Acceptance and exit

- เปิดดูและ replay ทั้งสี่วิธีได้; export blend/source/render inputs และ raw measurements.
- บันทึกข้อจำกัดด้าน fidelity และข้อผิดพลาดตามจริง รวมถึง runtime ที่ทดสอบไม่ได้.
- สรุป trade-off จากค่าที่วัด; ไม่สรุปผู้ชนะเมื่อความต่างอยู่ใน noise หรือคุณภาพภาพไม่เท่ากัน.
- ต้นแบบอยู่ใน `.brain/verification/banner-motion-2026-09-13/`; ไม่แก้ app code/dependencies.
- ตรวจ CodeDoc และ doc-graph; missing model = INDETERMINATE ไม่ใช่ aligned.

## ผลทดลองในเครื่อง

[ต้นแบบ](../../.brain/verification/banner-motion-2026-09-13/index.html),
[รายงาน](../../.brain/verification/banner-motion-2026-09-13/report.html) และ
[raw trials](../../.brain/verification/banner-motion-2026-09-13/benchmark.json) เก็บหลักฐาน 24 trials:
4 วิธี × 3 รอบ × Chrome/WebView2. ฉาก 640×320, 30 fps, 3 s, ปิดเสียง.
เครื่อง i7-14700KF / RTX 5060 Ti / RAM 32 GB.

ค่ากลาง CPU ของ process tree บน WebView2: layers 0.15%, realtime 0.25%, video 0.29%,
sprite 0.30% (หารด้วย 28 logical processors แล้ว). Private memory รวม host/runtime
ประมาณ 228, 231, 232 และ 302 MiB ตามลำดับ. rAF p95 ประมาณ 16.8 ms ทุกวิธี;
ไม่ใช่ผล Dota FPS. Video มี dropped-frame counters บางเฟรมระหว่าง loop; ดู raw/report.

สำหรับฉากนี้ layers ใช้ CPU/GPU ต่ำสุดและ sprite ใช้ private memory มากสุด.
Realtime ใช้ shader แบบง่าย จึงไม่ใช่ข้อพิสูจน์ว่า 3D สดทุกระดับรายละเอียดเบากว่าวิดีโอ.
คำแนะนำเป็น layers สำหรับ event ทั่วไป และพิจารณา WebM สำหรับเอฟเฟกต์ที่ต้อง bake รายละเอียดสูง.
ต้องทดสอบ Tauri Overlay + Dota จริงก่อนเลือก production renderer.

วิดีโอ pause/scrub ใช้สำเนา decoded frame ใน canvas ชั่วคราว; ลบก่อนเล่น จึงไม่มี
canvas draw loop ใน active video benchmark. การแก้ preview วิดีโอวัดซ้ำทั้งหกรอบ.
one-shot end visibility ตรวจแยกจาก loop workload เพื่อไม่ให้มีเศษผลึกค้างหลังจบ.
CodeDoc ยัง INDETERMINATE เพราะไม่มีโมเดลที่กำหนด; doc-graph wrapper ผ่านโดยไม่มี
strict errors ใหม่ที่อยู่นอก checklist.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0b | 2026-09-13 | Record approved four-method prototype, shared scene, measurement boundaries and acceptance. |
| 0.2.0b | 2026-09-13 | Record 24 controlled trials, renderer trade-offs, video preview correction and remaining native/game acceptance. |
