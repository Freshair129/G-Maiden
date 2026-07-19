# Technical Specification: G-Orchestra Code-Doc Alignment Agent

> **สถานะ:** PROPOSED
> **ขอบเขต:** ฟีเจอร์ Review Gate ของ `G-Orchestra` (เครื่องมือพัฒนาภายในระบบ `orchestration/`)
> **ระบบโมเดล:** `Mellum2-12B-A2.5B-Claude-4.6-4.8-Opus-Thinking-GGUF:Q4_K_M` ผ่าน Ollama/Llama.cpp
> **เป้าหมาย:** ตรวจสอบความสอดคล้องระหว่าง Git Diff (โค้ดที่เปลี่ยนจริง) กับเอกสารข้อกำหนดความต้องการ (Markdown Specs) เพื่อป้องการเกิด Spec Drift ก่อนผ่าน Review Gate

---

## 1. Context & Motivation

ในการพัฒนา `G-Maiden` โค้ดมีการพัฒนาอย่างรวดเร็ว (เช่น การเพิ่มความสามารถตรวจสอบทิศทาง gank ใน `G-Motion` หรือการอัปเดตระบบคำนวณ Burst ใน `G-Damage`) แต่ความสอดคล้องของเอกสารใน `docs/` มักจะตกสำรวจเนื่องจากกระบวนการตรวจสอบ (Review Gate) ยังใช้แรงงานคนและเป็นแบบ Manual 

เครื่องมือนี้จะทำงานเป็น **Review Agent** ประจำการบน `G-Orchestra` คอยอ่าน Git Diff ล่าสุดและประเมินเอกสารข้อกำหนดที่เปลี่ยนไป เพื่อรายงานความไม่สอดคล้อง โดยมีการใช้ **Batching & Summarization Strategy** เพื่อให้ทำงานได้ภายใต้ Context Window และความสามารถของ Local LLM ขนาด 12B/Active 2.5B (Mellum2) โดยไม่สูญเสียความแม่นยำ

---

## 2. Core Functional Requirements (ความสามารถหลัก)

* **FR-1: Automated Diff Analysis:** ตรวจวิเคราะห์การแก้ไขทั้งไฟล์ใน Workspace และ Git Staged Area
* **FR-2: Spec Association:** ค้นหาไฟล์เอกสารที่เกี่ยวข้องกับโค้ดที่เกิดการเปลี่ยนแปลง (อาศัย `PROJECT_FEATURE_MAP.md` และ Tag Mapping)
* **FR-3: Smart Chunking / Batching:** แบ่งแยกโค้ดและเอกสารขนาดใหญ่ออกเป็น Chunk ย่อยขนาด ≤ 3,000 tokens โดยไม่ให้คำหรือ Logic ขาดตอน
* **FR-4: In-Process Thinking & Local Analysis:** ส่งคู่โค้ด-เอกสารแต่ละ Batch ไปวิเคราะห์ผ่าน Mellum2 (Local LLM) รวบรวมข้อมูลผลลัพธ์เป็นโครงสร้าง JSON
* **FR-5: Rollup Reporting:** นำผลลัพธ์ JSON ของแต่ละ Batch มาคัดกรองความซ้ำซ้อน สรุปวิเคราะห์ และเขียนเป็น Walkthrough Report (Markdown) ให้ผู้พัฒนาเห็นประเด็นข้อผิดพลาดชัดเจน

---

## 3. Technical Architecture & Pipeline

### 3.1 Input Chunking Strategy (การแบ่ง Batch ข้อมูล)

```
+-------------------------------------------------------------+
|                     Git Diff (Large File)                   |
+-------------------------------------------------------------+
                               |
                   [Parser: Split by Symbols]
                               |
                               v
   +-------------------------------------------------------+
   | Batch 1 (Diff <3k Tokens) | Batch 2 (Diff <3k Tokens) |
   +-------------------------------------------------------+
```

1. **Code Chunking Protocol:**
   * สแกนหาขอบเขตของ Function, Struct หรือ Impl บล็อคใน Rust (หรือ CSS/TypeScript Component)
   * หาก Git Diff ในจุดนั้นๆ มีความยาวเกิน 3,000 tokens ให้ใช้ขอบเขตของ Function หรือ Impl บล็อคตัวที่ใกล้เคียงที่สุดในการตัด Chunk เพื่อป้องกันความหมายของ Logic แยกส่วนกัน
2. **Doc Chunking Protocol:**
   * ตัดหัวข้อ Markdown แยกตาม Element ลำดับที่สองและสาม (`##` และ `###`) 
   * รวบรวม Element ใกล้เคียงเข้าด้วยกันจนมีขนาดใกล้เคียง 3,000 tokens

---

### 3.2 Prompt Pipeline & Architecture

#### Stage 1: Batch Consistency Checker Prompt
ส่งให้ Mellum2 ประมวลผลทีละคู่ (Code Chunk vs. Doc Chunk) เพื่อตรวจสอบประเด็นที่ไม่ลงรอยกัน:

```markdown
System: คุณคือ AI Review Agent ของระบบ G-Orchestra หน้าที่ของคุณคือตรวจสอบความไม่สอดคล้องกันระหว่าง โค้ดที่เปลี่ยนไป (Git Diff) และ เอกสารรายละเอียดการออกแบบระบบ (Spec Doc) 

[Git Diff / Source Code Chunk]
{{CODE_CHUNK}}

[Document Reference Chunk]
{{DOC_CHUNK}}

คำสั่ง:
1. วิเคราะห์โค้ดและเปรียบเทียบกับรายละเอียดในเอกสารอย่างรอบคอบ
2. ประเมินว่าในจุดที่มีการแก้ไขระบบในโค้ด เอกสารยังคงความถูกต้องอยู่หรือไม่ หรือขัดแย้งกันอย่างมีนัยสำคัญ
3. ส่งผลลัพธ์การตรวจสอบออกมาในรูปแบบ JSON Array ที่มีโครงสร้างดังนี้เท่านั้น (ห้ามมีคำพูดเปิดหรือปิดนอกเหนือจาก JSON):

[
  {
    "file": "path/to/source_file",
    "doc_link": "docs/product/spec.md#section",
    "severity": "HIGH" | "MEDIUM" | "LOW",
    "conflict_desc": "คำอธิบายความไม่สอดคล้องกันอย่างละเอียดในภาษาไทย",
    "remediation": "สิ่งที่ต้องแก้ไขหรือเพิ่มในเอกสารเพื่อให้ตรงกับโค้ด"
  }
]
```

#### Stage 2: Final Rollup Aggregator Prompt
เมื่อเสร็จสิ้นครบทุก Batch ระบบจะรวบรวม JSON ของทุก Batch มาให้ Mellum2 สรุปรวมเพื่อตัดปัญหาที่ซ้ำกัน และนำเสนอรายงานภาพรวม:

```markdown
System: คุณคือระบบจัดการข้อมูลความขัดแย้งของ G-Orchestra จงนำรายการข้อขัดแย้งดิบจากหลายผลการวิเคราะห์มาจัดระเบียบและสรุปเป็นรายงานสุดท้าย

[Raw Conflict Lists]
{{COMBINED_JSON_LISTS}}

คำสั่ง:
1. ลบรายการที่ตรวจพบซ้ำกันออก
2. จัดกลุ่มหัวข้อตามไฟล์เอกสารหลัก (เช่น BRD, SRS, TDD)
3. เรียงระดับความสำคัญ (Severity) จากระดับ HIGH (ความขัดแย้งรุนแรง) ไปยัง LOW (การพิมพ์ผิด/อัปเดตเล็กน้อย)
4. สรุปเป็นรายงาน Markdown ที่มีความสวยงามและกระชับในภาษาไทย โดยใช้รูปแบบของ G-Maiden (Quiet Luxury, ตารางสรุปชัดเจน)
```

---

## 4. G-Orchestra Integration & Skill Mapping (การผูกระบบและสปินออฟเป็น Skill)

1. **CLI Trigger:**
   * สั่งงานผ่าน CLI ของ G-Orchestra:
     ```bash
     pnpm -C orchestration orchestra-check --target docs/ --local-llm mellum2
     ```
2. **Dashboard UI Integration:**
   * เพิ่มปุ่ม **"Doc-Align Gate"** ในหน้าควบคุม Review Gate ของ G-Orchestra Dashboard
   * แสดงสถานะการรันผ่าน Indicator และโหลดผลลัพธ์ออกมาเป็น Actionable Checklist ในฝั่ง Admin Web UI
3. **Execution Guard (ความปลอดภัยของทรัพยากรเครื่อง):**
   * โมดูลนี้จะสั่งรันผ่าน G-Orchestra ในระหว่างที่ไม่ได้รันเกม Dota 2 เท่านั้น (ตรวจสถานะ `dota_running` จาก backend ของ GSI)
   * เมื่อรัน LLM ประมวลผลเสร็จสิ้น ระบบจะยิงคำสั่ง `Ollama API (unload/free)` เพื่อคืนหน่วยความจำ RAM/VRAM ของการ์ดจอทันที ป้องกัน Memory leak ตกค้าง
4. **Agent Skill Binding:**
   * ระบบรองรับการทำงานในรูปของ **Custom Agent Skill** ตั้งค่าไว้ที่ `g:\G-Maiden\.agents\skills\codedoc-aligner/`
   * ช่วยให้ AI Coding Assistant เข้าใจคู่มือคำสั่ง และสามารถรันสคริปต์ตรวจความถูกต้องของงานพัฒนาได้โดยอัตโนมัติ

---

## 5. แผนการตรวจสอบความถูกต้อง (Verification Plan)

### Automated Test Setup:
* **Unit Tests:** เขียนเทสเพื่อตรวจสอบ regex ในการแบ่ง Chunk (Chunker) ว่าสามารถแยกไฟล์ Diff ขนาดใหญ่เป็นส่วนย่อยที่มี token ไม่เกิน 3,000 ได้แม่นยำและไม่ทำให้บรรทัดของ Logic พัง
* **Consistency Mocking:** ทดลองแก้ไขโค้ดใน `signal.rs` (เช่น เปลี่ยนค่า threshold) โดยจงใจไม่แก้ `roadmap.md` หรือ `srs.md` แล้วสั่งรัน Alignment Agent ดูว่าระบบสามารถหาความไม่สอดคล้องระดับ HIGH ได้ถูกต้องหรือไม่
* **Resource Monitoring:** ตรวจสอบ VRAM/RAM ของระบบก่อนและหลังประมวลผล มั่นใจว่ามีการ unload โมเดลคืนเครื่องอย่างถูกต้อง 100%
