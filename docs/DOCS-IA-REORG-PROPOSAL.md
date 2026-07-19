# Docs IA Reorg Proposal

## Goal

ลดความกระจายของเอกสาร, ทำให้มี canonical location ชัดเจน, และทำให้คนใหม่ตอบได้เร็วว่า “เอกสารไหนคือ source of truth”

## Problems Before Reorg

- เอกสาร product, architecture, validation, และ research กระจายอยู่ทั้ง root และ `docs/`
- naming scheme ปนกันระหว่างชื่อเต็ม, ชื่อมีเลขนำหน้า, และชื่อเฉพาะกิจ
- root repo มีเอกสารจำนวนมากเกินไปจนบังไฟล์ที่เกี่ยวกับ source/project จริง
- reference ภายใน repo ชี้ path แบบ legacy หลายแบบ

## Information Architecture

- `docs/product/`
  - `docs/product/` — product, business, requirements, roadmap
- `docs/architecture/`
  - `docs/architecture/` — stack, specs, TDD, ADR, spike
- `docs/features/`
  - `docs/features/` — feature/module specs
- `docs/operations/`
  - `docs/operations/` — validation, audits, operational artifacts
- `docs/guides/`
  - `docs/guides/` — reusable guides
- `docs/research/`
  - `docs/research/` — concepts และ supporting research

## Migration Rules

1. ย้ายเอกสารให้ตรงหมวดก่อน
2. อัปเดต internal references ให้ชี้ canonical path
3. ลดการพึ่งชื่อไฟล์แบบมีเลขลำดับ ถ้าไม่ได้ช่วยด้าน workflow จริง
4. เก็บเอกสารเก่าไว้ได้ แต่ต้อง mark ว่าเป็น legacy เมื่อมี canonical ตัวใหม่แล้ว

## Notes

- รอบนี้เน้น structure และ discoverability ก่อน
- การ merge เนื้อหา duplicate ควรทำในรอบถัดไปหลังทีมยืนยัน source of truth

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | — | IA reorg proposal ฉบับแรก (untracked) |
| 0.1.1 | 2026-07-19 | link/metadata sweep (G15-T2): converted directory wikilinks (`docs/product/` etc.) to plain backtick path text — they are directories, not resolvable docs |
