DAY 21: Test Case กับ Acceptance Criteria ต่างกันไหม?

หลายทีมใช้คำว่า Acceptance Criteria กับ Test Case ปนกันบ่อยมาก

บางคนเขียน AC เป็น step ทดสอบละเอียด
บางคนเขียน Test Case แบบกว้าง ๆ เหมือน requirement
บางทีมมี User Story แต่ไม่มี AC
บางทีมมี Test Case แต่ไม่รู้ว่าผูกกับ requirement ข้อไหน

สุดท้าย Dev, QA, BA, PO และ User คุยกันไม่ตรงว่า:

งานนี้ต้องผ่านอะไร?
ต้องทดสอบยังไง?
ใครเป็นคนยืนยัน?
และแบบไหนถึงเรียกว่า Done?

Acceptance Criteria คืออะไร?

Acceptance Criteria หรือ AC
คือเงื่อนไขที่บอกว่า requirement, user story หรือ feature นี้
ต้องเป็นแบบไหน ถึงจะเรียกว่า “เสร็จ” หรือ “ยอมรับได้”

พูดง่าย ๆ:

AC = เงื่อนไขความสำเร็จของงาน

AC ช่วยตอบคำถามว่า:

งานนี้ต้องทำอะไรได้?
เงื่อนไขผ่านคืออะไร?
กรณีสำคัญที่ต้องรองรับคืออะไร?
ผลลัพธ์ที่ user ควรเห็นคืออะไร?
แบบไหนถึงเรียกว่า Done?

ตัวอย่าง AC:

User สามารถ Login ด้วย Email และ Password ได้
ถ้า Password ไม่ถูกต้อง ระบบต้องแสดงข้อความแจ้งเตือน
ถ้า Login สำเร็จ ระบบต้องพา User ไปที่หน้า Dashboard
ระบบต้องไม่อนุญาตให้ Login เมื่อกรอกข้อมูลไม่ครบ

Test Case คืออะไร?

Test Case คือชุดขั้นตอนหรือสถานการณ์ที่ใช้ทดสอบว่า
ระบบทำงานตาม Acceptance Criteria หรือ Requirement จริงหรือไม่

พูดง่าย ๆ:

Test Case = วิธีพิสูจน์ว่า AC ผ่านจริงไหม

Test Case มักตอบคำถามว่า:

ต้องเริ่มจากเงื่อนไขอะไร?
ต้องทำขั้นตอนอะไรบ้าง?
ต้องใช้ข้อมูลอะไร?
Expected Result คืออะไร?
Actual Result เป็นอย่างไร?
ผลคือ Pass หรือ Fail?

ตัวอย่าง Test Case:

Test Case: Login สำเร็จด้วย Email และ Password ที่ถูกต้อง

Precondition: User มีบัญชีในระบบแล้ว
Step 1: เปิดหน้า Login
Step 2: กรอก Email ที่ถูกต้อง
Step 3: กรอก Password ที่ถูกต้อง
Step 4: กดปุ่ม Login
Expected Result: ระบบพา User ไปที่หน้า Dashboard
Result: Pass / Fail

ต่างกันยังไง?

Acceptance Criteria
บอกว่า ต้องผ่านอะไร

Test Case
บอกว่า จะทดสอบยังไง

หรือจำอีกแบบ:

AC = What good looks like
Test Case = How to verify it

AC มักเขียนก่อน เพื่อให้ทีมเข้าใจนิยามของคำว่า Done
จากนั้น QA / BA / Tester จึงเอา AC ไปแตกเป็น Test Case

ตัวอย่างเทียบกัน

Requirement:
User ต้องสามารถ Login เข้าระบบได้

Acceptance Criteria:

User Login ด้วย Email และ Password ได้
ถ้า Email หรือ Password ไม่ถูกต้อง ระบบต้องแจ้ง error
ถ้ากรอกข้อมูลไม่ครบ ระบบต้องแจ้งให้กรอกข้อมูล
ถ้า Login สำเร็จ ต้องไปที่หน้า Dashboard

Test Case:

TC01: Login สำเร็จด้วย Email และ Password ที่ถูกต้อง
TC02: Login ไม่สำเร็จเมื่อ Password ผิด
TC03: Login ไม่สำเร็จเมื่อ Email ไม่ถูกต้อง
TC04: Login ไม่สำเร็จเมื่อไม่กรอก Password
TC05: Login ไม่สำเร็จเมื่อไม่กรอก Email

จะเห็นว่า 1 AC อาจแตกเป็นหลาย Test Case ได้
และ 1 Test Case ควร trace กลับไปหา Requirement หรือ AC ได้

ถ้ามี AC แต่ไม่มี Test Case จะเกิดอะไรขึ้น?

ทีมอาจเข้าใจว่า Done คืออะไร
แต่ตอนทดสอบจริงอาจไม่ครบทุก scenario

เช่น มี AC ว่า “ถ้าข้อมูลไม่ครบต้องแจ้งเตือน”
แต่ไม่มี Test Case แยกว่าขาด field ไหนบ้าง
สุดท้าย QA อาจ Test ไม่ครบ

ถ้ามี Test Case แต่ไม่มี AC จะเกิดอะไรขึ้น?

ทีมอาจมี step test เยอะมาก
แต่ไม่รู้ว่าทดสอบไปเพื่อยืนยันเงื่อนไขอะไร

สุดท้าย Test Case อาจหลุดจาก Business Value
หรือกลายเป็นการ test ตามความเข้าใจของคนเขียนคนเดียว

ใครควรเขียนอะไร?

โดยทั่วไป:

BA / PO / Product Team
ควรช่วยเขียน Acceptance Criteria
เพราะ AC ผูกกับ requirement, user need และ business value

QA / Tester
ควรช่วยแตก Test Case
เพราะต้องคิด scenario, edge case, test data และ expected result

Dev
ควรช่วย review ทั้ง AC และ Test Case
เพื่อเช็ก feasibility, technical flow และ case ที่อาจตกหล่น

User / Business
ควรช่วย confirm ว่า AC และ scenario สำคัญตรงกับงานจริง

Checklist ก่อนส่งงานไป Test / UAT

ลองเช็กว่า:

Requirement มี AC ชัดไหม?
AC วัดผลได้หรือไม่?
Test Case ครอบคลุม AC ครบไหม?
มีทั้ง positive case และ negative case ไหม?
Expected Result ชัดไหม?
Test data พร้อมไหม?
Test Case trace กลับไปหา Requirement ได้ไหม?
User หรือ Business เข้าใจและยืนยัน scenario สำคัญแล้วหรือยัง?

สรุปง่าย ๆ

Acceptance Criteria กับ Test Case ไม่ใช่สิ่งเดียวกัน
แต่ต้องทำงานคู่กัน

AC ช่วยให้ทีมรู้ว่า Done คืออะไร
Test Case ช่วยพิสูจน์ว่า Done จริงหรือเปล่า

ถ้า AC ชัด Test Case จะเขียนง่ายขึ้น
ถ้า Test Case ดี UAT จะมั่วลดลง

