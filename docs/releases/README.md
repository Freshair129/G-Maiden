---
title: "G-Maiden Release Governance"
doc_id: "RELEASE-GOVERNANCE"
status: "draft"
version: "0.1.0"
updated: "2026-07-23"
owner: "Boss"
related_docs: ["roadmap", "RELEASE-CHANNEL-ARCHITECTURE", "BETA-ROADMAP"]
---

# G-Maiden Release Governance

โฟลเดอร์นี้เป็น source of truth สำหรับวงจรการปล่อยผลิตภัณฑ์ ตั้งแต่ Public Demo, Dev Channel, Closed Beta, Open Beta, Release Candidate จนถึง Stable/GA

## หลักการ

1. Source code อยู่ใน repository และ `main` branch เดียว
2. Dev/Beta/Stable เป็น release channel ไม่ใช่ repository หรือ long-lived branch
3. Candidate ต้อง build และ sign ครั้งเดียว แล้ว promote artifact เดิมไป channel ถัดไป
4. งาน implementation ต้องเริ่มจาก spec ใน Git ตามด้วย GitHub Issue และจบด้วย Pull Request + test evidence
5. แต่ละ stage ใช้ Entry Gate, Definition of Done และ Exit Gate ของตัวเอง

## เอกสารหลัก

- [[RELEASE-CHANNEL-ARCHITECTURE]] — สถาปัตยกรรม Dev → Stable และ artifact promotion
- [[BETA-ROADMAP]] — ลำดับ Public Demo → Closed Beta → Open Beta → RC → GA
- [[PUBLIC-DEMO-SPEC]] — ขอบเขต Public Demo
- [[CLOSED-BETA-WAVE-0-SPEC]] — ขอบเขต Technical Preview
- [[CLOSED-BETA-WAVE-0-DOD]] — DoD และ Exit Gate ของ Wave 0
- [[OPEN-BETA-SPEC]] — ขอบเขต Open Beta
- [[OPEN-BETA-DOD]] — DoD และ Exit Gate ของ Open Beta

## Execution Contract

```text
Spec in Git
→ Review/approve spec PR
→ Create implementation issues
→ Agent reads issue + referenced specs
→ Agent creates implementation PR
→ CI/test evidence
→ Human review
→ Merge
→ Candidate release
→ Promote through channels
```

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-23 | Initial release-governance index and execution contract |
