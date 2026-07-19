# USECASE — codedoc-aligner

ตัวอย่างการใช้งานจริง 3 สถานการณ์ของ skill [codedoc-aligner](SKILL.md) ในโปรเจกต์ G-Maiden
(ทุกตัวอย่างรันจาก repo root `G:\G-Maiden`; อ่าน exit code เป็นหลัก ไม่ใช่แค่ stdout —
`0` = aligned, `1` = พบ conflict, `2` = fail/สรุปไม่ได้)

---

## Use Case 1 — ตรวจ diff ก่อน commit (pre-commit review gate)

**สถานการณ์:** เพิ่งแก้ logic ใน `src-tauri/src/signal.rs` (เช่น ปรับ hysteresis threshold)
อยากรู้ว่า SRS ยังบรรยายพฤติกรรมถูกอยู่ไหม ก่อนจะ commit

**ขั้นตอน:**

```bash
# 1) ดึงเฉพาะ diff ของไฟล์ที่แก้ (เร็วกว่าส่งไฟล์เต็มมาก — จำนวน LLM call = C×D)
git diff src-tauri/src/signal.rs > "%TEMP%\signal.diff"

# 2) รันเทียบกับเอกสารคู่กรณี (ดู mapping จาก PROJECT_FEATURE_MAP.md)
python .agents/skills/codedoc-aligner/scripts/chunk_and_align.py \
  --code-file "%TEMP%\signal.diff" \
  --doc-file "docs/product/software-requirements-specification.md"
```

**การตีความผล:**

| Exit | ความหมาย | เอเจนต์ทำอะไรต่อ |
| --- | --- | --- |
| `0` | diff ไม่ขัดกับ SRS | commit ได้เลย |
| `1` | SRS ล้าสมัยเทียบกับ diff | อ่านรายงานใน stdout → อัปเดต SRS ในหัวข้อที่ชี้ แล้วค่อย commit ทั้งคู่พร้อมกัน |
| `2` | วิเคราะห์ไม่สำเร็จ | **ห้าม**สรุปว่าผ่าน — เช็ค Ollama (`curl http://localhost:11434/api/tags`) แล้วรันใหม่ |

> เคล็ดลับ: threshold ตัวเลข (เช่น `>85% alert, <50% clear`) เป็นจุดที่ SRS drift บ่อยสุด —
> ถ้า diff แตะค่าคงที่พวกนี้ ให้คาดหวัง exit 1

---

## Use Case 2 — ตรวจ FEAT doc หลังงาน feature เสร็จ (spec-drift sweep + Symbol Graph SOP)

**สถานการณ์:** เพิ่ง ship G-Motion heading-aware (`heading_multiplier()` ใน `motion.rs`)
อยากยืนยันว่า `docs/features/FEAT-G-MOTION.md` ยังบรรยาย logic ตรงกับโค้ดจริง

**ขั้นตอน:**

```bash
python .agents/skills/codedoc-aligner/scripts/chunk_and_align.py \
  src-tauri/src/motion.rs \
  docs/features/FEAT-G-MOTION.md
```

**ตัวอย่างผลที่ได้ (exit 1):**

```json
[
  {
    "file": "src-tauri/src/motion.rs",
    "doc_link": "docs/features/FEAT-G-MOTION.md",
    "severity": "MEDIUM",
    "conflict_desc": "เอกสารระบุว่า ring buffer ยังไม่ถูกใช้ทำนายทิศทาง แต่โค้ดมี heading_multiplier() ที่อ่าน trail ก่อนหายแล้ว",
    "remediation": "อัปเดตหัวข้อ 1 และ 4 ของ FEAT-G-MOTION.md ให้สะท้อน heading-aware logic"
  }
]
```

**ปิดงานตาม SOP (SKILL.md Step 4 + 5):** ตอนแก้เอกสารตามรายงาน เอเจนต์ต้อง
1. แนบ evidence link ชี้สัญลักษณ์จริง เช่น
   [`heading_multiplier`](file:///g:/G-Maiden/src-tauri/src/motion.rs) — ไม่ใช่เขียนชื่อฟังก์ชันลอย ๆ
   เพื่อให้ผู้ใช้กดตรวจได้ทันทีและลิงก์ไม่เน่าเมื่อโครงสร้างขยับ (Step 4)
2. bump เวอร์ชันเอกสาร + เพิ่มแถวในตาราง `## Changelog` ท้ายเอกสาร (Step 5) เช่น:
   ```markdown
   | 0.3.1 | 2026-07-19 | sync §1/§4 ให้ตรง heading_multiplier() ตามผล codedoc-aligner |
   ```
   และถ้า header มีบรรทัดเวอร์ชัน ต้องอัปเดตให้ตรงแถวล่าสุดเสมอ

---

## Use Case 3 — Batch gate ก่อนตัด release (วนหลายคู่ไฟล์ตาม feature map)

**สถานการณ์:** ก่อน bump version + push tag ต้องการกวาดว่าโมดูลหลักที่แตะใน release นี้
ไม่มี spec drift ค้าง — ใช้ mapping จาก `PROJECT_FEATURE_MAP.md` (feature → file → doc)

**ขั้นตอน (PowerShell):**

```powershell
$pairs = @(
  @{ code = "src-tauri/src/signal.rs";  doc = "docs/features/FEAT-G-SIGNAL.md" },
  @{ code = "src-tauri/src/motion.rs";  doc = "docs/features/FEAT-G-MOTION.md" },
  @{ code = "src-tauri/src/master.rs";  doc = "docs/features/FEAT-G-MASTER.md" }
)
$fail = 0
foreach ($p in $pairs) {
  python .agents/skills/codedoc-aligner/scripts/chunk_and_align.py $p.code $p.doc
  if ($LASTEXITCODE -eq 2) { Write-Host "INFRA FAIL - หยุดทั้ง batch"; exit 2 }
  if ($LASTEXITCODE -eq 1) { $fail++ }
}
if ($fail -gt 0) { Write-Host "$fail pair(s) มี drift - แก้เอกสารก่อนตัด release"; exit 1 }
Write-Host "ทุกคู่ aligned - ตัด release ได้"
```

**กติกาสำคัญของ batch mode:**
- `exit 2` ของคู่ใดคู่หนึ่ง = หยุดทั้ง batch ทันที (infra พังแล้ว คู่ถัดไปก็จะพังเหมือนกัน
  และห้ามนับคู่ที่เหลือว่า "ผ่าน")
- ไฟล์ใหญ่ (เช่น `capture.rs`) ควรส่ง `git diff <last-release-tag> -- <file>` แทนไฟล์เต็ม
  เพื่อกดจำนวน chunk pair — สคริปต์จะเตือนเมื่อเกิน 20 คู่
- ผลเป็น advisory จาก local LLM: คู่ที่ขึ้น HIGH ให้เอเจนต์หลัก (หรือคน) เปิดโค้ดตรวจซ้ำ
  ก่อนถือเป็นข้อสรุป — อย่า auto-แก้เอกสารจาก severity ต่ำโดยไม่ตรวจ

---

## สรุปการเลือก input ให้เหมาะกับงาน

| งาน | code input ที่ควรใช้ | เหตุผล |
| --- | --- | --- |
| ก่อน commit | `git diff` เฉพาะไฟล์ | เร็วสุด, ประเด็นแคบ |
| หลังจบ feature | ไฟล์ `.rs`/`.tsx` เต็ม | จับ drift สะสมที่ diff เดียวมองไม่เห็น |
| ก่อน release | `git diff <tag>..HEAD -- <file>` ต่อคู่ | ครอบคลุมทั้ง release โดยไม่จ่าย C×D ของไฟล์เต็ม |
