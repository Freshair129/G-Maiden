# G-Maiden Docs

เอกสารในโปรเจคนี้ถูกรวมไว้ที่ `docs/` และแบ่งตามหน้าที่ เพื่อให้รู้เร็วว่า “ควรอ่านอะไรก่อน”

## เริ่มจากตรงนี้

- [[docs/product/]]
  - ถ้าอยากเข้าใจภาพรวม product: ไปที่ `docs/product/`
- [[docs/architecture/]]
  - ถ้าอยากเข้าใจสถาปัตยกรรมและการออกแบบระบบ: ไปที่ `docs/architecture/`
- [[docs/features/]]
  - ถ้าอยากดูสเปกเชิงโมดูล: ไปที่ `docs/features/`
- [[docs/operations/]]
  - ถ้าอยากดู validation, audit, หรือเครื่องมือภาคสนาม: ไปที่ `docs/operations/`
- [[docs/guides/]]
  - ถ้าอยากดูคู่มือหรือแนวปฏิบัติ: ไปที่ `docs/guides/`
- [[docs/research/]]
  - ถ้าอยากดู concept/research รอง: ไปที่ `docs/research/`

## Canonical Starting Points

- [[one-pager]]
  - Product overview: `docs/product/one-pager.md`
- [[product-requirements]]
  - Product requirements: `docs/product/product-requirements.md`
- [[software-requirements-specification]]
  - System requirements: `docs/product/software-requirements-specification.md`
- [[roadmap]]
  - Roadmap: `docs/product/roadmap.md`
- [[tech-stack]]
  - Tech stack: `docs/architecture/tech-stack.md`
- [[engineering-spec]]
  - Engineering spec: `docs/architecture/engineering-spec.md`
- [[technical-design-document]]
  - Technical design document: `docs/architecture/technical-design-document.md`
- [[features/README]]
  - Feature specs: `docs/features/README.md`

ดูสารบัญละเอียดที่ [[DOC-INDEX]] (`docs/DOC-INDEX.md`)

## ขอบเขต SSOT: สองโปรดักต์ในหนึ่ง repo

repo นี้มี**สองโปรดักต์**ที่มีเอกสารแยกกันโดยตั้งใจ:

| | G-Maiden (player app) | G-Orchestra (dev tool) |
| --- | --- | --- |
| เอกสาร | `docs/` | `orchestration/docs/` |
| สาย ADR | `ADR-10..16` | `ADR-O-001..006` |
| **source of truth** | ไฟล์ `.md` แก้ตรงได้ (+ Changelog ท้ายเอกสารตาม SOP) | **`orchestration/gks/atoms*.json`** — ไฟล์ `.md`/backlog หลายตัวเป็น *derived* ถูก compile ทับได้ |
| สะพานรวม | [[DOC-INDEX]] section `## Orchestration` มองเห็นทั้งสองฝั่ง | |

กติกา:
1. เรื่องของ player-facing app แก้ที่ `docs/`; เรื่องของ orchestrator แก้ที่ `orchestration/`
2. จุดเชื่อมสองฝั่ง (เช่น [[SPEC--GOVIBE-INTEGRATION]]) — spec อยู่ฝั่งที่ own พฤติกรรมนั้น อีกฝั่ง**ลิงก์ไป ห้าม copy** (สำเนา = SSOT drift ทันที)
3. **ห้ามแก้ `.md` ฝั่ง orchestration ที่ derive จาก atoms โดยตรง** — แก้ `gks/atoms*.json` แล้ว compile ใหม่ ไม่งั้นงานถูกเขียนทับ

## มาตรฐาน metadata หัวเอกสาร (frontmatter)

เอกสารใหม่ทุกไฟล์ใน `docs/` ต้องเปิดด้วย YAML frontmatter ตาม schema กลางนี้
(ยึดตามแบบแผนที่กลุ่ม FEAT/ADR/CR ใช้อยู่แล้ว — ดูตัวอย่างเต็มที่ [[FEAT-G-DAMAGE]], [[ADR-16-credit-economy-and-mint-oracle]]):

```yaml
---
title: "ชื่อเอกสารเต็ม"
doc_id: "SLUG-ตรงกับชื่อไฟล์"        # ใช้เป็น wikilink target
status: "draft | active | Accepted | superseded | historical"
version: "0.1.0"                     # ต้องตรงกับแถวล่าสุดของ ## Changelog ท้ายเอกสารเสมอ
updated: "YYYY-MM-DD"
owner: "Boss"
related_docs: ["SLUG-A", "SLUG-B"]   # slug ของเอกสารที่เกี่ยว (ไม่ใส่ [[ ]])
---
```

- field เสริมตามชนิดเอกสาร: `source_of_truth: true` (SSOT docs), `amends:` (ADR), `prd_system:`/`risk:` (FEAT)
- **เอกสารเก่าที่ยังไม่มี frontmatter:** เติมเมื่อมีการแก้เนื้อหาครั้งถัดไป (ไม่ต้องกวาดทั้ง repo เพื่อเติมอย่างเดียว) — ยกเว้นเอกสาร point-in-time (audits/, rca/) ให้คงรูปเดิมได้ เพราะเป็นบันทึกประวัติศาสตร์ไม่ใช่ living doc
- เอกสาร product รุ่นแรกที่ใช้ blockquote header (`> **เวอร์ชัน:** ...`) ถือว่า valid อยู่ — ถ้าจะย้ายเป็น frontmatter ให้ย้ายทั้งก้อนในคราวเดียว ห้ามมีเวอร์ชันสองที่
- คู่กับ SOP ฝั่งท้ายเอกสาร: ทุกการแก้ต้อง bump `version:` + เพิ่มแถว `## Changelog` (ดู codedoc-aligner SKILL.md Step 5)

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | — | สารบัญ docs ฉบับแรก |
| 0.2.0 | 2026-07-19 | + section "ขอบเขต SSOT: สองโปรดักต์ในหนึ่ง repo" (G-Maiden vs G-Orchestra, atoms-derived docs rule); แปลง cross-reference เป็น wikilink |
| 0.3.0 | 2026-07-19 | + section "มาตรฐาน metadata หัวเอกสาร" — ประกาศ schema กลาง (ยึดแบบ FEAT/ADR/CR) + กติกา migration สำหรับเอกสารเก่า |
