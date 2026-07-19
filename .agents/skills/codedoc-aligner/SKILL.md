---
name: codedoc-aligner
description: Run the G-Orchestra review gate tool using Mellum2 local LLM to check consistency between code diffs and documentation.
---

# Skill: Code-Doc Aligner (codedoc-aligner)

คู่มือสำหรับ AI Coding Agent ในการประมวลผลการตรวจสอบความสอดคล้องกันของโค้ด (Git Diff) และเอกสารความต้องการระบบ (Markdown Specs) โดยใช้โมเดล Mellum2 (Local LLM) ในพื้นที่การพัฒนา `G-Maiden` และ `G-Orchestra`

---

## 1. วิธีใช้งาน (How to Trigger)

เมื่อผู้พัฒนาพูดคีย์เวิร์ดต่อไปนี้ หรือมีนัยให้ทำการเช็คข้อมูลความพร้อม:
- "เช็คเอกสารกับโค้ดที่แก้ให้หน่อย"
- "รัน doc check"
- "verify document alignment"
- "รัน codedoc-aligner"

เอเจนต์ต้องปฏิบัติตามขั้นตอนใน Pipeline ด้านล่างเพื่อทำการตรวจสอบ

---

## 2. ขั้นตอนการทำงานสำหรับ Agent (Execution Pipeline & SOP)

### Step 1: สแกนข้อมูลใน Git Worktree
ระบุไฟล์ที่มีการเปลี่ยนแปลงล่าสุดด้วยคำสั่ง git:
```bash
git diff --name-only
```
หรือสแกนการเปลี่ยนแปลงที่อยู่ใน staged area:
```bash
git diff --cached --name-only
```

### Step 2: ค้นหาเอกสารคู่กรณี (Spec Mapping)
ตรวจสอบ [`PROJECT_FEATURE_MAP.md`](file:///g:/G-Maiden/PROJECT_FEATURE_MAP.md) เพื่อค้นหาว่าไฟล์โค้ด Rust หรือ TypeScript ที่มีการเปลี่ยนแปลง มีความเกี่ยวข้องกับเอกสารตัวใด (เช่น `signal.rs` สัมพันธ์กับ `docs/product/software-requirements-specification.md` และ `docs/product/product-requirements.md`)

### Step 3: รันการแบ่ง Batch ด้วย Python Script
เรียกใช้งานตัวช่วยในการแบ่ง Chunk และยิงคำวิเคราะห์ผ่าน Mellum2 (Ollama/Llama.cpp):
```bash
python .agents/skills/codedoc-aligner/scripts/chunk_and_align.py <path_to_code> <path_to_doc>
```
*หากรันครั้งแรก ให้ตรวจสถานะของ Ollama ก่อน (`curl http://localhost:11434/api/tags`)*

### Step 4: ตรวจสอบความถูกต้องผ่านสัญนิยม Symbol Graph (SOP)
* **SOP:** เมื่อตรวจพบจุดบกพร่องหรือความไม่สอดคล้อง เอเจนต์**ต้อง**จัดทำลิงก์อ้างอิงหลักฐาน (Evidence Links) ตามสัญนิยม Symbol Graph ชี้ตรงไปยังสัญลักษณ์โค้ดหรือบรรทัดที่เกิดปัญหาโดยตรง เช่น ชี้ไปยังฟังก์ชัน [`safe_pack_path`](file:///g:/G-Maiden/src-tauri/src/voice_api.rs) หรือ [`gsi.rs:L171`](file:///g:/G-Maiden/src-tauri/src/gsi.rs#L171) เพื่อช่วยให้ผู้ใช้กดตรวจสอบได้ทันทีและป้องกันปัญหารายงานคลาดเคลื่อนเมื่อโครงสร้างเอกสาร/โค้ดขยับตัวในอนาคต

---

## 3. สคริปต์ควบคุมและประมวลผล (Reference Script)

ตัวสคริปต์หลักจะเก็บอยู่ใน [scripts/chunk_and_align.py](file:///g:/G-Maiden/.agents/skills/codedoc-aligner/scripts/chunk_and_align.py) ซึ่งทำหน้าที่:
1. Parse Git Diff หรือไฟล์ต้นฉบับแบ่งกลุ่มไม่เกิน 3,000 tokens
2. Parse Markdown File แบ่งกลุ่มย่อย
3. ยิงประมวลผลผ่าน `/api/generate` หรือ `/api/chat` ของ Ollama
4. ดึง JSON Output และสรุปข้อมูลรายงานให้ผู้พัฒนา
