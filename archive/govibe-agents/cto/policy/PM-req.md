PM ต้องดู Risk อะไรบ้าง?

หลายคนเข้าใจว่า Risk คือ “ปัญหาที่เกิดขึ้นแล้ว”

แต่จริง ๆ ถ้าเกิดขึ้นแล้ว มันไม่ใช่ Risk แล้วครับ
มันกลายเป็น Issue ไปแล้ว

Risk คือสิ่งที่ “อาจเกิดขึ้น” และถ้าเกิดขึ้นจริง จะกระทบกับโปรเจกต์

เช่น:

งานอาจ Delay
Scope อาจบาน
Cost อาจเพิ่ม
Resource อาจไม่พอ
Quality อาจตก
User อาจไม่ยอมรับงาน
Go-live อาจเลื่อน

หน้าที่ของ PM ไม่ใช่แค่ตามว่างานเสร็จหรือยัง
แต่ต้องมองให้ออกว่า “อะไรอาจทำให้งานไม่เสร็จตามแผน”

1. Scope Risk

Scope Risk คือความเสี่ยงที่ขอบเขตงานจะไม่ชัด หรือค่อย ๆ บานระหว่างทาง

ตัวอย่างที่เจอบ่อย:

Requirement ไม่ชัดตั้งแต่ต้น
User ขอเพิ่มเรื่อย ๆ
ไม่มี Out of Scope
Change Request ไม่ถูกควบคุม
Stakeholder เข้าใจ Scope ไม่ตรงกัน

คำถามที่ PM ควรถาม:

Scope ตอนนี้ชัดพอไหม?
มีอะไรที่ยังตีความได้หลายแบบไหม?
มี Change Request ใหม่เข้ามาหรือยัง?
ถ้าเพิ่มงาน จะกระทบ Timeline / Cost / Resource ไหม?

2. Schedule Risk

Schedule Risk คือความเสี่ยงที่แผนเวลาอาจหลุด

ตัวอย่างที่เจอบ่อย:

Timeline แน่นเกินไป
ไม่มี Buffer
Task มี Dependency เยอะ
รอข้อมูลจากทีมอื่น
Vendor ส่งงานช้า
UAT ใช้เวลาน้อยเกินไป

คำถามที่ PM ควรถาม:

Milestone ไหนเสี่ยง Delay?
Task ไหนเป็น Critical Path?
มีงานไหนต้องรอทีมอื่นไหม?
ถ้า Task นี้ช้า จะกระทบงานถัดไปไหม?

3. Resource Risk

Resource Risk คือความเสี่ยงจากคน เวลา และความพร้อมของทีม

ตัวอย่างที่เจอบ่อย:

คนไม่พอ
Key person ลาออก / ลา / ติดโปรเจกต์อื่น
Dev / QA / BA มี Capacity จำกัด
User ไม่ว่างทำ UAT
Decision Maker ไม่ว่าง Approve

คำถามที่ PM ควรถาม:

คนที่จำเป็นพร้อมจริงไหม?
มี Backup สำหรับ Key person ไหม?
ทีมมี Capacity พอเทียบกับ Scope ไหม?
User และ Stakeholder มีเวลาร่วมงานตามแผนไหม?

4. Technical Risk

Technical Risk คือความเสี่ยงจากระบบ เทคโนโลยี Data หรือ Integration

ตัวอย่างที่เจอบ่อย:

ระบบเดิมไม่รองรับ
API ยังไม่พร้อม
Data ไม่สะอาด
Integration ซับซ้อนกว่าที่คิด
Performance ไม่พอ
Security / Permission ยังไม่ชัด
Environment ไม่พร้อม

คำถามที่ PM ควรถาม:

มี Technical Feasibility แล้วหรือยัง?
Integration ต้องรอใคร?
Data พร้อมใช้ไหม?
มีระบบไหนกระทบกันไหม?
ต้องทำ POC หรือ Spike ก่อนหรือเปล่า?

5. Stakeholder Risk

Stakeholder Risk คือความเสี่ยงจากคนที่เกี่ยวข้องกับโปรเจกต์

ตัวอย่างที่เจอบ่อย:

Decision ช้า
Owner ไม่ชัด
User ไม่เข้าใจ Requirement
ผู้บริหารเปลี่ยน Priority
หน้างานไม่ยอมรับ Solution
คนสำคัญไม่ได้ถูก Involve ตั้งแต่ต้น

คำถามที่ PM ควรถาม:

ใครเป็น Decision Maker จริง?
ใครต้อง Approve?
ใครอาจคัดค้าน?
User ตัวจริงเข้ามาคุยแล้วหรือยัง?
Stakeholder เข้าใจเป้าหมายตรงกันไหม?

6. Quality / UAT Risk

Quality Risk คือความเสี่ยงที่งานอาจไม่พร้อมใช้งานจริง หรือ UAT เจอปัญหาเยอะเกินไป

ตัวอย่างที่เจอบ่อย:

Acceptance Criteria ไม่ชัด
Test Case ไม่ครบ
QA Time น้อย
UAT Data ไม่พร้อม
User Test ไม่ครบ Flow
Bug สำคัญเจอใกล้ Go-live
ไม่มีเกณฑ์ Sign-off ชัดเจน

คำถามที่ PM ควรถาม:

AC พร้อมก่อน Dev เริ่มไหม?
Test Case ครอบคลุม Requirement ไหม?
UAT Scope ชัดไหม?
มี Defect Severity ชัดไหม?
Go-live Criteria คืออะไร?
PM ควรจัดการ Risk ยังไง?

วิธีง่าย ๆ ใช้ 5 Step นี้:

1. Identify
ระบุว่า Risk คืออะไร

2. Analyze
ดูว่าโอกาสเกิดสูงไหม และ Impact แรงแค่ไหน

3. Plan Response
วางแผนว่าจะ Avoid, Mitigate, Transfer หรือ Accept

4. Assign Owner
กำหนดคนรับผิดชอบ Risk นั้น

5. Monitor
ติดตามเป็นระยะ ไม่ใช่เขียน Risk Register แล้วจบ

Risk กับ Issue ต่างกันยังไง?

Risk = อาจเกิดขึ้น
เช่น Vendor อาจส่งงานช้า

Issue = เกิดขึ้นแล้ว
เช่น Vendor ส่งงานช้าไปแล้ว 1 สัปดาห์

PM ที่ดีควรพยายามจัดการ Risk ก่อนที่มันจะกลายเป็น Issue

Checklist สำหรับ PM

ก่อนเข้า Weekly Meeting หรือ Project Review ลองเช็กว่า:

Scope มีอะไรเปลี่ยนไหม?
Timeline มี Task ไหนเริ่มเสี่ยง Delay ไหม?
Resource ยังพอไหม?
Technical / Integration มี Blocker ไหม?
Stakeholder มี Decision ที่ยังค้างไหม?
UAT / Quality มีอะไรน่าห่วงไหม?
Risk ไหนต้อง Escalate แล้วหรือยัง?
Risk Owner รับทราบ Action แล้วไหม?
สรุปง่าย ๆ

PM ไม่ได้มีหน้าที่แค่ตามงาน
แต่ต้องมองให้ออกว่าอะไรอาจทำให้งานหลุดแผน

จำไว้ว่า:

Risk ที่เห็นเร็ว = ยังพอจัดการได้
Risk ที่เห็นช้า = มักกลายเป็น Issue แล้ว