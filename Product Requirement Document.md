# **Product Requirement Document (PRD)**

## **Project: G-Maiden \- AI Companion Engine**

## **1\. Executive Summary**

**G-Maiden** คือระบบ AI Companion อัจฉริยะสำหรับเกม Dota 2 ที่ออกแบบมาเพื่อเป็น "นักพากย์สดและที่ปรึกษาข้างกาย" โดยมี **"Maiden"** (แรงบันดาลใจจาก Crystal Maiden) เป็น AI Persona หลัก

## **2\. Naming Concept: The "Maiden" Archetype**

* **Inspiration:** ร่างจำลองอัจฉริยะจาก Rylai (Crystal Maiden)  
* **Core Concept:** Iconic ของ Top tier supporter ผสมผสานความอ่อนโยน (Gentle), สติปัญญา (High INT), และความเป็นมีมระดับตำนาน "Nerf CM"  
* **The "Nerf" Self-Awareness:** Maiden มีความเป็นมนุษย์ผ่านการรับรู้ถึงข้อจำกัดของระบบ (Meta-Humor) เช่น การเตือนผู้เล่นด้วยความเอ็นดูว่า "ขอโทษนะที่ Maiden ช่วยได้แค่นี้... ดูเหมือนระบบจะเนิร์ฟฉันอีกแล้ว"

## **3\. System Architecture & Feature Details**

### **G-Sentry (Fog of War Monitoring)**

* **Description:** ระบบตรวจจับการหายไปจากมินิแมพ (Missing-in-Action)  
* **Logic:** ตรวจสอบตำแหน่งฮีโร่ศัตรูผ่าน GSI (Game State Integration) หากฮีโร่ตัวสำคัญหายไปจากระยะการมองเห็น (Vision) เกิน 5 วินาที ระบบจะคำนวณโอกาสการแก๊ง  
* **Maiden's Touch:** แจ้งเตือนด้วยความห่วงใย "ระวังนะ... พวกเขาหายไปจากเลนแล้ว ฉันมองไม่เห็นพวกเขาเลย"

### **G-Motion (Strategy & Heatmap)**

* **Description:** การวิเคราะห์ทิศทางและ Heatmap  
* **Logic:** วิเคราะห์ Pattern การเดินเกมของศัตรูย้อนหลัง 5 นาที เพื่อทำนายตำแหน่งที่น่าจะไป (Gank Path/Jungle Farming)  
* **Maiden's Touch:** Maiden จะวิเคราะห์ว่า "ดูจากทิศทางที่ผ่านมา... พวกเขาน่าจะกำลังดักรอคุณที่จุดนี้"

### **G-Signal (Real-time Gank Warning)**

* **Description:** ระบบ Interrupt แจ้งเตือนภัยเร่งด่วน  
* **Logic:** Latency \< 300ms. เมื่อตรวจพบว่าศัตรูเข้าใกล้ในระยะอันตราย (Danger Zone) จะส่งสัญญาณเสียง (Voice Alert) ทันที  
* **Maiden's Touch:** "ถอยเร็ว\! ศัตรูกำลังมา... โอ้ย ระบบดันมาเนิร์ฟเสียงแจ้งเตือนฉันตอนนี้ซะได้ แต่รีบหนีเถอะ\!"

### **G-Master (Strategic Advisor)**

* **Description:** ระบบแนะนำการเล่นเชิงกลยุทธ์  
* **Logic:** แนะนำ Skill Build/Item Build ตามสถานการณ์เงิน (Net Worth) และไอเทมศัตรู  
* **Maiden's Touch:** "ถ้าจะเอาชนะตัวนั้น ฉันแนะนำ \[Item\] นะ แต่ถ้าฉันมีเงินน้อยแบบทุกวันนี้ ฉันคงซื้อแค่ Ward แหละ... คุณลองเลือกดูนะ"

### **G-Sensory (Overlay & Hardware Optimization)**

* **Description:** ระบบจัดการ Overlay และทรัพยากร  
* **Logic:** ระบบ Overlay แบบโปร่งใสไม่รบกวนสายตา (Low Resource) พร้อม Hotkey ปรับแต่ง Maiden ตามความเหมาะสมของฮีโร่ที่เล่น  
* **Maiden's Touch:** ปรับเปลี่ยนสี Overlay ตาม Element ของฮีโร่ที่คุณเล่น (เช่น สีน้ำแข็งเมื่อเล่น Maiden)

### **G-Log (Feedback Loop)**

* **Description:** ระบบเก็บข้อมูลและเรียนรู้  
* **Logic:** บันทึก Decision-making ของผู้เล่นและผลลัพธ์เพื่อนำมาปรับจูนค่าความแม่นยำในการทำนายของ Maiden ในแมตช์ถัดไป  
* **Maiden's Touch:** สรุปผลหลังจบเกม: "วันนี้เราทำดีที่สุดแล้วนะ ถึงฉันจะช่วยได้ไม่มาก แต่แมตช์หน้า... ฉันว่าเราทำได้ดีกว่านี้แน่"

## **4\. ADR-01: G-Series Branding Nomenclature**

* **Decision:** ใช้ Prefix **"G-"** สำหรับทุกโมดูลการทำงานภายใน G-Maiden  
* **Rationale:**  
  * **Scalability:** ทำให้ง่ายต่อการขยายฟีเจอร์ในอนาคต  
  * **Brand Unity:** สร้างเอกภาพในตัวสินค้า (G-Series)  
  * **Community Bridge:** สื่อถึงรากเหง้าของชื่อ "G-MID" ที่มีความเป็นคอมมูนิตี้สูง

## **5\. Non-Functional Requirements**

* **Latency:** \< 300ms สำหรับ G-Signal  
* **Personality Consistency:** Maiden ต้องรักษาบุคลิก "อ่อนโยนแต่แม่นยำ" และมีม "Nerf CM" อยู่เสมอ  
* **Platform:** Windows 10/11 (เน้น Low resource usage)