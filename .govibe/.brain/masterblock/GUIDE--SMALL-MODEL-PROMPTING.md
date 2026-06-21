# GoVibe: Guidelines for Prompting Small AI Models (e.g., 9B)

> Asset classification: active worker guidance. This is the default small-model discipline for local GoVibe frontend delegation through Ollama.

**Status:** APPROVED
**Scope:** AI-Assisted Code Generation / Task Delegation

## 1. Overview
เอกสารนี้อธิบายถึงข้อจำกัด ปัญหาที่พบบ่อย และเทคนิคการสั่งงาน (Prompting) โมเดล AI ขนาดเล็ก (เช่น โมเดลในกลุ่ม 7B - 9B parameters อย่าง Qwen หรือ Sushi) เพื่อให้ได้ผลลัพธ์ที่แม่นยำ ป้องกันอาการค้าง (Hallucination) และหลีกเลี่ยงการทำลายบริบท (Context Overflow)

โมเดลขนาดเล็กมีความสามารถในการให้เหตุผล (Reasoning) ในระดับที่ดี แต่มีข้อจำกัดร้ายแรงในเรื่อง **Attention Span** (ความจดจ่อ) เมื่อต้องรับมือกับรูปแบบ (Pattern) ที่ซ้ำซ้อนหรือโครงสร้างที่ใหญ่เกินไป

## 2. ปัญหาที่พบบ่อย (Common Pitfalls)

### 2.1 The Infinite Repetition Loop (อาการวนลูปไม่สิ้นสุด)
- **อาการ:** โมเดลพิมพ์โค้ดหรือข้อความเดิมซ้ำๆ (เช่น การพิมพ์ Property ใน Object: `onclose: null, onmessage: null...` วนไปมาเป็นหมื่นบรรทัด) จนเกิด Error หรือ Token หมด
- **สาเหตุ (Root Cause):** เกิดจาก **Pattern Degeneration** เมื่อโมเดลถูกสั่งให้พิมพ์โครงสร้างข้อมูลที่ซ้ำซ้อน กลไก Attention ของมันจะถูกดึงดูดเข้าสู่ลูปนั้น ทำให้ลืมบริบท (Prompt) ดั้งเดิม และหาจุดจบ (Stop Condition) ไม่เจอ

### 2.2 Context Overflow & Forgetting (การลืมบริบท)
- **อาการ:** โมเดลเขียนโค้ดที่ลบโค้ดเดิมทิ้ง หรือทำงานที่อยู่นอกเหนือจากที่สั่ง
- **สาเหตุ:** โมเดลเล็กมักเสียสมาธิ (Attention Collapse) ได้ง่าย หากส่งไฟล์เต็ม (Full File) ขนาดใหญ่ให้มันอ่าน มันอาจจะไปแก้ในส่วนที่ไม่เกี่ยวข้อง

### 2.3 The "From-Scratch" Blank Page Syndrome (การค้างเมื่อเริ่มจากศูนย์)
- **อาการ:** เมื่อสั่งให้สร้างไฟล์ใหม่หรือ Component ใหม่ตั้งแต่ต้น (From scratch) โมเดลอาจจะพิมพ์โครงสร้าง Markdown หรือเครื่องหมายเปล่าๆ (เช่น `- |`) วนซ้ำไปมาโดยไม่มีโค้ดจริง
- **สาเหตุ:** การไม่มี Context หรือโครงสร้างเริ่มต้นให้ยึดเหนี่ยว ทำให้โมเดลหลงทิศทางและไปดึงเอา Pattern ขยะจากการฝึกสอน (Training noise) มาใช้แทนการให้เหตุผล

## 3. วิธีการแก้ไขและเทคนิคการสั่งงาน (Solutions & Best Practices)

### 3.1 Micro-Tasking (การแตกงานให้เล็กที่สุด)
- **กฎ:** "One Prompt = One Specific Change"
- ห้ามสั่งให้ "ทำฟีเจอร์ A" ให้แตกย่อยเป็น "สร้าง State X", "สร้าง Function Y", "เชื่อม Y เข้ากับ Component Z" ทีละรอบ
- โมเดลเล็กทำงานได้ดีที่สุดกับโค้ดไม่เกิน 50-150 บรรทัดต่อครั้ง

### 3.2 Anti-Loop Prompting (ป้องกันการวนลูป)
- **หลีกเลี่ยง:** การสั่งให้เขียน Mocks หรือ Object ที่มี Property จำนวนมาก (Exhaustive typing)
- **วิธีแก้:** บังคับให้ใช้เทคนิคการลดรูป (Shortcut/Type Assertion) เช่น:
  > ❌ **Bad:** "Mock the RTCDataChannel."
  > ✅ **Good:** "Mock only the necessary methods (createOffer). Use `as unknown as RTCDataChannel` to bypass exhaustive type checking. DO NOT mock every property."

### 3.3 Focused Input (จำกัดสิ่งที่ให้โมเดลอ่าน)
- แทนที่จะส่งโค้ดไปทั้งไฟล์ ให้ส่งไปแค่ "บล็อก" หรือ "ฟังก์ชัน" ที่ต้องการให้แก้
- **ตัวอย่าง:**
  > "Current component state: `const [status, setStatus] = useState('idle');`. Update this state to include 'connecting' and provide the updated line only."

### 3.4 Strict Output Formatting (บังคับรูปแบบผลลัพธ์)
- บังคับให้โมเดลตอบเฉพาะโค้ดที่นำไปใช้ได้ทันที (Surgical Edits) ป้องกันโมเดลพยายาม "อธิบาย" จนหลงประเด็น
- เพิ่มคำสั่งปิดท้าย Prompt เสมอ:
  > "Output ONLY the code block. No explanations. No line numbering."

### 3.5 Scaffolding First (ให้โครงสร้างเริ่มต้นเสมอ)
- **หลีกเลี่ยง:** การสั่งให้เขียนทุกอย่างใหม่จากศูนย์โดยไม่มีตัวอย่าง
- **วิธีแก้:** ฝั่ง Orchestrator หรือผู้สั่งงาน ควรเตรียม "โครงข่าย (Scaffold)" ให้ก่อน เช่น กำหนด `interface` หรือขึ้นต้นชื่อ `function` ไว้ให้ใน Prompt แล้วค่อยให้โมเดลเติม Logic ด้านใน (Fill in the blanks)

## 3.6 GoVibe local frontend defaults

เมื่อใช้ local frontend worker ใน GoVibe ผ่าน Ollama:

- ใช้ microtask packet เป็นตัวกำหนดขอบเขตงานก่อนเสมอ
- ใช้เฉพาะไฟล์ที่อยู่ใน task packet หรือที่ parent wrapper แนบให้
- ถ้างานเริ่มกินหลาย concern ให้แตก prompt ใหม่ ไม่บีบหลายอย่างในรอบเดียว
- ถ้าข้อมูล runtime ไม่มีจริง ให้ตอบ `unavailable` หรือ `BLOCKED` แทนการเดา
- ถ้างานเป็น A2 visual parity ให้ถือว่า header title, stat wording, และ header actions เสร็จแล้ว เว้นแต่ human จะสั่ง reopen

โปรไฟล์แนะนำของ wrapper:

- `fast` สำหรับ quick checks / planning
- `balanced` เป็นค่าเริ่มต้นสำหรับ frontend microtask ทั่วไป
- `ui-heavy` เมื่อต้อง reasoning เรื่อง layout/density มากขึ้น

## 4. ตัวอย่างการเปรียบเทียบ

### Scenario: Writing a Unit Test (Mocking)

🛑 **Bad Prompt (Causes Infinite Loop):**
> "Write a unit test for useWebRTC. You need to mock the RTCPeerConnection and RTCDataChannel."
> *(ผลลัพธ์: โมเดลพยายามเขียน Mock ทุก Properties ของ DataChannel จนค้าง)*

🟢 **Optimized Prompt (For Small Models):**
> "Write a unit test for useWebRTC. Use `vi.fn()` for createOffer. Use `as unknown as RTCPeerConnection` for the mock instance. DO NOT write exhaustive object mocks. Output only the updated test block."
> *(ผลลัพธ์: โมเดลใช้ Type Assertion ข้ามการพิมพ์ซ้ำ และเขียนเฉพาะส่วนที่จำเป็น)*

---
*Documented as part of GoVibe AI Safety & Workflow Standards.*
