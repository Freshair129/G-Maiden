---
title: "G-Maiden Release Governance"
doc_id: "releases/README"
status: "draft"
version: "0.3.0"
updated: "2026-10-10"
owner: "Boss"
related_docs: ["roadmap", "mvp-backlog", "release-channel-architecture", "beta-roadmap"]
---

# G-Maiden Release Governance

โฟลเดอร์นี้เป็น source of truth สำหรับ workflow, signing, release evidence และการอนุมัติส่งมอบผลิตภัณฑ์

## แผนปัจจุบัน

**Closed Beta ยกเลิกตามคำสั่งเจ้าของโปรดักต์ที่บันทึกในแผนวันที่ 2026-10-10** ให้ใช้ [[roadmap]] และ [[mvp-backlog]] เพื่อพัฒนาและตรวจรับ MVP ภายในก่อน ไม่มีการรับผู้ทดสอบหรือเปิด Wave 0–2 ตามแผนเดิม

เอกสาร Beta/Wave ด้านล่างเก็บเป็น reference ของ design และหลักฐานเดิม ไม่ใช่ลำดับงานที่กำลังดำเนินการ การยกเลิก programme ไม่ได้เปลี่ยน manifest/channel, entitlement, Terms หรือ deployed services โดยอัตโนมัติ: access/offline policy อยู่ใน MVP-004, implementation ใน MVP-008/MVP-043–045 และ release decision ใน MVP-052 แผน Open Beta/RC/GA ต้องทบทวนหลัง MVP ผ่านโดย owner

## หลักการ

1. Source code อยู่ใน repository และ `main` branch เดียว
2. Dev/Beta/Stable เป็น release channel ไม่ใช่ repository หรือ long-lived branch
3. Candidate ต้อง build และ sign ครั้งเดียว แล้ว promote artifact เดิมไป channel ถัดไป
4. งาน implementation ต้องเริ่มจาก spec ใน Git ตามด้วย GitHub Issue และจบด้วย Pull Request + test evidence
5. แต่ละ stage ใช้ Entry Gate, Definition of Done และ Exit Gate ของตัวเอง

## เอกสารหลัก

- [Release channel architecture](release-channel-architecture.md) — สถาปัตยกรรม Dev → Stable และ artifact promotion
- [[roadmap]] — แผนพัฒนาและตรวจรับ MVP M0–M6 ปัจจุบัน
- [[mvp-backlog]] — task register สำหรับส่งมอบ MVP
- [Beta roadmap](beta-roadmap.md) — ลำดับ maturity เดิมสำหรับ reference; Closed Beta ยกเลิกแล้ว
- [Public Demo](public-demo/specification.md) — ขอบเขต Public Demo
- [Wave 0 specification](closed-beta/wave-0/specification.md) — ขอบเขต Technical Preview เดิม
- [Wave 0 definition of done](closed-beta/wave-0/definition-of-done.md) — DoD และ Exit Gate เดิม
- [Wave 1 specification](closed-beta/wave-1/specification.md) — Core Intelligence Validation เดิม
- [Wave 1 definition of done](closed-beta/wave-1/definition-of-done.md) — DoD และ Exit Gate เดิม
- [Wave 2 specification](closed-beta/wave-2/specification.md) — Expanded Access and Operations Validation เดิม
- [Wave 2 definition of done](closed-beta/wave-2/definition-of-done.md) — DoD และ Exit Gate เดิม
- [Open Beta specification](open-beta/specification.md) — ขอบเขตสำหรับทบทวนหลัง MVP
- [Open Beta definition of done](open-beta/definition-of-done.md) — DoD สำหรับทบทวนหลัง MVP

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
| 0.2.0 | 2026-08-01 | Added candidate Wave 1 and Wave 2 specifications and evidence gates |
| 0.3.0 | 2026-10-10 | Recorded owner cancellation of the Closed Beta programme and routed active planning to the MVP roadmap/backlog; retained channel/security/release approval boundaries. |
