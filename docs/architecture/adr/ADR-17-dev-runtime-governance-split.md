---
title: "ADR: Dev & Runtime Governance Split — RWANG builder · G-Orchestra governor · skill→harness release"
doc_id: ADR-17-dev-runtime-governance-split
status: accepted
version: 1.0.1
updated: 2026-07-20
owner: Boss
source_of_truth: true
related_docs: "[\"ADR-11-optin-data-contribution-flywheel\", \"ADR-12-community-ai-marketplace\", \"SPEC--RUNTIME-REPAIR-GOVERNANCE\", \"PROJECT_FEATURE_MAP\"]"
approved_by: Boss
approved_date: 2026-07-19
---

# ADR-17: Dev & Runtime Governance Split

> ตัดสินใจโดย Boss ใน working session 2026-07-19 — รวบข้อสรุปสถาปัตยกรรม governance
> ทั้งฝั่ง dev (RWANG) และฝั่ง runtime (G-Orchestra) ที่ก่อนหน้านี้กระจายอยู่ในบทสนทนา/memory

## 1. Context

ระบบนิเวศมี 3 สิ่งที่บทบาทเคยเบลอ: **RWANG** (มีทั้ง skill 6 ตัว, repo `G:\Rwang`,
repo เก่า `Rwang_remote`, และ PROMAX ที่ `D:\rwang\RWANG-PROMAX-skills`), **G-Orchestra**
(`orchestration/` — เดิมเป็น mission control + account pool), และ **G-Maiden** (ตัวโปรดักต์).
คำถามที่ต้องปิด: ใครคุมอะไร, ยุบอะไรได้, แยก tier ขายยังไง, และ knowledge infrastructure
(metadata/graph/shared context/project state) เป็นของใคร.

## 2. Decisions

### D1 — Two-plane model: RWANG คุม knowledge plane / G-Orchestra คุม policy plane

- **Knowledge plane** (metadata, wikilink/symbol graph, shared context, project state, MEMORY)
  = ของ **RWANG (builder)** — ผู้สร้างทั้ง G-Maiden และ G-Orchestra
- **Policy plane** (capability manifest, runbook, whitelist, handoff rules)
  = ของ **G-Orchestra (governor)**
- สิ่งเดียวที่ข้าม plane ได้คือ **artifact ที่ compile + sign แล้ว** — runtime governor
  บนเครื่องผู้ใช้**ห้ามเห็น** knowledge plane สด (มิฉะนั้นเอกสารกลายเป็น attack surface)

### D2 — G-Orchestra = runtime self-debug governor (บทบาทหลักใหม่)

เดิมเป็น mission control + account pool → บทบาทรับน้ำหนักคือ **self-debug system ที่ ship
กับ production G-Maiden**: local LLM วางแผนแก้ปัญหาเฉพาะเครื่อง (install-specific) ที่ release
กลางแก้ไม่ได้ — ภายใต้ governance เพราะ ollama ไร้ gov บนเครื่องผู้ใช้ = อันตราย.
กฎออกแบบ **Narrow Rails**: LLM เป็น classifier + slot-filler ใน runbook ล็อกขั้น 1-2-3-4
ที่ประกาศล่วงหน้า — ไม่ใช่ planner อิสระ. รายละเอียดเต็ม (repair whitelist, 6 handoff triggers,
anti-misuse, executor-agnostic contract 3 calls) อยู่ที่
`orchestration/docs/SPEC--RUNTIME-REPAIR-GOVERNANCE.md`.

### D3 — G-Orchestra เป็น executor-agnostic: RWANG คือ executor ตัวหนึ่ง ไม่ใช่ส่วนของ governor

ผู้ใช้อื่นอาจใช้ LangGraph/Graphiti/orchestrator อื่นเป็น executor บน pipeline ของ G-Orchestra ได้
— governor ตัดสินว่า codebase นั้นเปิด feature ไหนได้โดยไม่ทำลายระบบเดิม. **ไม่ยุบ RWANG
เข้า G-Orchestra** และไม่ยุบเข้า G-Maiden repo.

### D4 — RWANG consolidation

- `G:\Rwang` (`Rwang-orchestrator.git`) = **ตัว active** (control plane + ollama tiers);
  `G:\GenesisBlock_Dev\Rwang_remote` (`RWANG.git`) = **legacy → archive** (เช็ค VRAM guard
  migrate ครบก่อน)
- Skill ยุบเหลือตัวเดียว: **RWANG PROMAX** (`D:\rwang\RWANG-PROMAX-skills`, umbrella `rwang`
  v2.1.x) แทน legacy 6 ตัว — ยังไม่ติดตั้ง global (pending)
- **ห้าม fork skill เป็น edition ฟรี/เสียเงิน** — governance ห้ามเป็นของ premium, skill บังคับ
  paywall ไม่ได้, fork = methodology SSOT drift

### D5 — Business model: แจก methodology ขาย machinery

Methodology (PROMAX skill, 12-stage/7-phase) = ฟรี สร้าง adoption; ของขาย = **machinery**
(`G:\Rwang` harness: autonomous execution, cost-tier routing, monitor, hosted/account pool)
ผ่านสาย G-Orchestra product. Precedent ตลาด: Graphite (CLI ฟรี + per-seat service),
LangGraph (framework ฟรี + Platform/LangSmith). Graphite **ไม่ใช่**คู่แข่งตรง (ชั้น PR-review
ของทีมมนุษย์); ช่อง runtime self-repair governor สำหรับ consumer desktop ยังว่าง.

### D6 — Release pipeline: pilot-as-skill → harden → release-via-harness

Skill = สนามทดลอง (iterate เร็ว, blast radius ต่ำ) → debug + ปิดช่องโหว่ + optimize →
release จริงผ่าน harness เท่านั้น. พิสูจน์แล้วในเซสชันนี้กับ **codedoc-aligner**
(false-pass → hardened → 3-path verified). การที่คน copy skill ได้ = การตลาด ไม่ใช่ความสูญเสีย.

### D7 — Knowledge scan ใช้ Genesis Block Cycle ไม่สร้างใหม่

- **Stage 1–12 (Block Decomposition ↓)** = สแกน code → knowledge atoms / Symbol Graph
  (ใช้ผ่าน `RWANG:scan` L1/L2 — L1 มี docs-vs-code drift ในตัว)
- **P0–P6 (Block Assembly ↑)** = ใช้ตอน**สร้าง**แต่ละ work item หลังผ่าน scan gate + Master Plan
- ไม่สร้าง docscan/codescan skill แยกใหม่ — `codedoc-aligner` ทำหน้าที่ drift-detector
  ที่ป้อน evidence เข้า L1

### D8 — Doc governance ฝั่ง G-Maiden (บังคับใช้แล้วในเซสชันนี้)

- SSOT boundary สองโปรดักต์ + กติกา atoms-derived docs → `docs/README.md` §ขอบเขต SSOT
- มาตรฐาน frontmatter กลาง (ยึดแบบ FEAT/ADR/CR) + migration แบบ lazy → `docs/README.md`
- Changelog + version ท้ายเอกสารทุกครั้งที่แก้ → codedoc-aligner SKILL.md Step 5
- Symbol Graph Link Protocol (evidence links) → SKILL.md Step 4

## 3. Consequences

- (+) บทบาทชัด: builder/governor/product ไม่กินพื้นที่กัน; ตัดสินใจ "ของใหม่ไปอยู่ไหน" ได้ทันที
- (+) ทางขายชัดโดยไม่ paywall ความปลอดภัย
- (−) ต้อง maintain contract ระหว่าง plane (compile/sign step) เพิ่มหนึ่งรอยต่อ
- (−) Pending งาน migration จริง: ติดตั้ง PROMAX + retire legacy 6, archive Rwang_remote,
  รัน L1 scan กับ G-Maiden, reconcile VERSION-GOVERNANCE ↔ in-doc standard

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-07-19 | บันทึก 8 decisions จาก working session (two-plane, Narrow Rails, executor-agnostic, RWANG consolidation, business model, skill→harness pipeline, Genesis Block Cycle mapping, doc governance) |
| 1.0.1 | 2026-07-20 | approval evidence backfill (G25-T3) — `approved_by`/`approved_date` set from in-body sign-off evidence: "ตัดสินใจโดย Boss ใน working session 2026-07-19" (line 14) |
