CASE 6: Agent ส่งงานไม่ตรง Requirement ต้องทำยังไง?
สถานการณ์นี้เจอบ่อยมากในโปรเจกต์ที่มี Agent
Requirement ตกลงกันแล้ว
เอกสารก็มี
ประชุมก็หลายรอบ
แต่พอ Agent ส่งงานมา กลับไม่ตรงกับที่คุยกันไว้
เช่น
Flow ไม่ตรง
Field ไม่ครบ
Business Rule ผิด
Report ไม่ตรง Format
Permission ไม่ตรง Role
ข้อความแจ้งเตือนไม่เหมือนที่ตกลง
หรือทำมาแล้วใช้งานจริงไม่ได้ตาม Process
ปัญหาคือ ถ้าเริ่มคุยด้วยอารมณ์
การแก้งานจะกลายเป็นการโทษกันทันที
Agent อาจบอกว่า
“ในเอกสารไม่ได้เขียนแบบนี้”
User อาจบอกว่า
“ตอนประชุมคุยไว้แล้ว”
PM / BA / PO ก็ต้องยืนกลางวง
เพื่อแยกว่าอะไรคือ Bug
อะไรคือ Gap
อะไรคือ Change Request
และอะไรต้องแก้ก่อน Go-live
ดังนั้นเวลางาน Agent ไม่ตรง Requirement
อย่าเริ่มจากการกล่าวโทษ
ให้เริ่มจากการเทียบข้อเท็จจริง
⸻
1. เทียบกับ Requirement ให้ชัด
อย่าพูดกว้าง ๆ ว่า
“งานไม่ตรง Requirement”
ให้ระบุให้ชัดว่าไม่ตรงตรงไหน
เช่น
Requirement ID อะไร
User Story ไหน
Acceptance Criteria ข้อไหน
Screen ไหน
Flow ไหน
Business Rule ไหน
Test Case ไหนไม่ผ่าน
ตัวอย่าง
แทนที่จะพูดว่า
“Agent ทำมาไม่ตรง”
ให้พูดว่า
“รายการนี้ยังไม่ตรงกับ Requirement REQ-05 และ Acceptance Criteria ข้อ 3 ที่ระบุว่า User ต้องสามารถ Export Report ตามช่วงวันที่ได้ครับ”
แบบนี้คุยง่ายกว่า
เพราะมี Reference ชัดเจน
⸻
2. ใช้ Evidence อย่าใช้ความรู้สึก
เวลาคุยกับ Agent ควรมีหลักฐานประกอบ
เช่น
Screenshot
Video record
Test result
UAT issue log
Requirement document
Acceptance Criteria
Meeting minutes
Email confirmation
Expected result vs Actual result
ตัวอย่าง Format ที่ใช้ได้
Expected Result: ระบบต้องแสดงสถานะ Approved หลังผู้อนุมัติกดอนุมัติ
Actual Result: ระบบยังแสดงสถานะ Pending
Evidence: Screenshot หน้า UAT วันที่ xx/xx/xxxx
Reference: AC-04
การมี Evidence ช่วยให้ประเด็นชัด
และลดการถกเถียงแบบ
“คิดว่า”
“จำได้ว่า”
“น่าจะ”
⸻
3. แยกให้ชัดว่าเป็น Bug, Gap หรือ Change Request
นี่คือจุดที่หลายทีมพลาด
ทุกอย่างที่ User ไม่พอใจ
ไม่ได้แปลว่า Agent ทำผิดเสมอไป
ต้องแยกให้ชัด
Bug
ระบบทำไม่ตรงกับ Requirement หรือ Acceptance Criteria ที่ตกลงกันไว้
Gap
Requirement อาจเขียนไม่ครบ หรือมีช่องว่างที่ทุกฝ่ายไม่ได้เคลียร์ตั้งแต่ต้น
Change Request
สิ่งที่ User ขอเพิ่มหรือเปลี่ยนจาก Scope เดิม
ตัวอย่าง
ถ้า Requirement เขียนว่า
“User ต้อง Export Excel ได้”
แต่ Agent ทำ Export ไม่ได้
อันนี้คือ Bug หรือ Defect
แต่ถ้า User ขอเพิ่มว่า
“อยากให้ Excel มี Pivot Summary ด้วย”
ถ้าไม่เคยอยู่ใน Scope
อันนี้อาจเป็น Change Request
การแยกให้ชัดช่วยให้ทีมไม่โยนทุกอย่างไปเป็นความผิดของ Agent
และช่วยกัน Scope Creep ได้ด้วย
⸻
4. ประเมิน Impact ให้ชัด
หลังรู้ว่างานไม่ตรงตรงไหน
ต้องประเมินว่า Impact คืออะไร
คำถามที่ควรถาม
กระทบ User ใช้งานจริงไหม?
กระทบ Flow หลักไหม?
กระทบ Data ไหม?
กระทบ Report / Operation / Approval ไหม?
กระทบ UAT Sign-off ไหม?
กระทบ Go-live ไหม?
มี Workaround ชั่วคราวไหม?
ควรแยก Severity เช่น
Critical
Flow หลักใช้งานไม่ได้ หรือ Data ผิด
High
กระทบงานสำคัญ แต่มี Workaround บางส่วน
Medium
กระทบบาง Case แต่ยังไม่ Block Go-live
Low
Wording, UI หรือ Minor Issue ที่แก้หลัง Go-live ได้
ถ้าไม่แยก Impact
ทีมจะไม่รู้ว่าอะไรต้องแก้ก่อน และอะไรเลื่อนได้
⸻
5. ขอ Action Plan จาก Agent
หลังสรุป Issue แล้ว
อย่าจบแค่ว่า
“ช่วยแก้ด้วยครับ”
ควรขอ Action Plan ที่มีรายละเอียดชัดเจน
Agent จะแก้อะไร
ใครเป็น Owner
จะแก้เสร็จเมื่อไหร่
จะส่งให้ Retest วันไหน
มีผลกระทบกับส่วนอื่นไหม
ต้องใช้ข้อมูลเพิ่มเติมจากฝั่งเราไหม
ต้องมี Regression Test ไหม
ต้องอัปเดตเอกสารอะไรไหม
ตัวอย่างประโยค
“รบกวน Agent ช่วยสรุป Action Plan สำหรับ Issue กลุ่ม Critical/High พร้อม Owner และ Due Date ให้ภายในวันนี้ครับ”
“หลังแก้ไขแล้ว ขอให้ส่ง Release Note และรายการที่ต้อง Retest ให้ทีมตรวจสอบด้วยครับ”
⸻
6. บันทึกทุกอย่างไว้
เวลางาน Agent ไม่ตรง Requirement
ต้องมีบันทึกชัดเจน
ควรบันทึก
Issue ID
Requirement Reference
Expected Result
Actual Result
Severity
Owner
Due Date
Status
Decision
Retest Result
Sign-off Status
เพราะถ้าไม่มี Log
หลังจากนั้นจะเริ่มมีคำถามว่า
ใครเป็นคนแจ้ง?
Agent รับทราบหรือยัง?
ต้องแก้เมื่อไหร่?
อันนี้เป็น Bug หรือ CR?
User ยอมรับแล้วหรือยัง?
Issue Log / Defect Log สำคัญมากเวลาทำงานกับ Agent
⸻
ประโยคที่ใช้คุยกับ Agent ได้จริง
“ขอเทียบกับ Requirement ที่ตกลงกันไว้ก่อนนะครับ”
“รายการนี้ยังไม่ตรงกับ Acceptance Criteria ข้อที่ 3 ครับ”
“ขอให้ Agent ช่วยยืนยันว่า Issue นี้เป็น Defect จาก Scope เดิม หรือเป็น Change Request ครับ”
“รบกวนช่วยแจ้ง Root Cause และ Action Plan สำหรับการแก้ไขครับ”
“รายการนี้กระทบ UAT Sign-off และ Go-live จึงขอ Due Date ที่ชัดเจนครับ”
“หลังแก้ไขแล้ว ขอให้ส่งรายการที่ต้อง Retest พร้อม Release Note ด้วยครับ”
“ขอให้สรุป Owner, Due Date และ Expected Fix Version สำหรับแต่ละ Issue ครับ”
⸻
สิ่งที่ไม่ควรทำ
อย่าพูดกว้าง ๆ ว่า “ทำไม่ตรง” โดยไม่มี Reference
อย่าใช้ความจำแทน Requirement, Minutes หรือ Acceptance Criteria
อย่าเอา Bug กับ Change Request มาปนกัน
อย่าปล่อยให้ Agent แก้โดยไม่มี Due Date
อย่าให้ User UAT ซ้ำโดยไม่มี Retest Scope
อย่าลืมบันทึก Decision และ Evidence
อย่าปิด Issue ถ้า User ยังไม่ได้ Confirm
⸻
สรุปง่าย ๆ
Agent ส่งงานไม่ตรง Requirement
ไม่ควรคุยด้วยอารมณ์
แต่ควรคุยด้วยข้อมูล
Requirement Reference
Evidence
Bug / Gap / Change Request
Impact
Action Plan
Retest Result
จำไว้ว่า
ถ้าไม่มี Reference การคุยจะกลายเป็นความรู้สึก
ถ้ามี Evidence การคุยจะกลายเป็นการแก้ปัญหา
Save ไว้ก่อนคุยกับ Agent รอบหน้า