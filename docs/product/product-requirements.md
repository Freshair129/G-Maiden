---
title: "G-Maiden Product Requirements"
doc_id: "product-requirements"
status: "active"
version: "0.4.0"
updated: "2026-11-01"
owner: "Boss"
source_of_truth: true
related_docs: ["software-requirements-specification", "mvp-decisions", "roadmap", "FEAT-G-PARTY", "CR-037-party-gsi-own-stat-sharing", "FEAT-G-FRIENDS", "ADR-20", "CR-038-party-friends-presence-invitations"]
---

# **Product Requirement Document (PRD)**

## **Project: G-Maiden \- AI Companion Engine**

## **1\. Executive Summary**

**G-Maiden** คือระบบ AI Companion อัจฉริยะสำหรับเกม Dota 2 ที่ออกแบบมาเพื่อเป็น "นักพากย์สดและที่ปรึกษาข้างกาย" โดยมี **"Maiden"** (แรงบันดาลใจจาก Crystal Maiden) เป็น AI Persona หลัก

## **1A. MVP Contract and Supported Matrix**

ขอบเขตที่ต้องส่งมอบและตรวจรับใน MVP อ้างอิง [[mvp-decisions]] ซึ่งเป็นมติผลิตภัณฑ์/วิศวกรรมที่ Owner มอบหมายให้เลือกไว้ เอกสารนี้ยังแสดงภาพผลิตภัณฑ์ระยะยาว; รายการ P1/P2 และแนวคิดที่เกินขอบเขตด้านล่างไม่ทำให้ถือว่าเป็น MVP โดยอัตโนมัติ.

* **Companion MVP:** คง G-Voice และ G-Memory เป็น P0 พร้อม GSI/CV/G-Signal, overlay/audio, manual advice, local history และ summary ในเครื่องไม่เกิน 3 จุดต่อ complete session โดยมี event/timestamp; session ที่ไม่ complete ต้องแสดง unknown และไม่เดา win/loss หรือสาเหตุการตาย. Voice และ Memory ยังเป็นงานที่ต้องทำ/ตรวจรับ ไม่ใช่ข้ออ้างว่าฟังก์ชันเสร็จแล้ว.
* **ระบบปฏิบัติการเป้าหมายตรวจรับ:** Windows x64 build 19045 และ build 26100. นี่คือ matrix เป้าหมาย ไม่ใช่หลักฐาน compatibility ที่ผ่านแล้ว; รุ่น/สภาพแวดล้อมอื่นต้องมีหลักฐานก่อนประกาศรองรับ.
* **โหมดเกมเริ่มต้น:** Dota 2 แบบ live 5v5 All Pick ทั้ง Ranked และ Unranked. Turbo, custom game, spectator และ replay ไม่รองรับข้อสรุปที่ขึ้นกับโหมด; ถ้าไม่ทราบโหมดให้ระบุ unknown.
* **CV layout เริ่มต้น:** 1920×1080, 16:9, จอหลักหนึ่งจอ, DPI 100%, HUD ค่าเริ่มต้นและ minimap มุมล่างซ้าย, borderless-fullscreen. Geometry อื่นต้อง calibration และหลักฐานก่อนเพิ่มใน certified matrix. GSI-only Lite mode ยังให้ local core ทำงานได้ แต่ไม่มี CV; ไม่มี coverage/ข้อมูลว่างไม่ใช่คำยืนยันว่าปลอดภัย.
* **Access และ data:** local core ต้องเริ่มได้โดยไม่ลงชื่อเข้าใช้/สิทธิ์/network ตาม target; account actions ยังตรวจสิทธิ์บน server. Cloud game context ปิดโดยค่าเริ่มต้นและต้อง opt-in แยกตาม allowlist. Voice transcript/audio, G-Memory, G-Log และ CV ไม่ส่ง cloud.
* **G-Party extension:** Owner สั่งเพิ่ม own-stat peer sharing ตาม [[mvp-decisions]] MVP-005A โดยไม่เปลี่ยน priority/62 task เดิม; consent และ route แยกจาก AI และไม่ต้องมี app account. Implementation/native/live acceptance ยังต้องมีหลักฐานของตน.

ข้อกำหนดเชิงข้อมูล, quality threshold, สถานะ offline/account และวิธีวัดฉบับเต็มอยู่ใน [[mvp-decisions]]; SRS §5 เป็นรายละเอียด requirement ที่ต้องสอดคล้องกับมตินี้.

## **2\. Naming Concept: The "Maiden" Archetype**

* **Inspiration:** ร่างจำลองอัจฉริยะจาก Rylai (Crystal Maiden)
* **Core Concept:** Iconic ของ Top tier supporter ผสมผสานความอ่อนโยน (Gentle), สติปัญญา (High INT), และความเป็นมีมระดับตำนาน "Nerf CM"
* **The "Nerf" Self-Awareness:** Maiden มีความเป็นมนุษย์ผ่านการรับรู้ถึงข้อจำกัดของระบบ (Meta-Humor) เช่น การเตือนผู้เล่นด้วยความเอ็นดูว่า "ขอโทษนะที่ Maiden ช่วยได้แค่นี้... ดูเหมือนระบบจะเนิร์ฟฉันอีกแล้ว"

## **3\. System Architecture & Feature Details**

### **G-Sentry (Fog of War Monitoring)**

* **Description:** ระบบตรวจจับการหายไปจากมินิแมพ (Missing-in-Action)
* **Logic:** ใช้ minimap CV เป็นแหล่งตำแหน่งศัตรูและตรวจการหายไปจาก vision; GSI ให้ GameTick, own-player/session context และ score-derived enemy-death count ไม่ได้เปิดเผยตำแหน่งศัตรู. ความเสี่ยงจากเวลาที่หายใช้ G-Motion ซึ่งยังเป็น heuristic ไม่ใช่เส้นทางที่เห็นผ่าน fog.
* **Maiden's Touch:** แจ้งเตือนด้วยความห่วงใย "ระวังนะ... พวกเขาหายไปจากเลนแล้ว ฉันมองไม่เห็นพวกเขาเลย"

### **G-Motion (Time-off-map Risk Heuristic)**

* **Description:** ประเมินความเสี่ยงจากเวลาที่ฮีโร่หายไปและทิศก่อนหาย โดยใช้ประวัติตำแหน่งในเครื่อง 5 นาที
* **Logic:** heuristic สำหรับความเสี่ยงเท่านั้น; ไม่มี heatmap, lane model หรือการทำนายเส้นทางผ่าน fog ใน MVP.
* **Maiden's Touch:** Maiden อธิบายระดับความเสี่ยงตามหลักฐานที่เห็นและระบุความไม่แน่นอน.

### **G-Signal (Real-time Gank Warning)**

* **Description:** ระบบ Interrupt แจ้งเตือนภัยเร่งด่วน
* **Logic:** p50 ≤250ms และทุก sample ที่วัด ≤300ms จาก T0 (GSI POST arrival หรือรอบ capture acquisition ที่ถึงกำหนดก่อนการรอ) ถึง T3 (loopback first audible sample); critical path เป็น local Rust ไม่เรียก cloud หรือ SLM ตาม [[mvp-decisions]]
* **Maiden's Touch:** "ถอยเร็ว\! ศัตรูกำลังมา... โอ้ย ระบบดันมาเนิร์ฟเสียงแจ้งเตือนฉันตอนนี้ซะได้ แต่รีบหนีเถอะ\!"

### **G-Master (Strategic Advisor)**

* **Description:** ระบบแนะนำการเล่นเชิงกลยุทธ์
* **Logic:** แนะนำ Skill Build/Item Build จากข้อมูลผู้เล่นและ static dataset ที่มีหลักฐาน; enemy Net Worth/items ใช้ได้เฉพาะเมื่อมี source ที่อนุญาตและผ่าน allowlist. Cloud context ต้อง opt-in แยก.
* **Maiden's Touch:** แนะนำจาก own-player fields ที่ยืนยันได้และ static matchup data; ระบุ unknown เมื่อไม่มีข้อมูล enemy build ที่ผ่านการยืนยัน.

### **G-Sensory (Overlay & Hardware Optimization)**

* **Description:** ระบบจัดการ Overlay และทรัพยากร
* **Logic:** ระบบ Overlay แบบโปร่งใสไม่รบกวนสายตา (Low Resource) พร้อม Hotkey ปรับแต่ง Maiden ตามความเหมาะสมของฮีโร่ที่เล่น
* **Maiden's Touch:** ปรับเปลี่ยนสี Overlay ตาม Element ของฮีโร่ที่คุณเล่น (เช่น สีน้ำแข็งเมื่อเล่น Maiden)

### **G-Log (Feedback Loop)**

* **Description:** ระบบเก็บข้อมูลและเรียนรู้
* **Logic:** บันทึก Decision-making ของผู้เล่นและผลลัพธ์เพื่อนำมาปรับจูนค่าความแม่นยำในการทำนายของ Maiden ในแมตช์ถัดไป
* **Maiden's Touch:** สรุปผลหลังจบเกม: "วันนี้เราทำดีที่สุดแล้วนะ ถึงฉันจะช่วยได้ไม่มาก แต่แมตช์หน้า... ฉันว่าเราทำได้ดีกว่านี้แน่"

## **3A. Companion Experience Extensions (Competitive Benchmark: Questie AI)**

โมดูลต่อไปนี้เป็น product extensions; MVP boundary อยู่ใน [[mvp-decisions]] และ §1A. G-Voice/G-Memory เป็น Companion P0 ที่คงไว้. Benchmark narrative นี้ไม่ใช่ evidence ว่า competitor capability หรือ G-Maiden acceptance ผ่านแล้ว.

### **G-Voice (Two-Way Voice Conversation) — P0**

* **Description:** สนทนาด้วยเสียงสองทางแบบ push-to-talk ด้วย `Ctrl+Alt+V` เป็นค่าเริ่มต้นที่เสนอสำหรับ MVP; ตรวจ conflict และ remap ได้. `Alt+M` คงเป็น mute และไม่มี always-on microphone.
* **Logic:** audio/STT/transcript/free-form question และบริบท GSI/G-Memory อยู่ในเครื่อง; local interpretation/answer → TTS. G-Signal ขัดจังหวะได้เสมอ. ห้าม fallback จาก Voice ไป cloud.
* **Maiden's Touch:** ตอบคำถามเชิงกลยุทธ์แบบเรียลไทม์โดยไม่ต้องหยุดเล่น

### **G-Memory (Persistent Player Memory) — P0**

* **Description:** Maiden "จำผู้เล่นได้" ข้ามแมตช์ (moat หลักของ persona)
* **Logic:** เก็บเฉพาะ aggregate จากแหล่ง local ที่มีหลักฐาน; ข้อมูลที่ไม่มี source เป็น unknown. Summary สูงสุด 3 จุดต่อ complete session พร้อม event/timestamp; partial session ไม่เดาผลหรือสาเหตุการตาย. G-Memory อยู่ในเครื่องและไม่เข้า cloud prompt.
* **Maiden's Touch:** อ้างเฉพาะสิ่งที่ local history ยืนยันได้.

### **G-Coach (Post-Match Deep Review) — P1; outside MVP**

* **Description:** รีวิวเชิงลึกหลังจบเกม (เหนือกว่า Questie ที่ทำเฉพาะ realtime)
* **Logic:** วิเคราะห์ GSI log เต็มแมตช์ ชี้ key decision points + จัด 3 จุดที่ควรปรับปรุง
* **Maiden's Touch:** "จุดที่น่าเสียดายที่สุดคือนาทีที่ 24 ที่เราเข้าไฟต์เร็วไป"

### **G-Mind (Cognitive Model Router) — P1**

* **Description:** แนวคิด router สำหรับเลือก Cloud LLM หลายค่าย; Gemini เป็นเพียง design target เดิม
* **Logic:** G-Mind/provider switching เป็น P1 และอยู่นอก MVP. Cloud context ของ manual advice ปิดโดยค่าเริ่มต้น; เมื่อ opt-in ให้ส่งได้เฉพาะ allowlist ที่ Owner เลือกไว้. G-Signal ไม่พึ่ง router.
* **Maiden's Touch:** ใช้ชื่อ provider เฉพาะเมื่อระบบยืนยัน backend จริง.

### **G-Persona (Tone & Verbosity Presets) — P2; outside MVP**

* **Description:** ปรับโทน/ความถี่การพูดของ Maiden (เงียบ↔ช่างพูด, จริงจัง↔มีม) โดยคงตัวตนเดียว
* **Logic:** ไม่ลบล้างพฤติกรรมบังคับ (Belief Revision, Interrupt, มีม "Nerf CM")
* **Maiden's Touch:** ผู้เล่นเลือกได้ว่าจะให้ Maiden เงียบ ๆ หรือพากย์ครื้นเครง

### **G-Stream (Streamer Co-host Mode) — P2; outside MVP**

* **Description:** โหมดผู้ช่วยสำหรับสตรีมเมอร์ + ปกปิดข้อมูลละเอียดอ่อน
* **Logic:** ปรับ Overlay/โทนสำหรับออกอากาศ; ไม่ส่ง G-Memory/G-Log ออกนอกเครื่อง
* **Maiden's Touch:** "สวัสดีทุกคนในห้องค่ะ~ วันนี้เราจะพา Crystal Maiden ไปได้ไกลแค่ไหนกันนะ"

## **3B. G-Party — Cooperative own-GSI sharing (Owner-directed extension)**

* **ผู้ใช้ทำอะไรได้:** สมาชิกที่เปิดใช้เองดู HP/MP%/alive/respawn ของกันและกันได้โดยไม่ camera-select. ไม่อ่านผู้เล่นที่ไม่ได้เข้าร่วมและไม่เติม roster จำลอง.
* **ขอบเขต:** own hero/level/HP/maxHP/manaPercent/alive/respawn จาก admitted local GSI เท่านั้น พร้อม room-scoped match/team binding. Raw match ID/SteamID อยู่ local; peer stats ไม่เข้า AI, Memory หรือ G-Log.
* **การยินยอม:** create/join ต้อง checked sharing consent พร้อม activation; ไม่มี view-only/auto-join/saved room credentials ใน slice นี้. Leave หยุดและล้าง local sharing; remote expiry แสดงตามจริงเมื่อ offline.
* **โครงสร้างที่เลือก:** optional self-hosted in-memory relay, remote HTTPS, native async transport; ไม่มี app account requirement หรือ hosting/deployment claim. ใช้ [[FEAT-G-PARTY]] เป็น protocol/acceptance SSOT.
* **สถานะ:** scope ได้รับคำสั่งให้พัฒนาแล้ว; รายละเอียด implementation เลือกโดย assistant. แยก source/socket tests จาก Windows/live Dota/สองจอ/resource acceptance และไม่เปลี่ยน MVP เดิมเป็น “เสร็จแล้ว”.

## **4\. ADR-01: G-Series Branding Nomenclature**

* **Decision:** ใช้ Prefix **"G-"** สำหรับทุกโมดูลการทำงานภายใน G-Maiden
* **Rationale:**
  * **Scalability:** ทำให้ง่ายต่อการขยายฟีเจอร์ในอนาคต
  * **Brand Unity:** สร้างเอกภาพในตัวสินค้า (G-Series)
  * **Community Bridge:** สื่อถึงรากเหง้าของชื่อ "G-MID" ที่มีความเป็นคอมมูนิตี้สูง

## **5\. Non-Functional Requirements**

* **Latency:** p50 ≤250ms และทุก sample ≤300ms ตาม T0→T3 ใน [[mvp-decisions]]
* **Personality Consistency:** Maiden ต้องรักษาบุคลิก "อ่อนโยนแต่แม่นยำ" และมีม "Nerf CM" อยู่เสมอ
* **Platform:** Windows x64 build 19045 และ 26100 เป็นเป้าหมายตรวจรับ; ถือว่า support เมื่อมี evidence ตาม matrix ของ MVP เท่านั้น.
* **Resource:** CPU ทั้ง process group ≤10% ของ logical CPU capacity ทุก sample 1 วินาที; aggregate peak Working Set ≤900,000,000 bytes; FPS impact ≤3% ตาม paired-run protocol ใน [[mvp-decisions]].

## 3C. G-Friends — เพื่อนและคำเชิญใน G-Party

ส่วนขยายตาม [[CR-038-party-friends-presence-invitations]] และ [[mvp-decisions]] MVP-005B ช่วยกลุ่มที่เล่นซ้ำค้นกันด้วย exact GID หรือ verified room binding, ตอบรับ/ปฏิเสธคำขอ, ลบ/block/unblock และเชิญเข้าห้องโดยไม่ย้ายกล้องไปเลือกฮีโร่ สมาชิกต้องเปิด own-GSI sharing ของตนเอง ข้อมูล HP/MP มาจาก [[FEAT-G-PARTY]] เท่านั้น

Google sign-in ใช้เฉพาะ social actions; guest room code และ local core ยังคงใช้ได้โดยไม่เป็นเพื่อนหรือมีบัญชี Presence ค่าเริ่มต้นซ่อนและเป็น online-in-app แบบมีอายุ ไม่แสดง last-seen/แมตช์ปัจจุบัน การผูกโปรไฟล์กับสมาชิกห้องต้อง opt-in แยกและไม่ใช้ nickname เดา GID

ผู้รับคำเชิญต้องตรวจผู้เชิญ/relay และติ๊ก GSI consent ใหม่ก่อน Join ไม่มี autojoin หรือการออกจากห้องเดิมเอง การเป็นเพื่อนไม่เปิดสิทธิ์ดู stats UI อยู่ใน G-Party ใช้พื้นที่เลื่อนภายใน ไม่แย่ง focus และไม่ลด minimap บนจอรอง ใช้ design tokens เดิมตามคำสั่งล่าสุดของผู้ใช้ แต่จัดเลย์เอาต์ใหม่รอบ minimap ได้โดยไม่ต้องตามหน้าเดิม

[[FEAT-G-FRIENDS]] / [[ADR-20]] เป็นสัญญา privacy, private storage, registered relay proof และ one-use admission. ไม่มี chat/voice/community/screen share/Steam friend import ในรอบนี้ การ merge code ไม่ทำให้ hosted service หรือ live acceptance ผ่านโดยอัตโนมัติ ดู [[g-party-social-operations]]

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.2.0 | 2026-10-10 | กำหนด MVP boundary และ supported matrix ตามมติ Owner; แก้ G-Motion, Voice, Memory, privacy และ quality claims ให้เป็น target ที่ตรวจรับได้ |
| 0.2.1 | 2026-10-12 | Aligned the whole-app CPU acceptance limit with MVP decision v0.2.0; runtime acceptance remains evidence-gated. |
| 0.2.2 | 2026-10-19 | Corrected G-Sentry inputs: enemy positions come from minimap CV; GSI supplies player/session and score-derived death context. |
| 0.2.3 | 2026-10-28 | Align active RAM target with owner-approved800MB aggregate full Working Set (MVP decision v0.4.0); retain accounting and historical evidence. |
| 0.2.4 | 2026-10-28 | Align active MVP RAM ceiling to owner-approved900MB aggregate Working Set; preserve accounting and historical evidence. |
| 0.3.0 | 2026-11-01 | เพิ่ม G-Party own-stat sharing เป็น Owner-directed extension พร้อม separate consent และ evidence boundaries โดยไม่ขยาย AI/data scope อื่น. |
| 0.4.0 | 2026-11-01 | เพิ่ม optional G-Friends social graph และ targeted invitation ที่ต้อง consent ใหม่; guest/core ยังคง account-optional และคง pending operational/live acceptance. |
