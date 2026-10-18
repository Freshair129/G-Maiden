---
title: "G-Maiden Software Requirements Specification"
doc_id: "software-requirements-specification"
status: "active"
version: "0.4.1"
updated: "2026-10-18"
owner: "Boss"
source_of_truth: true
related_docs: ["product-requirements", "mvp-decisions", "roadmap", "G-SERIES-DATA-LINEAGE"]
---

# **Software Requirements Specification (SRS)**

## **Project: G-Maiden \- AI Companion & Narrative Engine**

## **1\. บทนำ (Introduction)**

### **1.1 วัตถุประสงค์ (Purpose)**

เอกสารข้อกำหนดความต้องการทางซอฟต์แวร์ (SRS) ฉบับนี้จัดทำขึ้นเพื่อระบุข้อกำหนดทั้งด้านฟังก์ชันการทำงาน (Functional Requirements) และไม่ใช่ฟังก์ชันการทำงาน (Non-Functional Requirements) สำหรับระบบ **G-Maiden** ซึ่งเป็นระบบ AI Companion และ Co-pilot อัจฉริยะแบบเรียลไทม์สำหรับผู้เล่นเกม Dota 2

### **1.2 ขอบเขตของระบบ (Product Scope)**

G-Maiden เป็น Companion สำหรับ Dota 2 ที่รวมการเตือนภัย, overlay/audio, คำแนะนำด้วยตนเอง และ Companion แบบ P0 (G-Voice + G-Memory) ในเครื่อง. GSI, CV และ G-Signal critical path ประมวลผลในเครื่อง; G-Signal ไม่พึ่ง cloud หรือ SLM. Cloud ใช้ได้เฉพาะคำแนะนำ non-critical เมื่อผู้เล่นเปิด opt-in แยกและส่งเฉพาะ context ใน allowlist. มติขอบเขตและ privacy ของ MVP อยู่ใน [[mvp-decisions]]; เมื่อข้อความเก่าขัดกัน ให้ใช้มตินั้นสำหรับ MVP.

**Matrix เป้าหมายตรวจรับ MVP:** Windows x64 build 19045 และ 26100; Dota 2 live 5v5 All Pick Ranked/Unranked; CV ที่ 1920×1080, 16:9, จอหลักหนึ่งจอ, DPI 100%, default HUD/minimap ล่างซ้าย, borderless-fullscreen. ยังไม่ใช่ผล compatibility test. Turbo/custom/spectator/replay และ geometry อื่นไม่รองรับข้อสรุปที่ขึ้นกับ mode/layout จนมี calibration และ evidence. หาก mode/layout/source ไม่รู้หรือไม่มี coverage ให้รายงาน `UNKNOWN`/unavailable; GSI-only Lite mode ยังให้ local core ทำงานแต่ไม่มี CV.

**Access target:** local core เริ่มได้โดยไม่ต้องมี account/session/entitlement/network (`account_gate_required=false`); Google เป็น primary sign-in เดียวสำหรับ account actions, GID/Steam ไม่ใช่ credential หรือ recovery. Account surface ยังคงเปิดอยู่ จึงยังต้องคุ้มครอง action ฝั่ง server. Current source now removes the former CR-022 desktop gate and keeps the updater on the signed stable channel; cold/offline/revoke behavior still needs release-mode native acceptance before this is called verified. Closed Beta ถูกยกเลิก; ไม่มีการเพิ่ม Beta Terms receipt หรือ Beta entitlement gate จาก requirement นี้.

### **1.3 คำนิยามและคำย่อ (Definitions & Acronyms)**

* **GSI (Game State Integration):** ระบบส่งข้อมูลสถานะภายในเกมของ Valve (ผู้พัฒนา Dota 2\)
* **SLM (Small Language Model):** โมเดลภาษาขนาดเล็กที่สามารถรันในเครื่องของผู้เล่นได้โดยตรงเพื่อความเร็วสูง
* **LLM (Large Language Model):** โมเดลภาษาขนาดใหญ่บนคลาวด์; การส่ง game context ต้องปิดเป็นค่าเริ่มต้นและใช้ allowlist/opt-in แยกตาม [[mvp-decisions]]
* **Belief Revision (การปรับปรุงความเชื่อ):** ความสามารถของ AI ในการเปลี่ยนทิศทางคำพูดหรือการคาดเดากลางคันเมื่อได้รับข้อมูลใหม่ที่ขัดแย้งกับสิ่งเดิมที่เคยเชื่อ
* **Overlay:** หน้าต่างแสดงผลแบบโปร่งแสงที่แสดงทับซ้อนอยู่บนหน้าจอเกม

## **2\. คำอธิบายโดยรวม (Overall Description)**

### **2.1 ภาพรวมของผลิตภัณฑ์ (Product Perspective)**

G-Maiden เป็นแอป desktop แบบ local-first ที่เชื่อมกับ Dota 2 ผ่าน local GSI. Cloud เป็น optional, non-critical route สำหรับคำแนะนำบางชนิดและทำงานได้เฉพาะเมื่อมี opt-in สำหรับ game context; การไม่มี cloud/network ต้องไม่หยุด local core:

1. **Local Gateway:** รับ GSI, ประมวลผล CV/G-Motion/G-Signal และออกเสียงเตือน; G-Signal เป็น pure Rust path ที่ไม่มี cloud, SLM หรือ WebView dependency.
2. **Local Companion:** G-Voice ทำ PTT → local STT → local interpretation/answer → TTS; G-Memory อ่าน/เก็บ aggregate ในเครื่อง. Audio, transcript/free-form utterance, G-Memory และ raw G-Log/CV ไม่ออก cloud.
3. **Optional cloud advice:** G-Master สามารถเรียก backend ที่เลือกสำหรับ manual advice ได้เมื่อ cloud-context opt-in เปิด; สร้าง payload จาก purpose-built allowlist เท่านั้น. การ sign-in, เลือก provider/API key หรือกด Ask ไม่ใช่ consent.

### **2.2 หน้าที่หลักของซอฟต์แวร์ (Product Functions)**

แอปพลิเคชันประกอบด้วยโมดูลตามภาพผลิตภัณฑ์ G-Series. สำหรับ MVP ให้ถือ GSI/CV/G-Signal, overlay/audio, manual advice, local history, summary และ G-Voice/G-Memory เป็นขอบเขตที่ต้องส่งมอบตาม [[mvp-decisions]]. G-Coach แบบ deep review, G-Mind provider switching, G-Persona, G-Stream, Store/payment และความสามารถ public campaign อยู่นอกขอบเขตที่เลือกไว้; รายการโมดูลที่เหลือเป็น roadmap/product vision ไม่ใช่เกณฑ์ผ่าน MVP.

**กลุ่มแกนหลัก (Core — Dota Intelligence):**

* **G-Sentry:** ตรวจสอบหมอกอัปมงคล (Fog of War) และการหายไปของศัตรูบนแผนที่
* **G-Motion:** ประเมินความเสี่ยงจากเวลาที่ศัตรูหายและ heuristic ทิศก่อนหาย; ไม่มี heatmap หรือ learned path model ใน MVP
* **G-Signal:** ระบบแจ้งเตือนภัยและขัดจังหวะการสตรีมเสียงแบบทันทีทันใดเมื่อผู้เล่นตกอยู่ในโซนอันตราย
* **G-Master:** ให้คำแนะนำเชิงกลยุทธ์เกี่ยวกับการปรับปรุงสกิลและการเลือกซื้อไอเทมแก้ทางตามสถานะการเงินจริง
* **G-Sensory:** ส่วนแสดงผล HUD โปร่งใสและการจัดการประสิทธิภาพการกินทรัพยากรเครื่อง
* **G-Log:** ระบบเก็บบันทึกสถิติเพื่อพัฒนาโมเดลคาดเดาความเชื่อย้อนหลังแบบปิดวงจร (Feedback Loop)

**กลุ่มส่วนขยายประสบการณ์ (Companion Experience — เพิ่มจากการวิเคราะห์คู่แข่ง Questie AI):**

* **G-Voice (P0):** สนทนาด้วยเสียงสองทางผ่าน local PTT/STT/interpretation/answer; G-Signal preempts; ไม่ส่งเสียง/transcript หรือคำถามอิสระขึ้น cloud.
* **G-Memory (P0):** persistent local aggregates ที่มี source; ข้อมูลที่ไม่มีหลักฐานคงเป็น unknown และไม่ส่ง cloud. Summary ไม่เกิน 3 จุดต่อ complete session พร้อม event/timestamp; partial session ไม่เดา W/L หรือ death cause.
* **G-Coach (P1):** deep post-match review อยู่นอก MVP; local summary ที่จำกัดข้างต้นยังอยู่ใน MVP.
* **G-Mind (P1):** provider-router และการสลับผู้ให้บริการอยู่นอก MVP; Gemini เป็น design target เดิมเท่านั้น.
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
  1. ประเมินข้อมูลเมื่อมี GSI/CV observation ใหม่; 500ms ใช้เป็น watchdog/freshness cadence เท่านั้น ไม่รับประกัน sampling และไม่ใช่เหตุผลให้เริ่มวัด latency หลัง acquisition. valid GSI source age ต้องไม่เกิน 2.0 วินาทีสำหรับข้อสรุปที่อาศัยข้อมูลนั้น.
  2. หากฮีโร่ฝ่ายตรงข้ามตำแหน่งแก๊ง (เช่น Mid, Position 4\) หายไปนานเกิน 5 วินาที ระบบจะเริ่มต้นประเมินความเสี่ยงต่อเลนที่ผู้เล่นกำลังเล่นอยู่
* **ตรรกะการทำงาน (Logic & Trigger):**
  ![][image1]
* **บทสนทนาตัวอย่าง (Maiden Voice):**"ดูเหมือนเลนล่างจะเงียบแปลกๆ นะคะ... พวกเขาหายไปจากสายตาของฉันเกิน 5 วินาทีแล้ว โปรดระมัดระวังด้วยนะคะ"

### **3.2 G-Motion (Time-off-map Risk Heuristic)**

* **คำอธิบาย:** ระบบประเมินความเสี่ยงจากเวลาที่ฮีโร่หายและทิศก่อนหายด้วย local heuristic; ไม่มี heatmap, lane model หรือการทำนายเส้นทางผ่าน fog ในขอบเขต MVP.
* **ข้อกำหนดการทำงาน (Functional Requirements):**
  1. ระบบต้องเก็บบันทึกประวัติตำแหน่งล่าสุดที่มองเห็นของฮีโร่ศัตรูแต่ละตัวย้อนหลัง 5 นาที
  2. ประเมิน risk จากเวลาที่หาย, observation ที่ใช้ได้ และ heuristic ทิศก่อนหาย; ห้ามสร้าง lane/path หรือจุดซุ่มที่ไม่มีหลักฐาน.
* **บทสนทนาตัวอย่าง (Maiden Voice):**"อีกฝั่งหายจากสายตาไปสักพักแล้วค่ะ ฉันยังไม่เห็นเส้นทางของพวกเขา ระวังตัวไว้ก่อนนะคะ"

### **3.3 G-Signal (Real-time Gank Warning with Voice Interrupt)**

* **คำอธิบาย:** ระบบเตือนภัยและส่งสัญญาณเสียงขัดจังหวะทันทีเมื่อมีแนวโน้มการโดนลอบโจมตีสูงเกินขีดจำกัดปลอดภัย
* **ข้อกำหนดการทำงาน (Functional Requirements):**
  1. **Latency:** p50 ≤250ms และทุก measured sample ≤300ms จาก GSI POST arrival หรือเวลาที่ critical capture acquisition cycle ถึงกำหนดก่อน scheduler/acquisition/inference wait จนถึง first audible sample. ใช้ event-driven evaluation; 500ms เป็น watchdog/freshness cadence เท่านั้น. G-Signal เป็น local pure Rust path โดยไม่มี cloud/SLM/WebView dependency.
  2. ส่งสัญญาณเสียงกระซิบตื่นตระหนกเพื่อกระตุ้นให้ผู้เล่นถอย
* **บทสนทนาตัวอย่าง (Maiden Voice \- การหักมุมและความเชื่อเปลี่ยน):**(พูดอย่างอุ่นใจ) "ฟาร์มต่อสบายๆ เลยค่ะ... *เอ๊ะ\! เดี๋ยวก่อน\!* พวกเขาเพิ่งใช้ Smoke of Deceit แถวแม่น้ำแล้ว\! ถอยออกมาก่อนค่ะเพื่อน\! ระบบเตือนภัยของฉันส่งสัญญาณสีแดงแล้ว\!"

### **3.4 G-Master (Strategic & Financial Advisor)**

* **คำอธิบาย:** ระบบ AI แนะนำแนวทางการอัปสกิลและการขึ้นไอเทมแก้ทางตามแบบจำลองทางการเงินของไอดีคุณ
* **ข้อกำหนดการทำงาน (Functional Requirements):**
  1. ใช้ own-player fields ที่มี source/freshness และข้อมูล matchup แบบ static. ห้ามอ้าง enemy Net Worth/items หรือ live build หากไม่มี source ที่ผ่านการยืนยัน; แสดง unknown/unavailable แทนการอนุมาน.
  2. ให้คำแนะนำการเลือกซื้อไอเทมที่คุ้มค่าที่สุดในวินาทีนั้นโดยอ้างอิงจากข้อมูลเมต้าแพตช์ปัจจุบัน
  3. คำแนะนำ local ใช้ได้เฉพาะ source ที่มีหลักฐาน; GSI ของผู้เล่นไม่เปิดเผย KDA/items/positions ของฮีโร่อีก 9 คน. Cloud game context ปิดโดยค่าเริ่มต้นและต้อง opt-in แยก; payload ใช้เฉพาะ field ใน allowlist ของ [[mvp-decisions]].
* **บทสนทนาตัวอย่าง (Maiden Voice):**"ฉันยังยืนยันไอเทมปัจจุบันของศัตรูไม่ได้ค่ะ จึงไม่อยากเดา build ให้คุณ; ถ้าต้องการ ฉันช่วยเทียบ matchup จากข้อมูล patch ที่มี source ได้นะคะ"

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
  1. ใช้ Push-to-Talk ค่าเริ่มต้น `Ctrl+Alt+V`; ตรวจ collision กับ global shortcuts และเปิดให้ remap ได้. `Alt+M` เป็น mute toggle และคงความหมายเดิม. ไม่มี always-on microphone.
  2. ทำ STT, transcript, free-form utterance, GSI context และ bounded G-Memory context ในเครื่องด้วย local interpretation/answer. ห้ามส่ง audio, transcript, question หรือ G-Memory ขึ้น cloud; ห้าม cloud fallback สำหรับ Voice.
  3. G-Signal ต้อง **ขัดจังหวะ (Interrupt)** turn เสียงของ G-Voice ได้ทันทีเมื่อเกิดเหตุวิกฤต โดยไม่ขึ้นกับ backend หรือสถานะ network.
  4. รองรับไทย/อังกฤษ: WER ภาษาอังกฤษ ≤15%, CER ภาษาไทย ≤20%, intent/critical-slot accuracy ≥90%; วัดด้วย held-out ≥100 utterances ต่อภาษา แยก speaker/session และ quiet/game-audio. ใน ready/warm state PTT release ถึง first audible answer ≤2.0 วินาทีทุก accepted turn และ completion ≥95% ต่อภาษา; cold preparation ≤10 วินาทีพร้อม preparing state ชัดเจน.
* **บทสนทนาตัวอย่าง (Maiden Voice):**(ผู้เล่น: "ตอนนี้ควรเล่นยังไงดี?") "ตอนนี้เรานำอยู่ 3 คิลล์ค่ะ ฉันว่าเรากดดันเลนกลางต่อแล้วชวนทีมไปเอา Roshan ดีกว่า... แต่ระวังนะคะ ฝั่งตรงข้าม Position 4 ยังหายไปจากสายตาของฉันอยู่เลย"

### **3.8 G-Memory (Persistent Player Memory) — Priority: P0**

* **คำอธิบาย:** หน่วยความจำที่คงอยู่ข้ามแมตช์และข้าม session ทำให้ Maiden "จำผู้เล่นได้" — เป็น moat หลักของ persona ที่ Questie ใช้สร้างความผูกพัน
* **ข้อกำหนดการทำงาน (Functional Requirements):**
  1. จัดเก็บเฉพาะ aggregate จาก local source ที่มีหลักฐาน; field ที่ไม่มี source ชัดเจนต้องเป็น `UNKNOWN` ไม่อนุมาน death location/cause หรือ MMR.
  2. ให้ G-Voice/G-Master ใช้ Memory ได้ใน local path เท่านั้น; ห้ามใส่ raw หรือ aggregate G-Memory ใน cloud prompt. Cloud opt-in ไม่ครอบคลุม Memory.
  3. local session summary มีไม่เกิน 3 จุดต่อ complete session พร้อม event/timestamp; partial session ไม่เดา win/loss หรือ death cause.
  4. **Privacy-First:** Memory และแหล่ง G-Log เก็บในเครื่อง; การ clear ต้องยังคงผลหลัง restart และไม่ลบ archived G-Log โดยเงียบ.
* **บทสนทนาตัวอย่าง (Maiden Voice):**"จากบันทึกที่ยืนยันได้ ฉันเห็นว่าคุณเลือกเล่น Invoker หลายแมตช์นะคะ แต่สถิติผลชนะยังไม่มีข้อมูลที่ยืนยันได้ค่ะ"

### **3.9 G-Coach (Post-Match Deep Review) — Priority: P1; outside MVP**

* **คำอธิบาย:** ระบบสรุปและวิเคราะห์เชิงลึกหลังจบเกม จุดที่เราเหนือกว่า Questie (ซึ่งวิเคราะห์เฉพาะ realtime) เพราะเรามี GSI log เต็มแมตช์
* **ข้อกำหนดการทำงาน (Functional Requirements):**
  1. งานนี้อยู่นอกขอบเขต MVP. MVP อนุญาตเฉพาะ local session summary ไม่เกิน 3 จุดต่อ complete session พร้อม event/timestamp ตาม [[mvp-decisions]]; ห้ามตีความ partial session เป็นผลแพ้ชนะหรือสาเหตุการตาย.
  2. นำเสนอเป็นรายงานสรุปบน Dashboard พร้อมจัดอันดับ 3 จุดที่ควรปรับปรุงมากที่สุด
  3. งานนี้เป็น non-critical ทำงานหลังเกมจบ จึงไม่กระทบงบ latency/CPU ระหว่างเล่น
* **บทสนทนาตัวอย่าง (Maiden Voice):**"สรุปแมตช์นี้นะคะ — จุดที่น่าเสียดายที่สุดคือนาทีที่ 24 เราเข้าไฟต์ทั้งที่ยังไม่มี BKB ครบทีม ถ้ารออีก 30 วินาทีผลน่าจะต่างออกไป ลองโฟกัสเรื่อง timing ตรงนี้ในเกมหน้านะคะ"

### **3.10 G-Mind (Cognitive Model Router) — Priority: P1; outside MVP**

* **คำอธิบาย:** แนวคิดชั้นจัดการ Cloud LLM หลาย provider; provider switching ไม่อยู่ใน MVP. Cloud context สำหรับ manual advice ปิดโดยค่าเริ่มต้นและต้องใช้ allowlist ตาม [[mvp-decisions]].
* **ข้อกำหนดการทำงาน (Functional Requirements):**
  1. Gemini เป็น design target เดิม; implementation ปัจจุบันใช้ Claude CLI/Anthropic API และ Ollama สำหรับ G-Master ตาม backend setting.
  2. Offline fallback ของ non-critical advice ใช้ local backend หรือ unavailable state. G-Voice เป็น local-only route; G-Signal ไม่ใช้ model ใดเลย.
  3. การเลือก provider ต้องไม่ข้าม opt-in หรือ cloud allowlist.
* **บทสนทนาตัวอย่าง (Maiden Voice):** รายงานชื่อ backend เฉพาะเมื่อยืนยันจาก runtime; provider switching เป็นงานหลัง MVP.

### **3.11 G-Persona (Tone & Verbosity Presets) — Priority: P2; outside MVP**

* **คำอธิบาย:** ชุดปรับโทนเสียงและความถี่การพูดของ Maiden เพื่อตอบโจทย์ผู้เล่นหลากหลายโดยไม่ทิ้งแบรนด์ (Maiden ยังเป็นตัวตนเดียว ไม่ใช่การสร้างคาแรคเตอร์ใหม่แบบ Questie)
* **ข้อกำหนดการทำงาน (Functional Requirements):**
  1. ปรับแกนความถี่การพูด: เงียบ (เฉพาะเหตุวิกฤต) ↔ ช่างพูด (พากย์ต่อเนื่อง)
  2. ปรับแกนน้ำเสียง: จริงจังเชิงโค้ช ↔ มีม/เป็นกันเอง (คงเอกลักษณ์ "Nerf CM" ไว้เสมอตามกฎ persona)
  3. การตั้งค่าต้องไม่ลบล้างพฤติกรรมบังคับ เช่น Belief Revision และการ Interrupt ของ G-Signal
* **บทสนทนาตัวอย่าง (Maiden Voice):**(โหมดเงียบ) "...(เตือนเฉพาะตอนอันตรายเท่านั้น)" / (โหมดช่างพูด) "เลนนี้สนุกจังเลยค่ะ! มาดูกันว่ารอบนี้พวกเขาจะกล้าเข้ามาหาเราไหมนะ~"

### **3.12 G-Stream (Streamer Co-host Mode) — Priority: P2; outside MVP**

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
* `Alt+M` เป็น mute toggle. G-Voice ใช้ `Ctrl+Alt+V` เป็น PTT ค่าเริ่มต้นของ MVP พร้อมตรวจ collision และ remap ได้; ไม่มี always-on microphone.

### **4.2 อินเตอร์เฟสทางซอฟต์แวร์ (Software Interface)**

* **Dota 2 GSI Engine:** เชื่อมต่อผ่าน Local HTTP Post ที่พอร์ต 3000 โดยได้รับโครงสร้าง JSON ส่งจากเครื่องผู้ใช้เอง
* **Optional Cloud Cognitive Engine:** runtime ปัจจุบันของ G-Master ใช้ Claude CLI/Anthropic API และ Ollama ผ่าน backend picker; Gemini เป็น design target เดิมและยังไม่ wire. Cloud game context ปิดโดยค่าเริ่มต้น. เป้าหมายเมื่อ opt-in คือ purpose-built allowlist ของ own stats ตาม [[mvp-decisions]]; ห้ามส่ง raw GSI/GameTick, match ID, enemy/CV fields, G-Memory, G-Log, audio/transcript หรือข้อมูลบัญชี. Current provider wiring ยังรอ MVP-027/MVP-050 enforcement และ evidence; ห้ามอธิบาย target ว่าถูกบังคับใช้แล้ว.
* **TTS Module (Text-to-Speech):** เชื่อมโยงโมดูลการถอดเสียงเป็นข้อความพูดที่ตอบสนองความถี่สูง โดยมีสไตล์น้ำเสียงที่ใกล้เคียงกับอารมณ์นักพากย์มากที่สุด
* **STT Module (Speech-to-Text):** สำหรับ G-Voice — แปลงเสียง Push-to-Talk ในเครื่อง รองรับไทย/อังกฤษ. Voice transcript และ free-form question ใช้เฉพาะ local interpretation/answer; ไม่มี cloud STT หรือ cloud fallback.

## **5\. คุณลักษณะความต้องการระบบที่ไม่ใช่ด้านฟังก์ชัน (Non-Functional Requirements)**

### **5.1 ประสิทธิภาพการทำงาน (Performance)**

* **G-Signal latency:** p50 ≤250ms และทุก measured sample ≤300ms; วัด T3−T0 ตั้งแต่ GSI POST arrival หรือเวลาที่ capture acquisition cycle ถึงกำหนดก่อน scheduler/acquisition/inference wait จนถึง loopback first audible sample. T1 คือ Rust decision และ T2 คือ audio admission. รายงาน source-observation age แยก; ห้ามย้าย T0 หลัง frame-ready. เก็บ ≥300 samples/scenario/profile พร้อม live audible probe.
* **CPU:** whole-app process group, normalized by logical CPU capacity, ทุก sample 1 วินาที ≤10% (MVP decision v0.2.0). หากสร้าง/configure/assign Windows Job Object ไม่สำเร็จ implementation ต้องบันทึกข้อผิดพลาดและออกด้วย exit code 1 ก่อนสร้าง Tauri/WebView หรือ sidecar; ห้ามเปิดแอปโดยไม่มี hard-cap guarantee. หาก runtime accounting query ล้มเหลวหลัง setup สำเร็จ ให้แสดง CPU sample unavailable (`—`) และคง capture throttle ขณะที่ OS hard cap ยังทำงาน. **RAM:** aggregate peak Working Set ≤400,000,000 bytes รวม host/WebView2/feeder/STT/SLM และ external model processes. **FPS:** drop ≤3% ในแต่ละ paired overlay-off/on run (อย่างน้อย 3 คู่ ×60 วินาที) บนอุปกรณ์/ช่วงเกม/setting เดียวกัน.
  > **หมายเหตุ (2026-07):** ปัจจุบันแอปยัง surface **GPU load/temp + VRAM** เพิ่มที่ deck footer
  > ด้วย (ingest ผ่าน `POST /telemetry` ที่ feed จาก `gpu-feeder` sidecar ซึ่งรัน nvidia-smi
  > out-of-process) — เป็นข้อมูลเชิง informational เท่านั้น ไม่ใช่การเปลี่ยน budget ของ NFR ข้างต้น

### **5.2 ความน่าเชื่อถือและการบำรุงรักษา (Reliability & Maintainability)**

* เมื่อ cloud/network ขาด G-Sentry/G-Motion/G-Signal และ local Voice/Memory ต้องไม่พึ่ง cloud; G-Signal ใช้ pure Rust rule path และไม่พึ่ง SLM. G-Master ใช้ local backend หรือรายงาน unavailable ตามสถานะจริง.
* G-Log, G-Memory, CV detections, microphone audio, transcript และ free-form utterance อยู่ในเครื่อง. Cloud context สำหรับ manual advice ปิดโดย default และส่งได้เฉพาะ own-stat allowlist ภายใต้ separate opt-in; รายละเอียด allowlist/consent/cache invalidation อยู่ใน [[mvp-decisions]].

## **6\. แผนผังการตรวจสอบและลงนามรับรอง (Verification & Approval)**

| บทบาทหน้าที่ | ชื่อและตำแหน่ง | ลายมือชื่อ / วันที่อนุมัติ |
| :---- | :---- | :---- |
| **System Architect (ผู้ออกแบบระบบ)** | \[ชื่อของคุณ\] | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |
| **Lead AI Developer (หัวหน้าทีมพัฒนา AI)** | G-Maiden Dev Team | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |
| **Product Sponsor / Investor (ผู้ให้ทุน)** | Stakeholders | \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_ |

[image1]: <data:image/png;base64,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>

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.4.1 | 2026-10-18 | Aligned current implementation status with the cancelled Closed Beta and recorded remaining release-mode access acceptance. |
| 0.2.0 | 2026-10-10 | Accepted the MVP quality matrix and live-evidence requirements. |
| 0.3.0 | 2026-10-12 | Updated the whole-app CPU budget to 10% per one-second sample per MVP decision v0.2.0. |
| 0.3.1 | 2026-10-12 | Clarified unavailable CPU telemetry when setup/query fails; no cap guarantee when setup fails and the payload does not distinguish the cause. |
| 0.4.0 | 2026-10-13 | Set fail-closed startup when the CPU Job Object cannot initialize; retained unavailable telemetry only for runtime query failures after successful setup. |
