#!/usr/bin/env python3
import os
import sys
import re
import json
import urllib.request

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "mellum2:latest" # หรือชื่อโมเดลเฉพาะบน Ollama

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
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            return res_data.get('response', '')
    except Exception as e:
        print(f"Error querying Ollama: {e}", file=sys.stderr)
        return ""

def main():
    if len(sys.argv) < 3:
        print("Usage: chunk_and_align.py <code_file_or_diff> <doc_file>")
        sys.exit(1)
        
    code_path = sys.argv[1]
    doc_path = sys.argv[2]
    
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
            response = query_local_llm(prompt)
            # ดึงเฉพาะส่วนที่เป็น JSON array
            json_match = re.search(r'\[\s*\{.*\}\s*\]', response, re.DOTALL)
            if json_match:
                try:
                    res_json = json.loads(json_match.group(0))
                    all_results.extend(res_json)
                except Exception as e:
                    pass
                    
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
        final_report = query_local_llm(rollup_prompt)
        print("\n=== FINAL CONSISTENCY REPORT ===\n")
        print(final_report)
    else:
        print("\nNo conflicts or issues detected. Code and docs are aligned!")

if __name__ == "__main__":
    main()
