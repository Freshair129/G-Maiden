#!/usr/bin/env python3
import os
import sys
import re
import json
import argparse
import urllib.request

# Windows console default cp1252 พิมพ์รายงานภาษาไทยไม่ได้ (UnicodeEncodeError)
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

OLLAMA_URL = os.environ.get("CODEDOC_OLLAMA_URL", "http://localhost:11434/api/generate")
# ชื่อโมเดล Mellum2 จริงบนเครื่อง (override ได้ด้วย env CODEDOC_MODEL)
MODEL_NAME = os.environ.get(
    "CODEDOC_MODEL",
    "hf.co/yuxinlu1/Mellum2-12B-A2.5B-Claude-4.6-4.8-Opus-Thinking-GGUF:Q4_K_M",
)

def count_approx_tokens(text):
    # คำนวณ token หยาบๆ (1 word ≈ 1.3 tokens)
    return int(len(text.split()) * 1.3)

def chunk_code_diff(diff_text, max_tokens=3000):
    chunks = []
    current_chunk = []
    current_tokens = 0
    
    # แบ่งแยกบรรทัด
    lines = diff_text.split('\n')
    for line in lines:
        line_tokens = count_approx_tokens(line)
        if current_tokens + line_tokens > max_tokens:
            if current_chunk:
                chunks.append('\n'.join(current_chunk))
            current_chunk = [line]
            current_tokens = line_tokens
        else:
            current_chunk.append(line)
            current_tokens += line_tokens
            
    if current_chunk:
        chunks.append('\n'.join(current_chunk))
    return chunks

def chunk_markdown(doc_text, max_tokens=3000):
    chunks = []
    current_chunk = []
    current_tokens = 0
    
    # แบ่งตามหัวข้อ ## หรือ ###
    sections = re.split(r'(?=\n##+ )', doc_text)
    for section in sections:
        section_tokens = count_approx_tokens(section)
        if current_tokens + section_tokens > max_tokens:
            if current_chunk:
                chunks.append('\n'.join(current_chunk))
            current_chunk = [section]
            current_tokens = section_tokens
        else:
            current_chunk.append(section)
            current_tokens += section_tokens
            
    if current_chunk:
        chunks.append('\n'.join(current_chunk))
    return chunks

class LLMQueryError(Exception):
    pass


def query_local_llm(prompt):
    data = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,
        "options": {
            "num_ctx": 8192,
            "temperature": 0.2
        }
    }

    req = urllib.request.Request(
        OLLAMA_URL,
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )

    # ห้ามกลืน error: query fail ต้อง propagate ให้ main() exit non-zero
    # ไม่งั้นสคริปต์จะรายงาน "aligned!" ปลอมทั้งที่ไม่ได้วิเคราะห์อะไรเลย
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            return res_data.get('response', '')
    except Exception as e:
        raise LLMQueryError(f"Error querying Ollama ({OLLAMA_URL}, model={MODEL_NAME}): {e}") from e

def parse_args():
    parser = argparse.ArgumentParser(
        description="ตรวจสอบความสอดคล้องระหว่างโค้ด (diff/ไฟล์) กับเอกสาร spec ผ่าน Mellum2 (Ollama)"
    )
    # รองรับทั้ง flag ตาม SKILL.md และ positional แบบเดิม
    parser.add_argument("--code-file", dest="code_file", help="path ไปยังไฟล์โค้ดหรือ git diff")
    parser.add_argument("--doc-file", dest="doc_file", help="path ไปยังไฟล์เอกสาร markdown")
    parser.add_argument("positional", nargs="*", help="<code_file> <doc_file> (แบบเดิม)")
    args = parser.parse_args()

    code_path = args.code_file
    doc_path = args.doc_file
    pos = list(args.positional)
    if code_path is None and pos:
        code_path = pos.pop(0)
    if doc_path is None and pos:
        doc_path = pos.pop(0)

    if not code_path or not doc_path:
        parser.error("ต้องระบุทั้งไฟล์โค้ดและไฟล์เอกสาร (--code-file/--doc-file หรือ positional 2 ตัว)")
    return code_path, doc_path


def main():
    code_path, doc_path = parse_args()

    if not os.path.exists(code_path) or not os.path.exists(doc_path):
        print("Error: One or both files do not exist.")
        sys.exit(1)

    with open(code_path, 'r', encoding='utf-8') as f:
        code_content = f.read()

    with open(doc_path, 'r', encoding='utf-8') as f:
        doc_content = f.read()

    code_chunks = chunk_code_diff(code_content)
    doc_chunks = chunk_markdown(doc_content)

    print(f"Divided code into {len(code_chunks)} chunk(s) and docs into {len(doc_chunks)} chunk(s).")

    all_results = []

    for idx_c, c_chunk in enumerate(code_chunks):
        for idx_d, d_chunk in enumerate(doc_chunks):
            print(f"Analyzing Code Chunk {idx_c+1} against Doc Chunk {idx_d+1}...")

            prompt = f"""คุณคือ AI Review Agent ของระบบ G-Orchestra หน้าที่ของคุณคือตรวจสอบความไม่สอดคล้องกันระหว่าง โค้ดที่เปลี่ยนไป (Git Diff) และ เอกสารรายละเอียดการออกแบบระบบ (Spec Doc)

[Git Diff / Source Code Chunk]
{c_chunk}

[Document Reference Chunk]
{d_chunk}

คำสั่ง:
1. วิเคราะห์โค้ดและเปรียบเทียบกับรายละเอียดในเอกสารอย่างรอบคอบ
2. ประเมินว่าในจุดที่มีการแก้ไขระบบในโค้ด เอกสารยังคงความถูกต้องอยู่หรือไม่ หรือขัดแย้งกันอย่างมีนัยสำคัญ
3. ส่งผลลัพธ์การตรวจสอบออกมาในรูปแบบ JSON Array ที่มีโครงสร้างดังนี้เท่านั้น (ห้ามมีคำพูดเปิดหรือปิดนอกเหนือจาก JSON):
[
  {{
    "file": "{code_path}",
    "doc_link": "{doc_path}",
    "severity": "HIGH" | "MEDIUM" | "LOW",
    "conflict_desc": "คำอธิบายความไม่สอดคล้องกันอย่างละเอียดในภาษาไทย",
    "remediation": "สิ่งที่ต้องแก้ไขหรือเพิ่มในเอกสารเพื่อให้ตรงกับโค้ด"
  }}
]
"""
            try:
                response = query_local_llm(prompt)
            except LLMQueryError as e:
                print(f"\nFATAL: {e}", file=sys.stderr)
                print("การวิเคราะห์ล้มเหลว — ห้ามตีความว่า code/docs aligned", file=sys.stderr)
                sys.exit(2)
            # ดึงเฉพาะส่วนที่เป็น JSON array
            json_match = re.search(r'\[\s*\{.*\}\s*\]', response, re.DOTALL)
            if json_match:
                try:
                    res_json = json.loads(json_match.group(0))
                    all_results.extend(res_json)
                except Exception:
                    print(f"Warning: chunk {idx_c+1}x{idx_d+1} returned unparseable JSON — skipped", file=sys.stderr)

    # ทำ Final Rollup
    if all_results:
        print("Performing Final Rollup...")
        rollup_prompt = f"""คุณคือระบบจัดการข้อมูลความขัดแย้งของ G-Orchestra จงนำรายการข้อขัดแย้งดิบจากหลายผลการวิเคราะห์มาจัดระเบียบและสรุปเป็นรายงานสุดท้าย

[Raw Conflict Lists]
{json.dumps(all_results, ensure_ascii=False, indent=2)}

คำสั่ง:
1. ลบรายการที่ตรวจพบซ้ำกันออก
2. จัดกลุ่มหัวข้อตามไฟล์เอกสารหลัก
3. เรียงระดับความสำคัญ (Severity) จากระดับ HIGH ไปยัง LOW
4. สรุปเป็นรายงาน Markdown ที่มีความสวยงามและกระชับในภาษาไทย
"""
        try:
            final_report = query_local_llm(rollup_prompt)
        except LLMQueryError as e:
            # rollup fail ไม่ควรทิ้งผลดิบที่วิเคราะห์สำเร็จแล้ว
            print(f"\nWarning: rollup failed ({e}) — printing raw findings instead", file=sys.stderr)
            final_report = json.dumps(all_results, ensure_ascii=False, indent=2)
        print("\n=== FINAL CONSISTENCY REPORT ===\n")
        print(final_report)
        sys.exit(1)  # พบ conflict → non-zero เพื่อใช้เป็น gate ได้
    else:
        print("\nNo conflicts or issues detected. Code and docs are aligned!")

if __name__ == "__main__":
    main()
