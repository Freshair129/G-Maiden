---
title: "G-Maiden Release Governance"
doc_id: "releases/README"
status: "draft"
version: "0.4.0"
updated: "2026-10-18"
owner: "Boss"
related_docs: ["roadmap", "mvp-backlog", "release-channel-architecture"]
---

# G-Maiden Release Governance

โฟลเดอร์นี้เป็น source of truth สำหรับ workflow, signing, release evidence และการอนุมัติส่งมอบผลิตภัณฑ์

## Current plan

Use [[roadmap]] and [[mvp-backlog]] for product development and acceptance. Release artifacts
remain behind the explicit candidate and promotion workflows below; source changes do not publish
or deploy a release by themselves.

## หลักการ

1. Source code อยู่ใน repository และ `main` branch เดียว
2. Dev and Stable are release channels, not repositories or long-lived branches
3. Candidate ต้อง build และ sign ครั้งเดียว แล้ว promote artifact เดิมไป channel ถัดไป
4. งาน implementation ต้องเริ่มจาก spec ใน Git ตามด้วย GitHub Issue และจบด้วย Pull Request + test evidence
5. แต่ละ stage ใช้ Entry Gate, Definition of Done และ Exit Gate ของตัวเอง

## เอกสารหลัก

- [Release channel architecture](release-channel-architecture.md) — สถาปัตยกรรม Dev → Stable และ artifact promotion
- [[roadmap]] — แผนพัฒนาและตรวจรับ MVP M0–M6 ปัจจุบัน
- [[mvp-backlog]] — task register สำหรับส่งมอบ MVP
- [Public Demo](public-demo/specification.md) — ขอบเขต Public Demo

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
| 0.4.0 | 2026-10-18 | Updated the release index to the current Dev/Stable workflow and active product planning documents. |
