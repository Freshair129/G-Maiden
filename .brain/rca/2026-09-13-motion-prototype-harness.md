---
title: "Motion prototype — invalid runs and corrected harness"
doc_id: "2026-09-13-motion-prototype-harness"
version: "0.1.0"
status: "active"
updated: "2026-09-13"
owner: "RWANG"
---

# Symptom

ต้นแบบบางรอบโหลดภาพค้าง, animation ไม่จบ, sprite หยุดวาดเฟรม และวิดีโอ seek กลับเฟรม 0.
ข้อผิดพลาดเหล่านี้อยู่ในชุดทดลองใหม่ ไม่ใช่ regression ของ production Overlay.

# Evidence and root cause

- `discarded-occluded-trial.json`: document hidden, rAF samples 0. OS occlusion ทำให้
  Chromium ระงับ animation/image decode. Focus emulation ถูกใช้เหมือนกันทั้งสอง runtime;
  ผลหลังแก้เป็น controlled-renderer benchmark ไม่ใช่ native foreground acceptance.
- `probe.py` เดิมตรวจแค่ window.ready หลัง Page.navigate จึงอาจอ่าน document เก่า;
  ตอนนี้ต้องเปลี่ยน performance.timeOrigin ก่อนยอมรับ ready.
- `discarded-sprite-startup.json`: sprite drawImage ได้ undefined. rAF timestamp แรกอาจ
  ก่อน performance.now ที่ตั้งตอน play; t ติดลบทำให้ frame=-1 และไม่มี atlas นั้น.
  แก้ clamp elapsed/frame ไม่ให้ต่ำกว่า 0. ไม่เปลี่ยน event timing ของแอปจริง.
- `discarded-video-range.json` และ `video_probe.py`: decoded local PNG มี alpha 0..255
  แต่ browser currentTime หลัง seek เป็น 0 และเห็นเฉพาะเศษผลึกเฟรมแรก.
  SimpleHTTPRequestHandler ไม่ตอบ byte ranges; แก้ `serve.py` ให้ตอบ HTTP 206/Content-Range.
  Probe หลังแก้ยืนยัน currentTime=1.2 และ presented mediaTime=1.5 หลัง seek.
- `before-video-paused-presentation.png`: paused compositor อาจแสดงเฟรมเก่าแม้ decoder
  อยู่ที่เวลาที่ขอแล้ว. ใช้ canvas สำเนาของ decoded frame เฉพาะ pause/scrub และถอดทิ้ง
  ก่อน video play; เปลี่ยนผล benchmark video ทั้งหกรอบหลังแก้.
- PNG frame 90 ยังมีเศษผลึกก่อนจังหวะปิดครบ 3 s. เพิ่ม shared end visibility เพื่อให้
  one-shot จบแล้วไม่มีภาพตกค้าง; ทดสอบ end/replay แยกจาก continuous-loop benchmark.

# Why detection escaped

ภาพนิ่งเฟรมเดียวและขนาดไฟล์ที่ encode สำเร็จไม่ตรวจ lifecycle ของ player, first-frame
timestamp, media range seeking หรือความต่างของ document lifecycle ระหว่าง navigation.

# Prevention

ตรวจ alpha ที่เฟรมกลาง, actual seek timestamp, one-shot completion, replay และ rAF progress
ก่อนรับค่าประสิทธิภาพ. แต่ละ trial ใช้ process ใหม่และ renderer เดียว; กรณีไม่ visible,
มี JS errors หรือไม่มี rAF progress ให้ทิ้งผลและเก็บเหตุผลแทนรายงานว่า renderer ประหยัด.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-09-13 | Preserve invalid prototype runs and evidence-based harness corrections. |
