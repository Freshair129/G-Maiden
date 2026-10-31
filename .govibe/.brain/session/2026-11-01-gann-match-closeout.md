# สรุปเซสชัน GANN และการทดสอบแมตช์ 2026-11-01

## จุดเริ่มและการตัดสินใจ

ทำโฟลว์สร้าง ส่งออก ติดตั้ง และเล่น GANN ก่อน Store พร้อมเก็บ GSI ภาพ และเสียงแยกโปรเซสในแมตช์จริง ผู้ใช้ต้องการแพ็ก VRZO แต่แมตช์ที่สองใช้โปรไฟล์ทดสอบ Creator UAT ผิดพลาด จึงไม่ถือว่า VRZO ผ่านแมตช์จริง

## สิ่งที่ทำ

- GANN-only และ G-AnnStudio creator flow รวมก่อนหน้านี้ผ่าน G-Maiden PR #99/#100 และ G-Suite PR #10/#11
- G-Maiden PR #102 รวมเป็น b22a0ee8ff50791777a54ed1660f9eab81b78f37 แก้ overlay ปฏิเสธอายุ banner ที่ native ส่งมา
- คืน runtime เดิมและตรวจว่าเลือก VRZO r5 อยู่ โปรไฟล์ทดสอบ Creator UAT มี danger เพียงเหตุการณ์เดียว คลิปต้นฉบับมีระดับเฉลี่ยประมาณ -29 dBFS; process loopback พบสัญญาณตรงกับคลิป แต่ไม่ได้พิสูจน์เสียงที่ลำโพง
- แมตช์หลังแก้แสดงภาพ Creator UAT จริงและ log มี banner หลายครั้ง แต่ไม่ได้ทดสอบแพ็ก VRZO ในแมตช์นั้น CV เข้าสู่ Lite หลังไม่มีเฟรม minimap ประมาณ 6 วินาทีภายใต้โหลดเกมและการบันทึก

## Verify และข้อจำกัด

PR #102: CI และ pr-gate ผ่าน; Rust 633 ผ่าน 9 ignored, clippy, TypeScript, ESLint, frontend 545 ผ่านแบบ one worker และ Windows debug no-bundle smoke ผ่าน รอบ frontend สอง worker มี 9 failures ใน account-remediation แต่ไฟล์เดี่ยวและ suite หนึ่ง worker ผ่าน สาเหตุยังไม่ยืนยัน ครั้งแรกที่เปิด smoke binary overlay หมดเวลาเริ่ม แต่ retry สำเร็จโดยไม่ทราบสาเหตุ

GSI replay 65 payload จากแมตช์ก่อนหน้าเข้า native binary ที่แก้แล้ว ได้ HTTP 200 ทั้งหมด มีภาพและเสียงจาก Creator UAT; นี่ไม่ใช่หลักฐาน acoustic sync หรือ VRZO match acceptance แมตช์ที่สอง HEVC ตั้ง 60 fps แต่เฉลี่ยราว 57 fps และ ffmpeg รายงานเฟรมตก

## ค้างก่อน Store และปิดเซสชัน

1. ทดสอบ VRZO จริงหลังตรวจชื่อแพ็ก/โปรไฟล์ก่อนเริ่ม และวัดภาพ–เสียงตลอดเส้นทางโดยแยกเสียงสองโปรเซส
2. วิเคราะห์ CV Lite, เวลา classifier และ overlay bootstrap timeout พร้อมแยกผลกระทบจากการบันทึก ตรวจ player-name OCR และ replay ภาพ CV ซึ่งยังไม่ได้ทำ
3. ผู้ใช้สั่งลบ recording สองแมตช์ ระบบตรวจอัตโนมัติปฏิเสธแม้ระบุไฟล์เดี่ยวว่า blocked by policy จึงยังมีไฟล์อยู่ อย่าบอกว่าลบแล้ว
4. Checkout หลักและ worktree VRZO มี uncommitted changes ไม่ทราบเจ้าของ; อย่าทิ้งจนตรวจที่มาและรักษางาน ส่วน diagnostic patch สำหรับ CV ยังไม่ทดสอบ เก็บเป็น diagnostic-cv-final.patch นอก repo แล้วถอด worktree CV
5. Store เลื่อนไปก่อน และยังไม่ปล่อย release; local tag v0.13.5 เก่ากว่า PR #102 ห้ามถือว่าเป็น head ล่าสุด