# **Software Requirements Specification (SRS)**

## **Project: G-Maiden \- AI Companion & Narrative Engine**

## **1\. บทนำ (Introduction)**

### **1.1 วัตถุประสงค์ (Purpose)**

เอกสารข้อกำหนดความต้องการทางซอฟต์แวร์ (SRS) ฉบับนี้จัดทำขึ้นเพื่อระบุข้อกำหนดทั้งด้านฟังก์ชันการทำงาน (Functional Requirements) และไม่ใช่ฟังก์ชันการทำงาน (Non-Functional Requirements) สำหรับระบบ **G-Maiden** ซึ่งเป็นระบบ AI Companion และ Co-pilot อัจฉริยะแบบเรียลไทม์สำหรับผู้เล่นเกม Dota 2

### **1.2 ขอบเขตของระบบ (Product Scope)**

G-Maiden จะทำหน้าที่เป็นผู้ช่วยส่วนตัวผ่านระบบเสียงและการแสดงผล Overlay บนหน้าจอ โดยทำงานร่วมกับระบบ Dota 2 Game State Integration (GSI) เพื่อดึงข้อมูลดิบในเกมมาประมวลผลผ่านโมเดลภาษาขนาดเล็กที่รันภายในเครื่อง (Local SLM) ร่วมกับโมเดลประมวลผลระดับสูงบนคลาวด์ (Cloud LLM) โดยมีจุดมุ่งหมายหลักในการยกระดับประสบการณ์การเล่นเกม เพิ่มความตื่นเต้น และช่วยวิเคราะห์เกมแบบเรียลไทม์โดยไม่ขัดขวางสมาธิของผู้เล่น

### **1.3 คำนิยามและคำย่อ (Definitions & Acronyms)**

* **GSI (Game State Integration):** ระบบส่งข้อมูลสถานะภายในเกมของ Valve (ผู้พัฒนา Dota 2\)  
* **SLM (Small Language Model):** โมเดลภาษาขนาดเล็กที่สามารถรันในเครื่องของผู้เล่นได้โดยตรงเพื่อความเร็วสูง  
* **LLM (Large Language Model):** โมเดลภาษาขนาดใหญ่บนคลาวด์ (เช่น Gemini) สำหรับงานวิเคราะห์เชิงลึก  
* **Belief Revision (การปรับปรุงความเชื่อ):** ความสามารถของ AI ในการเปลี่ยนทิศทางคำพูดหรือการคาดเดากลางคันเมื่อได้รับข้อมูลใหม่ที่ขัดแย้งกับสิ่งเดิมที่เคยเชื่อ  
* **Overlay:** หน้าต่างแสดงผลแบบโปร่งแสงที่แสดงทับซ้อนอยู่บนหน้าจอเกม

## **2\. คำอธิบายโดยรวม (Overall Description)**

### **2.1 ภาพรวมของผลิตภัณฑ์ (Product Perspective)**

G-Maiden ทำงานในฐานะแอปพลิเคชันประเภท **Hybrid Client-Server** โดยสแตนด์บายอยู่หลังบ้านและเชื่อมต่อกับตัวเกมผ่าน Local Network Socket (GSI) ตัวแอปพลิเคชันจะแยกภาระการประมวลผลออกเป็น 2 ส่วน:

1. **Local Gateway (G-Sensory):** ดักจับข้อมูลดิบ ประมวลผลภาพมินิแมพ และพ่นการแจ้งเตือนเสียงที่มีความหน่วงต่ำเป็นพิเศษ (\<300ms)  
2. **Cloud Brain (Maiden Scribe):** ทำหน้าที่จำลองคาแรคเตอร์การพากย์เสียงสดและเรียบเรียงประวัติความคิด (Narrative Continuity)

### **2.2 หน้าที่หลักของซอฟต์แวร์ (Product Functions)**

แอปพลิเคชันจะประกอบด้วยโมดูลหลักภายใต้ชื่อ **G-Series Architecture** โดยแบ่งเป็นกลุ่มแกนหลัก (Core) 6 โมดูล และกลุ่มส่วนขยายด้านประสบการณ์/ความผูกพัน (Companion Experience) อีก 6 โมดูล:

**กลุ่มแกนหลัก (Core — Dota Intelligence):**

* **G-Sentry:** ตรวจสอบหมอกอัปมงคล (Fog of War) และการหายไปของศัตรูบนแผนที่  
* **G-Motion:** คำนวณความน่าจะเป็นของเส้นทางการเดินแก๊งของศัตรูจากจุดเกิดเหตุ (Heatmap)  
* **G-Signal:** ระบบแจ้งเตือนภัยและขัดจังหวะการสตรีมเสียงแบบทันทีทันใดเมื่อผู้เล่นตกอยู่ในโซนอันตราย  
* **G-Master:** ให้คำแนะนำเชิงกลยุทธ์เกี่ยวกับการปรับปรุงสกิลและการเลือกซื้อไอเทมแก้ทางตามสถานะการเงินจริง  
* **G-Sensory:** ส่วนแสดงผล HUD โปร่งใสและการจัดการประสิทธิภาพการกินทรัพยากรเครื่อง  
* **G-Log:** ระบบเก็บบันทึกสถิติเพื่อพัฒนาโมเดลคาดเดาความเชื่อย้อนหลังแบบปิดวงจร (Feedback Loop)

**กลุ่มส่วนขยายประสบการณ์ (Companion Experience — เพิ่มจากการวิเคราะห์คู่แข่ง Questie AI):**

* **G-Voice:** ระบบสนทนาด้วยเสียงสองทาง (Two-way Voice) ให้ผู้เล่นถาม-ตอบกับ Maiden ได้ ไม่ใช่แค่รับการแจ้งเตือนทางเดียว  
* **G-Memory:** หน่วยความจำผู้เล่นที่คงอยู่ข้ามแมตช์ (Persistent Memory) — จำฮีโร่ถนัด, จุดที่มักตาย, เทรนด์ MMR และนำมาอ้างอิงในบทพูด  
* **G-Coach:** ระบบรีวิวเชิงลึกหลังจบเกม (Post-Match Review) วิเคราะห์การตัดสินใจ, positioning และ timing  
* **G-Mind:** ตัวจัดเส้นทางโมเดลความคิด (Cognitive Router) ให้สลับ/เลือก Cloud LLM ได้ (Gemini เป็นค่าเริ่มต้น)  
* **G-Persona:** ชุดปรับโทนเสียงและความถี่การพูดของ Maiden (เงียบ↔ช่างพูด, จริงจัง↔มีม) โดยคงแบรนด์เดิม  
* **G-Stream:** โหมดผู้ช่วยสำหรับสตรีมเมอร์ (Co-host) พร้อมการปกปิดข้อมูลละเอียดอ่อน

### **2.3 คาแรคเตอร์และการผสานตัวตน (AI Persona Integration: "Maiden")**

หัวใจสำคัญของระบบคือผู้ช่วย AI ชื่อ **"Maiden"** (อิงจากบุคลิกของ Crystal Maiden) โดยมีแนวทางการออกแบบการโต้ตอบดังนี้:

* **อ่อนโยนและฉลาด (Gentle & Intelligent):** พูดจาไพเราะ มีการวิเคราะห์เชิงสถิติที่ดูน่าเชื่อถือสูง  
* **อิงจากคอมมูนิตี้และมีม (Meme-Aware):** มีอารมณ์ขันแบบเสียดสีตัวเองจากการโดนเนิร์ฟความเร็วในการเคลื่อนที่อยู่ตลอดเวลาในประวัติศาสตร์แพตช์เกม ("Nerf CM")  
* **แก้ไขความเชื่อกลางทาง (Belief Revision):** หากประเมินสถานการณ์ผิดพลาด จะอุทานและเปลี่ยนคำแนะนำกลางประโยคทันทีเพื่อความสมจริงเหมือนนักพากย์มนุษย์

## **3\. เจาะลึกข้อกำหนดเฉพาะของระบบ (System Features \- The G-Series)**

### **3.1 G-Sentry (Fog of War Monitor)**

* **คำอธิบาย:** ระบบตรวจจับการหายไปของฮีโร่ตัวอันตรายจากวิสัยทัศน์ในแผนที่  
* **ข้อกำหนดการทำงาน (Functional Requirements):**  
  1. ระบบต้องอ่านข้อมูลจาก GSI ทุก 500ms เพื่อคอยเช็กว่าฮีโร่ฝั่งตรงข้ามที่อยู่ในเลนหายไปจากระยะวิสัยทัศน์ (Vision) หรือไม่  
  2. หากฮีโร่ฝ่ายตรงข้ามตำแหน่งแก๊ง (เช่น Mid, Position 4\) หายไปนานเกิน 5 วินาที ระบบจะเริ่มต้นประเมินความเสี่ยงต่อเลนที่ผู้เล่นกำลังเล่นอยู่  
* **ตรรกะการทำงาน (Logic & Trigger):**  
  ![][image1]  
* **บทสนทนาตัวอย่าง (Maiden Voice):**"ดูเหมือนเลนล่างจะเงียบแปลกๆ นะคะ... พวกเขาหายไปจากสายตาของฉันเกิน 5 วินาทีแล้ว โปรดระมัดระวังด้วยนะคะ"

### **3.2 G-Motion (Strategy & Heatmap Prediction)**

* **คำอธิบาย:** ระบบทำนายและประมวลผลทิศทางที่ศัตรูน่าจะเคลื่อนที่ไปอิงจากข้อมูล Heatmap ประวัติศาสตร์การแข่งขัน  
* **ข้อกำหนดการทำงาน (Functional Requirements):**  
  1. ระบบต้องเก็บบันทึกประวัติตำแหน่งล่าสุดที่มองเห็นของฮีโร่ศัตรูแต่ละตัวย้อนหลัง 5 นาที  
  2. ประมวลผลหาความน่าจะเป็นสูงสุดของเส้นทางที่ศัตรูใช้หลบซ่อนตัว (เช่น เส้นทางแม่น้ำ, ป่าฝั่งเรา, หรือซุ้มรูน)  
* **บทสนทนาตัวอย่าง (Maiden Voice):**"จากแผนภูมิความร้อน... มีโอกาสสูงถึง 78% ที่พวกเขาจะกบดานอยู่บริเวณเนินเขานี้เพื่อซุ่มโจมตีคุณค่ะ"

### **3.3 G-Signal (Real-time Gank Warning with Voice Interrupt)**

* **คำอธิบาย:** ระบบเตือนภัยและส่งสัญญาณเสียงขัดจังหวะทันทีเมื่อมีแนวโน้มการโดนลอบโจมตีสูงเกินขีดจำกัดปลอดภัย  
* **ข้อกำหนดการทำงาน (Functional Requirements):**  
  1. **ความหน่วงต้องต่ำกว่า 300ms:** ทันทีที่ G-Motion และ G-Sentry พบความผิดปกติที่สัญชาตญาณความปลอดภัยเกินจุดวิกฤต (Danger Threshold \> 85%) ระบบต้องขัดจังหวะ (Interrupt) ข้อความคำพูดอื่นๆ ที่ Maiden กำลังพ่นอยู่ทันที  
  2. ส่งสัญญาณเสียงกระซิบตื่นตระหนกเพื่อกระตุ้นให้ผู้เล่นถอย  
* **บทสนทนาตัวอย่าง (Maiden Voice \- การหักมุมและความเชื่อเปลี่ยน):**(พูดอย่างอุ่นใจ) "ฟาร์มต่อสบายๆ เลยค่ะ... *เอ๊ะ\! เดี๋ยวก่อน\!* พวกเขาเพิ่งใช้ Smoke of Deceit แถวแม่น้ำแล้ว\! ถอยออกมาก่อนค่ะเพื่อน\! ระบบเตือนภัยของฉันส่งสัญญาณสีแดงแล้ว\!"

### **3.4 G-Master (Strategic & Financial Advisor)**

* **คำอธิบาย:** ระบบ AI แนะนำแนวทางการอัปสกิลและการขึ้นไอเทมแก้ทางตามแบบจำลองทางการเงินของไอดีคุณ  
* **ข้อกำหนดการทำงาน (Functional Requirements):**  
  1. ตรวจสอบ Net Worth และช่องเก็บไอเทมปัจจุบันเทียบกับ Net Worth และสไตล์การเล่นของฝ่ายตรงข้าม  
  2. ให้คำแนะนำการเลือกซื้อไอเทมที่คุ้มค่าที่สุดในวินาทีนั้นโดยอ้างอิงจากข้อมูลเมต้าแพตช์ปัจจุบัน  
* **บทสนทนาตัวอย่าง (Maiden Voice):**"ศัตรูหลักของคุณกำลังจะจบชิ้น BKB แนะนำให้ออก \[Item Name\] มาดึงเวลาไว้นะคะ... แต่เอ่อ ถ้าเป็นเรื่องเงินล่ะก็... อย่าถามฉันเลยค่ะ ทุกวันนี้ฉันยังต้องแบ่งเงินไปซื้อ Ward จนตัวแห้งอยู่เลย (หัวเราะเบาๆ)"

### **3.5 G-Sensory (Overlay & Hardware Optimization)**

* **คำอธิบาย:** การตั้งค่าหน้าจอแสดงผล Overlay และการจำกัดทรัพยากรการประมวลผลไม่ให้รบกวนเฟรมเรตในเกม  
* **ข้อกำหนดการทำงาน (Functional Requirements):**  
  1. การเรนเดอร์กราฟิกและการสตรีมเสียงต้องไม่ทำให้ FPS ของตัวเกม Dota 2 ลดลงเกิน 3%  
  2. Overlay ของแอปพลิเคชันต้องเป็นกระจกใส (Glassmorphism) ตามโทนสีน้ำแข็งของ Maiden เสมอ และหลีกเลี่ยงการบดบังพื้นที่ UI ที่สำคัญของเกม (เช่น แผนที่ย่อ, แถบสกิล, แผงสถิติ)

### **3.6 G-Log (Feedback Loop Analysis)**

* **คำอธิบาย:** ระบบสรุปผลลัพธ์และเก็บบันทึกประวัติเพื่อจูนความแม่นยำในการทำนายเกมถัดไป  
* **ข้อกำหนดการทำงาน (Functional Requirements):**  
  1. บันทึกจังหวะการตายและชัยชนะของทีมไฟต์เปรียบเทียบกับคำแนะนำที่ Maiden ส่งออกไป  
  2. ทำการวิเคราะห์ว่าความเร็วการตอบสนองและความไวในการแจ้งเตือนแบบใดที่ทำให้ผู้เล่นมีชีวิตรอดได้ยืนยาวที่สุด เพื่อนำข้อมูลมาจูนพารามิเตอร์การทำงานของ G-Sentry และ G-Signal ในเกมหน้า  
* **บทสนทนาตัวอย่าง (Maiden Voice):**"แมตช์นี้เราทำเต็มที่แล้วนะคะ ถึงแม้การทำนายเรื่องการแอบดันป้อมของฉันจะช้าไปสักหน่อย แต่ตาหน้า... ฉันรับรองว่าจะไม่ปล่อยให้ป้อมของเราแตกรวดเร็วแบบนี้อีกแน่นอนค่ะ"

## **3A. ส่วนขยายประสบการณ์ผู้ช่วย (Companion Experience Extensions)**

> **ที่มา:** โมดูลในหมวดนี้สกัดมาจากการวิเคราะห์คู่แข่ง **Questie AI** (เพื่อนเล่นเกม AI ที่ใช้ Vision อ่านหน้าจอ + voice chat รองรับ 50+ เกม) จุดยืนของ G-Maiden คือ **"แคบแต่ลึกใน Dota ผ่าน GSI"** ไม่ใช่ "กว้างทุกเกมผ่าน Vision" ดังนั้นจึงหยิบเฉพาะคุณสมบัติที่สร้างความผูกพันกับผู้ใช้ (voice สองทาง + memory) มาเสริม โดยไม่ทิ้งจุดแข็ง low-latency เฉพาะทาง และต้องไม่ละเมิดข้อกำหนด Privacy-First / งบประมาณ CPU-RAM ในหัวข้อ 5

### **3.7 G-Voice (Two-Way Voice Conversation) — Priority: P0**

* **คำอธิบาย:** ขยายจาก G-Signal ที่แจ้งเตือนทางเดียว ให้กลายเป็นการสนทนาสองทาง ผู้เล่นพูดถาม Maiden ได้โดยไม่ต้องหยุดเล่น  
* **ข้อกำหนดการทำงาน (Functional Requirements):**  
  1. รองรับ Push-to-Talk ผ่าน Global Hotkey (เช่น กด `Alt+M` ค้างเพื่อพูด) เพื่อหลีกเลี่ยงการดักเสียงตลอดเวลาและประหยัดทรัพยากร  
  2. แปลงเสียงเป็นข้อความ (STT) แล้วส่งให้ Cloud Brain ประมวลผลคำตอบโดยอิงบริบท GSI ปัจจุบัน + ข้อมูลจาก G-Memory  
  3. คำตอบเชิงสนทนาทั่วไป (non-critical) ไม่อยู่ในเส้นทาง hard-latency แต่ G-Signal ต้องสามารถ **ขัดจังหวะ (Interrupt)** บทสนทนาของ G-Voice ได้ทันทีเมื่อเกิดเหตุวิกฤต (Danger Threshold > 85%)  
  4. รองรับสองภาษา (ไทย/อังกฤษ) ให้สอดคล้องกับ TTS เดิม  
* **บทสนทนาตัวอย่าง (Maiden Voice):**(ผู้เล่น: "ตอนนี้ควรเล่นยังไงดี?") "ตอนนี้เรานำอยู่ 3 คิลล์ค่ะ ฉันว่าเรากดดันเลนกลางต่อแล้วชวนทีมไปเอา Roshan ดีกว่า... แต่ระวังนะคะ ฝั่งตรงข้าม Position 4 ยังหายไปจากสายตาของฉันอยู่เลย"

### **3.8 G-Memory (Persistent Player Memory) — Priority: P0**

* **คำอธิบาย:** หน่วยความจำที่คงอยู่ข้ามแมตช์และข้าม session ทำให้ Maiden "จำผู้เล่นได้" — เป็น moat หลักของ persona ที่ Questie ใช้สร้างความผูกพัน  
* **ข้อกำหนดการทำงาน (Functional Requirements):**  
  1. จัดเก็บโปรไฟล์ผู้เล่นแบบสะสม: ฮีโร่ที่เล่นบ่อย/ถนัด, จุดบนแผนที่ที่มักตาย, รูปแบบความผิดพลาดซ้ำ, เทรนด์ MMR และสไตล์การเล่น  
  2. ป้อนข้อมูลสรุปนี้เป็น context ให้ G-Voice และ G-Master เพื่ออ้างอิงในบทพูด ("ครั้งก่อนตรงนี้คุณโดนแกง")  
  3. **Privacy-First (บังคับตามหัวข้อ 5.2):** ข้อมูลทั้งหมดเก็บภายในเครื่องเท่านั้น ห้ามอัปโหลดขึ้นคลาวด์เด็ดขาด ต่อยอดจากฐานข้อมูลเดิมของ G-Log  
* **บทสนทนาตัวอย่าง (Maiden Voice):**"จุดนี้อีกแล้วนะคะ... จำได้ไหม สองแมตช์ก่อนคุณก็โดนแกงตรงรูนบนพอดีเลย คราวนี้ขอวอร์ดสักอันก่อนเข้าไปนะคะ"

### **3.9 G-Coach (Post-Match Deep Review) — Priority: P1**

* **คำอธิบาย:** ระบบสรุปและวิเคราะห์เชิงลึกหลังจบเกม จุดที่เราเหนือกว่า Questie (ซึ่งวิเคราะห์เฉพาะ realtime) เพราะเรามี GSI log เต็มแมตช์  
* **ข้อกำหนดการทำงาน (Functional Requirements):**  
  1. ประมวลผล GSI log ทั้งแมตช์เพื่อชี้จังหวะตัดสินใจสำคัญ (key decision points): การตายที่หลีกเลี่ยงได้, timing การซื้อของ, การวางตำแหน่งในทีมไฟต์  
  2. นำเสนอเป็นรายงานสรุปบน Dashboard พร้อมจัดอันดับ 3 จุดที่ควรปรับปรุงมากที่สุด  
  3. งานนี้เป็น non-critical ทำงานหลังเกมจบ จึงไม่กระทบงบ latency/CPU ระหว่างเล่น  
* **บทสนทนาตัวอย่าง (Maiden Voice):**"สรุปแมตช์นี้นะคะ — จุดที่น่าเสียดายที่สุดคือนาทีที่ 24 เราเข้าไฟต์ทั้งที่ยังไม่มี BKB ครบทีม ถ้ารออีก 30 วินาทีผลน่าจะต่างออกไป ลองโฟกัสเรื่อง timing ตรงนี้ในเกมหน้านะคะ"

### **3.10 G-Mind (Cognitive Model Router) — Priority: P1**

* **คำอธิบาย:** ชั้นจัดการ Cloud LLM ที่เปิดให้สลับ/เลือกโมเดลความคิดได้ ป้องกัน vendor lock-in และเป็นจุดขาย  
* **ข้อกำหนดการทำงาน (Functional Requirements):**  
  1. รองรับการตั้งค่าเลือก Cloud LLM (Gemini เป็นค่าเริ่มต้นตามหัวข้อ 4.2; สามารถเพิ่ม Claude หรือโมเดลอื่นได้)  
  2. ต้องคง fallback ไปยัง Local SLM เมื่อขาดการเชื่อมต่อคลาวด์ ตามข้อกำหนด Resilience (หัวข้อ 5.2) โดยไม่ขึ้นกับว่าเลือกโมเดลใด  
  3. การสลับโมเดลต้องไม่กระทบเส้นทาง hard-latency ของ G-Signal (ซึ่งพึ่ง Local SLM เป็นหลัก)  
* **บทสนทนาตัวอย่าง (Maiden Voice):**(ในหน้า Settings) "ตอนนี้ฉันกำลังคิดด้วยสมองกลีบ Gemini อยู่นะคะ ถ้าอยากให้ฉันวิเคราะห์ลึกขึ้นลองสลับไปใช้โมเดลอื่นได้เลยค่ะ"

### **3.11 G-Persona (Tone & Verbosity Presets) — Priority: P2**

* **คำอธิบาย:** ชุดปรับโทนเสียงและความถี่การพูดของ Maiden เพื่อตอบโจทย์ผู้เล่นหลากหลายโดยไม่ทิ้งแบรนด์ (Maiden ยังเป็นตัวตนเดียว ไม่ใช่การสร้างคาแรคเตอร์ใหม่แบบ Questie)  
* **ข้อกำหนดการทำงาน (Functional Requirements):**  
  1. ปรับแกนความถี่การพูด: เงียบ (เฉพาะเหตุวิกฤต) ↔ ช่างพูด (พากย์ต่อเนื่อง)  
  2. ปรับแกนน้ำเสียง: จริงจังเชิงโค้ช ↔ มีม/เป็นกันเอง (คงเอกลักษณ์ "Nerf CM" ไว้เสมอตามกฎ persona)  
  3. การตั้งค่าต้องไม่ลบล้างพฤติกรรมบังคับ เช่น Belief Revision และการ Interrupt ของ G-Signal  
* **บทสนทนาตัวอย่าง (Maiden Voice):**(โหมดเงียบ) "...(เตือนเฉพาะตอนอันตรายเท่านั้น)" / (โหมดช่างพูด) "เลนนี้สนุกจังเลยค่ะ! มาดูกันว่ารอบนี้พวกเขาจะกล้าเข้ามาหาเราไหมนะ~"

### **3.12 G-Stream (Streamer Co-host Mode) — Priority: P2**

* **คำอธิบาย:** โหมดสำหรับสตรีมเมอร์ใช้ Maiden เป็นผู้ช่วยพากย์/co-host เหมือน use case "streaming" ของ Questie  
* **ข้อกำหนดการทำงาน (Functional Requirements):**  
  1. ปรับ Overlay (G-Sensory) และโทน (G-Persona) ให้เหมาะกับการออกอากาศ  
  2. มีสวิตช์ปกปิดข้อมูลละเอียดอ่อน (เช่น สถิติส่วนตัว, MMR) ไม่ให้ปรากฏบนสตรีม  
  3. ต้องเคารพ Privacy-First — ไม่ส่งข้อมูล G-Memory/G-Log ออกนอกเครื่อง  
* **บทสนทนาตัวอย่าง (Maiden Voice):**"สวัสดีทุกคนในห้องค่ะ~ วันนี้เราจะมาดูกันว่าคุณ \[ชื่อผู้เล่น\] จะพา Crystal Maiden ตัวจริงไปได้ไกลแค่ไหน อย่าลืมเป็นกำลังใจให้เรานะคะ!"

## **4\. ความต้องการด้านอินเตอร์เฟสภายนอก (External Interface Requirements)**

### **4.1 อินเตอร์เฟสกับผู้ใช้ (User Interface: UI/UX Specification)**

* หน้าตาควบคุมหลัก (Dashboard) ต้องใช้สีพื้นหลังแบบพรีเมียมมืด (\#08090c) ร่วมกับกรอบสีน้ำแข็งอะลูมิเนียมใส (rgba(18, 20, 28, 0.72))  
* ควบคุมการทำงานของโมดูลทั้งหมดผ่านแผงควบคุมหลักแบบแยกชิ้น (Modular Panels)  
* มีระบบสั่งการด่วนด้วยแป้นพิมพ์ลัด (Global Hotkeys) เช่น กด Alt \+ M เพื่อให้ Maiden สรุปสถานการณ์ ณ วินาทีนั้นทันที

### **4.2 อินเตอร์เฟสทางซอฟต์แวร์ (Software Interface)**

* **Dota 2 GSI Engine:** เชื่อมต่อผ่าน Local HTTP Post ที่พอร์ต 3000 โดยได้รับโครงสร้าง JSON ส่งจากเครื่องผู้ใช้เอง  
* **Cloud Cognitive Engine:** เชื่อมต่อ API ของ Gemini (ผ่านช่องทางส่งข้อความสตรีมมิ่งที่ระบุ)  
  > **สถานะ (2026-07): ยังไม่ได้ wire — เป็น Phase-4 target.** ปัจจุบันยังไม่มี Gemini client;
  > เส้นทาง cloud advice ที่ ship แล้วใช้ **Claude CLI / Anthropic API** + **Ollama SLM (offline)**
  > ผ่าน G-Master backend picker ([`slm.rs`](file:///g:/G-Maiden/src-tauri/src/slm.rs)). requirement นี้คงไว้เป็นเป้าหมาย โดย [[ADR-14-gid-account-identity|ADR-14]]/G-Mind
  > (§3.10) รองรับสลับ LLM ได้ในภายหลัง
* **TTS Module (Text-to-Speech):** เชื่อมโยงโมดูลการถอดเสียงเป็นข้อความพูดที่ตอบสนองความถี่สูง โดยมีสไตล์น้ำเสียงที่ใกล้เคียงกับอารมณ์นักพากย์มากที่สุด  
* **STT Module (Speech-to-Text):** สำหรับ G-Voice — แปลงเสียงพูดของผู้เล่น (Push-to-Talk) เป็นข้อความเพื่อส่งให้ Cloud Brain รองรับทั้งภาษาไทยและอังกฤษ

## **5\. คุณลักษณะความต้องการระบบที่ไม่ใช่ด้านฟังก์ชัน (Non-Functional Requirements)**

### **5.1 ประสิทธิภาพการทำงาน (Performance)**

* **Latency:** เวลาตอบสนองต่อการสแกนและส่งออกผลลัพธ์เสียงทางตรง (End-to-End Latency) ของ G-Signal ต้องเสร็จสิ้นใน **250ms** และห้ามเกิน **300ms** เด็ดขาด  
* **CPU Usage:** โปรแกรมส่วนที่ทำงานเบื้องหลังต้องกินประสิทธิภาพของ CPU บนชิปเซ็ตระดับกลางไม่เกิน **2.5%** \* **Memory Usage:** กินหน่วยความจำชั่วคราว (RAM) สูงสุดไม่เกิน **400MB** ในระหว่างที่มีการประมวลผลโมดูลทั้งหมดค้างอยู่
  > **หมายเหตุ (2026-07):** ปัจจุบันแอปยัง surface **GPU load/temp + VRAM** เพิ่มที่ deck footer
  > ด้วย (ingest ผ่าน `POST /telemetry` ที่ feed จาก `gpu-feeder` sidecar ซึ่งรัน nvidia-smi
  > out-of-process) — เป็นข้อมูลเชิง informational เท่านั้น ไม่ใช่การเปลี่ยน budget ของ NFR ข้างต้น

### **5.2 ความน่าเชื่อถือและการบำรุงรักษา (Reliability & Maintainability)**

* ระบบควรจะคงทนต่อการหลุดออกจากกันของระบบ Network (เมื่อขาดการเชื่อมต่อจากคลาวด์ โมดูลแจ้งเตือนวิกฤตอย่าง G-Sentry และ G-Signal จะต้องหันมาพึ่งพา Local SLM ในเครื่องทำงานต่อได้ทันทีโดยไม่ดับไป)  
* ตัวประมวลผลข้อมูล G-Log จะต้องเก็บรักษาข้อมูลดิบและสถิติการเล่นของผู้เล่นไว้ภายในเครื่องเท่านั้นเพื่อความเป็นส่วนตัวสูงสุด (Privacy-First Policy)

## **6\. แผนผังการตรวจสอบและลงนามรับรอง (Verification & Approval)**

| บทบาทหน้าที่ | ชื่อและตำแหน่ง | ลายมือชื่อ / วันที่อนุมัติ |
| :---- | :---- | :---- |
| **System Architect (ผู้ออกแบบระบบ)** | \[ชื่อของคุณ\] | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |
| **Lead AI Developer (หัวหน้าทีมพัฒนา AI)** | G-Maiden Dev Team | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |
| **Product Sponsor / Investor (ผู้ให้ทุน)** | Stakeholders | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |

[image1]: <data:image/png;base64,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>