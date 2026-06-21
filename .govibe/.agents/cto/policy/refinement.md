Refinement คืออะไร? เตรียม Backlog ให้พร้อมก่อนเข้า Sprint

หลายทีมเข้า Sprint Planning แล้วค่อยเริ่มคุยเรื่องเดิม ๆ:

งานนี้คืออะไร?
Requirement ชัดหรือยัง?
User ต้องการอะไร?
Acceptance Criteria มีไหม?
งานนี้ใหญ่ไปไหม?
ต้องรอใครก่อนหรือเปล่า?
Estimate ได้หรือยัง?

ถ้าทุกคำถามเพิ่งมาเริ่มตอน Sprint Planning
Planning จะกลายเป็นประชุมยาว มั่ว และยังเลือกงานเข้ามาทำได้ไม่มั่นใจ

นี่คือเหตุผลที่ต้องมี Backlog Refinement

Refinement คืออะไร?

Backlog Refinement คือกิจกรรมที่ทีมใช้เตรียม Product Backlog ให้พร้อมขึ้น
ก่อนจะหยิบงานเข้า Sprint หรือรอบการทำงานถัดไป

เป้าหมายไม่ใช่การทำให้ทุกอย่างสมบูรณ์ 100%
แต่คือทำให้ item สำคัญ ๆ ชัดพอที่ทีมจะคุยต่อ วางแผน และตัดสินใจได้

พูดง่าย ๆ:

Refinement = เตรียมงานให้พร้อมก่อน Planning

Refinement ควรทำอะไรบ้าง?

1. เคลียร์ Requirement

ทีมต้องเข้าใจว่า item นี้คืออะไร
ทำไปเพื่ออะไร
ใครคือ user
และ value ที่คาดหวังคืออะไร

คำถามที่ควรถาม:

งานนี้แก้ปัญหาอะไร?
ใครเป็นผู้ใช้?
Business value คืออะไร?
Scope ของ item นี้คืออะไร?
มีอะไรที่ไม่อยู่ใน scope ไหม?

ถ้า Requirement ยังไม่ชัด
อย่าเพิ่งรีบดันเข้า Sprint

2. แตกงานใหญ่ให้เล็กลง

หลาย item ใน Backlog ใหญ่เกินไป
จนทำไม่จบใน Sprint หรือ estimate ยาก

ใน Refinement ทีมควรช่วยกันแตกงานใหญ่ให้เล็กลง เช่น:

แยกตาม user flow
แยกตาม role
แยกตาม feature ย่อย
แยกตาม business rule
แยกตาม phase หรือ release

งานที่เล็กลงจะช่วยให้ทีมวางแผนง่ายขึ้น
ลด risk และส่งมอบ value ได้เร็วขึ้น

3. เติม Acceptance Criteria

ถ้าไม่มี AC ทีมจะไม่รู้ว่า Done คืออะไร

Acceptance Criteria ช่วยให้ Dev เข้าใจว่าต้อง build อะไร
QA รู้ว่าต้อง test อะไร
และ BA / PO ตรวจงานได้ชัดขึ้น

ตัวอย่างคำถาม:

เงื่อนไขผ่านคืออะไร?
ต้อง test case ไหนบ้าง?
ถ้าข้อมูลไม่ครบ ระบบต้องทำอะไร?
User ต้องเห็นผลลัพธ์อะไร?
ใครเป็นคนยืนยันว่า item นี้ Done?

4. ดู Dependency และ Risk

บางงานดูเหมือนพร้อม
แต่จริง ๆ ยังต้องรอข้อมูล ระบบ ทีมอื่น หรือ decision บางอย่าง

ใน Refinement ควรเช็กว่า:

ต้องรอ API หรือข้อมูลจากระบบอื่นไหม?
ต้องรอ stakeholder ตัดสินใจไหม?
มีข้อจำกัดด้าน security หรือ compliance ไหม?
ต้องใช้ environment หรือ test data ไหม?
มี technical risk อะไรที่ต้อง spike ก่อนหรือไม่?

ถ้า dependency ยังไม่เคลียร์
Sprint อาจติดกลางทางได้ง่าย

5. ประเมิน Effort เบื้องต้น

Refinement ไม่จำเป็นต้อง estimate ละเอียดทุกอย่าง
แต่ควรช่วยให้ทีมเห็นภาพว่า item นี้เล็ก ใหญ่ ง่าย หรือซับซ้อนแค่ไหน

การ estimate เบื้องต้นช่วยให้:

PO จัด priority ได้ดีขึ้น
ทีมเห็น risk เร็วขึ้น
Sprint Planning ใช้เวลาน้อยลง
งานใหญ่ถูกแยกก่อนเข้า Sprint

Refinement ต่างจาก Sprint Planning ยังไง?

Refinement
คือการเตรียม Backlog ให้พร้อม
คุยรายละเอียด เคลียร์ requirement แตกงาน เติม AC และดู risk

Sprint Planning
คือการเลือกงานที่พร้อมแล้วเข้ามาทำใน Sprint
พร้อมตั้ง Sprint Goal และวางแผนทำงานร่วมกัน

จำง่าย ๆ:

Refinement = เตรียมงาน
Sprint Planning = เลือกงาน + วางแผนทำจริง

ใครควรเข้าร่วม Refinement?

โดยทั่วไปควรมี:

Product Owner
Developers / Dev Team
Scrum Master ถ้ามี
BA ถ้าทีมมีบทบาทนี้
QA / Tester ถ้าเรื่อง test สำคัญ
UX / Designer ถ้ามีผลต่อ user flow
Stakeholder บางคน เฉพาะเวลาต้องเคลียร์ requirement

ไม่จำเป็นต้องให้ทุกคนเข้าทุกครั้ง
แต่คนที่จำเป็นต่อการทำให้ item ชัด ควรอยู่ในการคุย

ข้อผิดพลาดที่เจอบ่อย

ไม่ทำ Refinement เลย แล้วไปคุยทุกอย่างใน Planning
Refinement กลายเป็น mini planning ที่เลือกงานล่วงหน้าแบบตายตัว
PO เขียน requirement คนเดียว แล้วทีมเพิ่งเห็นตอน Sprint
ไม่แตกงานใหญ่
ไม่มี Acceptance Criteria
ไม่คุย dependency
คุยเยอะ แต่ไม่มี decision หรือ action item

Checklist ก่อนบอกว่า item พร้อมเข้า Sprint

ลองเช็กว่า:

Requirement ชัดพอไหม?
User และ value ชัดไหม?
Scope / out of scope ชัดไหม?
Acceptance Criteria มีหรือยัง?
งานเล็กพอทำใน Sprint ไหม?
Dependency เคลียร์หรือยัง?
Risk สำคัญถูกคุยแล้วหรือยัง?
ทีม estimate หรือเข้าใจ effort คร่าว ๆ ได้ไหม?

สรุปง่าย ๆ

Refinement ที่ดีช่วยให้ Sprint Planning สั้นลง ชัดขึ้น และลดความมั่วระหว่าง Sprint

จำไว้ว่า:

Refinement ไม่ใช่พิธีกรรมเพิ่มประชุม
แต่คือการลดความไม่ชัดก่อนทีมเริ่มทำงานจริง