---
version: "0.2.0b"
created_at: "2026-07-20T18:50:03+07:00,ATHER"
last_update: "2026-07-20T21:20:00+07:00,ATHER"
status: "active"
superseded_by: null
attributes:
  doc_type: "rca"
  domain: "documentation-encoding"
  scope: "GitHub-rendered documentation"
  language: "th"
---

# RCA — เอกสารภาษาไทยบน GitHub แสดงเป็นตัวอักษรเอเลี่ยน

## Symptom

เอกสารที่ติดตามอยู่ใน Git แสดงข้อความเช่น `à¸...`, `à¹...`, `â€”`, `â†’` และ `ðŸ...`
บน GitHub แทนภาษาไทย เครื่องหมายวรรคตอน ลูกศร และ emoji ที่ตั้งใจไว้ อาการไม่ได้เกิดเฉพาะใน
editor หรือ terminal เพราะข้อความที่เสียอยู่ใน blob ของ `HEAD` โดยตรง

## Evidence

- การสแกน blob ใน `HEAD` พบ marker ของ mojibake ใน Markdown 10 ไฟล์:
  - `docs/architecture/adr/ADR-10-hybrid-ingestion-resilience.md`
  - `docs/architecture/adr/ADR-11-optin-data-contribution-flywheel.md`
  - `docs/architecture/adr/ADR-12-community-ai-marketplace.md`
  - `docs/architecture/engineering-spec.md`
  - `docs/architecture/spikes/S-1-minimap-cv.md`
  - `docs/architecture/technical-design-document.md`
  - `docs/architecture/tech-stack.md`
  - `docs/audits/2026-06-23-audit-gsi-setup-overlay-settings-th.md`
  - `docs/operations/validation/forms-and-social.md`
  - `docs/operations/validation/toolkit.md`
- `docs/atomic_index.jsonl` มีข้อความเสียที่สืบต่อมาจากเอกสารต้นทาง จึงต้อง regenerate หลังซ่อม
- ตัวอย่างจาก `HEAD`: หัวข้อของ `engineering-spec.md` เป็น
  `# G-Maiden â€” Engineering Spec` และเนื้อหาหลายช่วงเป็น `à¸...`
- ประวัติที่ยังติดตามได้แสดงว่า `engineering-spec.md` เสียแล้วตั้งแต่ commit `86c81410` และ
  ADR-11 เสียแล้วใน revision แรกที่ตรวจผ่านเส้นทางปัจจุบัน จึงไม่ใช่ regression จาก renderer ล่าสุด
- Repository ไม่มี `.editorconfig` และ `.gitattributes` ที่ระบุ UTF-8 หรือบังคับ encoding hygiene
- บางไฟล์มีทั้งภาษาไทยที่ถูกต้องและข้อความเสีย การแปลงทั้งไฟล์ด้วย codec เดียวจึงไม่ปลอดภัยและ
  การทดลองแบบ read-only ล้มเหลวที่ control-code bytes (`U+0081`, `U+008D`) ตามที่คาดจาก mojibake

## Root Cause

เนื้อหา UTF-8 เดิมถูก decode ด้วย Windows-1252/Latin-1-compatible mapping แล้วถูกบันทึกกลับเป็น
UTF-8 อีกครั้ง ทำให้ byte sequence ของภาษาไทยและอักขระพิเศษกลายเป็นข้อความ mojibake แบบถาวรใน Git
บางไฟล์ผ่านการแก้ไขเพิ่มเติมหลังเกิดเหตุ จึงมีทั้งช่วงที่ถูกและช่วงที่เสียอยู่ร่วมกัน

นี่เป็น root cause ระดับข้อมูลต้นฉบับ ไม่ใช่ปัญหา font, GitHub locale หรือ browser encoding
เพราะ GitHub กำลัง render Unicode ที่ถูก commit มาแล้วอย่างถูกต้อง แต่ Unicode นั้นเป็นข้อความที่ decode ผิด

## Why the issue escaped detection

- Markdown parser ยังอ่านไฟล์ได้และ CI เดิมไม่ได้ตรวจ semantic encoding
- ไม่มี automated gate ที่ค้นหา marker ของ UTF-8 mojibake ในเอกสาร
- การ review ก่อนหน้ามุ่งที่โครงสร้างเอกสาร, frontmatter, wikilink และ doc graph มากกว่าคุณภาพตัวอักษร
- ชื่อ commit ที่กล่าวถึง “fix encoding” ไม่ได้เป็นหลักฐานว่าแก้ทุกช่วง เพราะไม่มี zero-marker assertion
- Generated index นำข้อความเสียไปทำซ้ำ ทำให้จำนวนตำแหน่งเพิ่มโดยไม่ทำให้ build ล้มเหลว

## Proposed prevention

1. ซ่อมเฉพาะ corrupted runs ไม่แปลงทั้งไฟล์ โดยใช้ deterministic byte reversal และตรวจเนื้อหากับ
   revision/canonical peer ที่เชื่อถือได้เมื่อ run ใดไม่ reversible
2. ตรวจ diff รายไฟล์ว่า heading, code fence, URL, wikilink, table และ frontmatter ไม่เปลี่ยนโดยไม่ตั้งใจ
3. Regenerate `docs/atomic_index.jsonl` จากต้นทางหลัง Markdown ผ่าน gate แล้ว
4. เพิ่ม `.editorconfig` ที่กำหนด `charset = utf-8` สำหรับ text files
5. เพิ่มสคริปต์ตรวจ marker (`à¸`, `à¹`, `â€`, `â€”`, `â†`, `ðŸ`, `Ã`, `Â`) ใน tracked docs
   และให้คืน non-zero เมื่อพบ เพื่อใช้เป็น local/CI gate
6. ตรวจ GitHub rendering แบบ manual sampling หลัง push อย่างน้อยหนึ่งไฟล์ภาษาไทย หนึ่ง ADR และหนึ่ง generated view

## Verification contract

- marker scan ใน tracked Markdown และ generated index ต้องเป็นศูนย์ หรือมี allowlist ที่อธิบายเป็นรายตำแหน่ง
- ไฟล์ทั้งหมด decode เป็น UTF-8 ได้ และข้อความภาษาไทยอยู่ในช่วง Unicode Thai (`U+0E00–U+0E7F`)
- จำนวน code fences สมดุล และ link/anchor scan ผ่าน
- `codedoc-aligner` ผ่านหลัง repair และ regenerate
- GitHub แสดงตัวอย่างภาษาไทย/เครื่องหมาย dash/ลูกศรถูกต้องหลัง push

## Resolution

- ซ่อม corrupted Unicode runs ใน Markdown 10 ไฟล์และ regenerate `docs/atomic_index.jsonl`
- Structural invariant check ผ่านทุกไฟล์: heading, code fence, URL, wikilink และ Markdown link เท่าเดิม
- เพิ่ม `.editorconfig`, `encoding-check.mjs`, unit tests และ wiring เข้า doc CI gate
- Encoding check หลัง regenerate ผ่านด้วย 0 findings; รอ post-push GitHub rendering verification

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-20 | candidate | Initial evidence-backed RCA and prevention contract | — | ATHER |
| 0.2.0b | 2026-07-20 | active | Applied reversible repair, regenerated index and added CI regression guard | — | ATHER |
