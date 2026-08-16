---
title: "เทียบ GoVibe ↔ G-Maiden: doc governance · context/brain · ตำแหน่งใน ADR-18 + ข้อเสนอ unify"
doc_id: "2026-07-19-govibe-gmaiden-governance-comparison"
status: "draft"
version: "0.2.0"
updated: "2026-07-19"
owner: "Boss"
related_docs: ["ADR-18-dev-runtime-governance-split", "SPEC--RUNTIME-REPAIR-GOVERNANCE", "subagent-context-scoping"]
---

# เทียบ GoVibe ↔ G-Maiden — รายงาน 3 แกน + ข้อเสนอ unify

> วิธีทำ: 3 agents อ่านคู่ขนาน (doc governance / context-brain / ADR-18 position) อ่านไฟล์จริง
> ทั้งสองฝั่ง + ทดสอบ drift จริง + reality-check โค้ด ไม่ใช่อ่านแค่ที่เอกสาร claim.
> ทุก claim ในรายงานนี้มี citation ในผลดิบของ agent (เก็บใน session transcript 2026-07-19)

## Executive summary

1. **Doc governance:** decision "in-doc SSOT, no registry" ของ G-Maiden **ยืนได้** — registry ของ
   GoVibe ไม่ drift ที่ตัวแถวเพราะมี **validator script** บังคับ แต่ drift จริงทุกจุดที่ script
   ไม่คลุม (changelog ลำดับพัง, หาย 3 เวอร์ชัน, ไฟล์ลืม register = ล่องหน) → บทเรียน:
   **สิ่งที่ช่วย GoVibe ไว้คือ validator ไม่ใช่ registry** — เราต้องมี structural validator
   ของ in-doc invariant เป็นสคริปต์ ห้ามพึ่ง SOP วินัยเอเจนต์อย่างเดียว
2. **Context/brain:** `.govibe/.brain` ของ G-Maiden คือ **fork ของ convention GoVibe จริง**
   (atoms byte-identical) — แล้วแยกทางกัน: ฝั่งเรา drift ไปทาง practical (rolling todo, verify
   table, end-session skill, auto-memory) และ**ใช้งานสดถึงวันนี้ (31 sessions)** ส่วน brain
   ต้นทางของ GoVibe **ถูกทิ้งร้างตั้งแต่ 2026-06-19** (CLAUDE/AGENTS ของมันไม่อ้างถึงเลย)
3. **ตำแหน่ง (แก้ตาม intent ที่ Boss ชี้แจง 2026-07-19):** ความสัมพันธ์คือ **succession** ไม่ใช่
   subordination — **RWANG = engine** (พัฒนา multi-agent ให้สำเร็จก่อนแบบ standalone) →
   **GoVibe = platform ที่รับช่วงต่อ** (RWANG เข้าไปทำงานข้างใน; อุปมา git ↔ GitHub) สะพาน
   รับช่วงเริ่มสร้างแล้วจริง: `G:\Rwang\specs\A1-runs-view.yaml` ให้ Mission Control อ่าน
   `runs/*/progress.json` ของ RWANG (read-only) เพื่อ retire monitor.html — ความขัดแย้ง
   ADR สองฉบับที่รายงาน 0.1.0 ชี้ไว้ **ชนน้อยลงมาก** เมื่อแยกโดเมน: GoVibe governance =
   dev-time platform / G-Orchestra governor = runtime บนเครื่องผู้ใช้ — เหลือแก้แค่ถ้อยคำ
   ใน PRD ของ GoVibe (เลิกคำกว้าง "central governance" → "dev-time multi-agent platform
   hosting the RWANG engine")
4. **แก้ premise หนึ่งจุด:** สิ่งที่ sign-off `2.3.0+ga` คือ **STD-Execution-Governance**
   (Access Scope H0–H4) — ตัว `STD-Document-Versioning-Governance` เองยัง **draft 0.1.2
   ไม่เคย sign-off** ทั้งที่ govern ทุกไฟล์มา ~1 เดือน

## แกน 1 — Doc governance

| มิติ | GoVibe | G-Maiden (มาตรฐานใหม่ 2026-07-19) |
| --- | --- | --- |
| Version location | 2–3 ที่ (frontmatter + registry + prose header) sync ด้วย script | **ที่เดียว in-doc** (frontmatter ↔ แถวล่าสุด changelog) |
| Semantic bump rules | ❌ ไม่มี (registry bump 56 patch/25 วัน) | ✅ patch/minor/major ตามชนิดการแก้ |
| Status enum | ✅ นิยามครบ §13 + แยก bookkeeping markers | ⚠️ หลวม (`Accepted` casing ปนกัน, ไม่มี transition rule) |
| Sign-off flow | ✅ `+draft` → drop-on-approval + audit trail | ❌ ไม่มี — ไม่รู้ใครอนุมัติเมื่อไหร่ |
| Enforcement | ✅ `validate-docs.mjs` = hard error + diff gate | ❌ SOP + LLM advisory (codedoc-aligner) เท่านั้น |
| Semantic drift (code↔doc โกหกกันไหม) | ❌ เช็คได้แค่ version string ตรง | ✅ codedoc-aligner (Mellum2) |
| Migration | normalize-on-touch + sweep ค้าง | ✅ lazy + point-in-time exempt (audits/rca) |

**Verdict: base = G-Maiden in-doc / adopt จาก GoVibe 5 ชิ้น:**
(1) status lifecycle enum แบบ §13 (นิยาม + casing เดียว) (2) sign-off marker (`approved_by`/
`approved_date` หรือ `+draft` convention) (3) **structural validator script** เช็ค frontmatter↔
changelog + schema + enum — port แนวคิด `validate-docs.mjs` (4) diff gate (code เปลี่ยนต้องแตะ
doc) เป็นชั้น structural ใต้ codedoc-aligner ที่เป็นชั้น semantic (5) legacy mapping table สำหรับ
normalize blockquote header — และ registry แบบ GoVibe ถ้าอยากได้ "หนึ่งหน้ามองทั้ง repo"
ให้เป็น **derived/generated view** จาก frontmatter (ห้าม hand-maintained)
→ หมายเหตุ: `tools/doc-graph/` (spec G1 PILOT-1 ที่เขียนแล้ว) คือครึ่งแรกของ validator ข้อ (3) พอดี

## แกน 2 — Context/brain

**โครงเทียบ:** GoVibe มี `inbound/` (staging queue) + `knowledge-block/` vault เต็มรูป
(~30 typed dirs + `atomic_index.jsonl` + `genesis-graph.jsonl`) ที่ G-Maiden ไม่มี /
G-Maiden มี rolling `todo-next.md` + session narrative แบบ Arc+Verify + **end-session skill**
+ **cross-session auto-memory** (MEMORY.md + one-fact-per-file + wikilinks) ที่ GoVibe ไม่มีเลย

**สถานะ 4 concepts ของ GoVibe (reality-checked):**
| Concept | สถานะ | หลักฐาน |
| --- | --- | --- |
| Hybrid JIT Context | 🟡 PARTIAL | machinery อยู่ repo ที่สาม (`cognitive_system` MSP); renderer slice ใน govibe |
| Hybrid Retrieval FTS | 🟢 IMPLEMENTED | `msp/src/cognitive/fts.ts` + tests (pure-Node ~70 บรรทัด) |
| Human-First Atom Extraction | 🟢 แกนหลักจริง | `scripts/mcp/translator/` (code-AST atomizer + fidelity gate + tests) |
| Access Scope H0–H4 | 🟠 PAPER — prompt-level เท่านั้น | ไม่มี code enforcement; AGENTS.md ของ GoVibe เองยัง stale (สอน H0–H6 เก่า) |

**Conflict สำคัญสุด (🔴 กระทบเราโดยตรง):** ความหมายแกน **H ชนกันสามชั้น** — STD 2.3.0 ที่
Boss sign-off แล้ว (2026-07-10) นิยาม H = **Access Scope H0–H4** (เพดาน capability:
read→search→write→shell→network+approval), compaction = **CH1–CH5**, retrieval radius =
**R0–R6** — ขณะที่ auto-memory ของ G-Maiden (`hdt-axes`, `genesis-block-atom-model`) ยังจำ
H = context-hop H0–H6 แบบเก่า → **memory ฝั่งเรา stale ต้องแก้** (แก้แล้วท้ายรายงานนี้)

**Adopt (เรียง value/effort):** G-Maiden ← (1) vocabulary H0–H4/CH/R ตาม STD ที่ sign-off
(2) `atomic_index.jsonl` pattern — `todo-next.md` โตถึง 581 บรรทัดจน truncate = ถึงเวลา index
(3) ยก `fts.ts` มา scan docs+brain (4) RCA frontmatter+changelog / GoVibe ← end-session skill,
rolling todo, auto-memory, honest verify table + แก้ AGENTS.md ตัวเองให้ตรง STD
**ควรรวม schema เดียว: ใช่** — narrative core (Entry/Arc/Verify/State/Next) บังคับ,
YAML gate block เป็น optional สำหรับ repo ที่รัน fleet

## แกน 3 — ตำแหน่งใน ADR-18

**GoVibe วันนี้คือ:** spec/methodology project + PoC 2 ชิ้นที่รันจริง (Mission Control React UI,
MCP server scaffold + translator slice) — **ไม่ใช่ live product**; Tauri shell ที่ SDD สัญญา
ไม่มีอยู่จริง; feature freeze ตั้งแต่ 2026-06-22 (หลังจากนั้น docs/governance ล้วน);
`.rwang/` overlay ติดตั้งแล้ว (RWANG govern repo นี้อยู่แล้วโดยพฤตินัย)

**Overlap:** ทับ **knowledge plane หนักสุด** (SYSTEM-08 GKS/atoms/symbol-graph = สิ่งเดียวกับที่
ADR-18 D1 มอบให้ RWANG และ D7 ให้วิ่งผ่าน `RWANG:scan`) / STD-Execution-Governance คือ
methodology ของ RWANG โดยสายเลือดอยู่แล้ว (อ้าง RWANG RFC ตรง ๆ) แค่ไฟล์อยู่ผิดบ้าน /
**ไม่ทับ** runtime governor (ไม่มีสักบรรทัดเรื่อง signed manifest/Narrow Rails/repair)

**สามเหลี่ยม MCP เดิม (G-Orch ↔ GoVibe ↔ GenesisDB) ตายแล้ว:** เอกสาร GoVibe ปัจจุบัน
ไม่เอ่ยถึง G-Orchestra/G-Maiden เลย (grep = 0) และลด GenesisDB เป็น swappable storage driver

**ตำแหน่งตามโมเดล succession (superseded ข้อเสนอเดิมของ 0.1.0):** RWANG = engine ที่ต้อง
สำเร็จก่อน / GoVibe = platform ที่รับช่วง operational surface — เส้นแบ่ง scope ถาวร:

| ชิ้น | เจ้าของ | หมายเหตุ |
| --- | --- | --- |
| Execution engine (loop VERIFY→AUTHOR→REVIEW→ASSEMBLE, tier router, account rotation, verify gate, cost ledger) | **RWANG ตลอดไป** | ต้อง headless/embeddable; GoVibe ประกาศเอง "not an orchestrator" (PRD §1) |
| Methodology (Genesis Block Cycle, C/H/W/T, scan L0–L2, STD-Execution-Governance) | **RWANG** (แจกผ่าน PROMAX) | STD อ้าง RWANG RFC อยู่แล้ว — ยกไฟล์กลับบ้าน |
| Run/progress schema (`runs/*/progress.json`+ndjson) | **RWANG นิยาม / GoVibe บริโภค** | **contract ของการรับช่วง** — A1: "read it, never write it" |
| Mission Control UI (runs/graph/roadmap/agents) | **GoVibe** | รับช่วง monitor จาก RWANG (A1 กำลังเกิด) |
| MCP/A2A interop + Translator/GKS interlingua | **GoVibe** | differentiator แท้ (ADR-017-GoVibe) |
| Knowledge vault hosting (knowledge-block, atomic_index, JIT render, FTS) | **GoVibe host / RWANG produce** | RWANG:scan ผลิต atoms → GoVibe เก็บ+เสิร์ฟ+วาด |
| Governance UX (approval/sign-off/gate หน้าจอ) | **GoVibe = หน้าจอ** — policy source คือ RWANG methodology | ตรง PRD §4.8 "Mission Control should not own business rules" |
| Runtime self-repair governor | **G-Orchestra — ไม่เปลี่ยน** (ADR-18 D2) | คนละ threat model กับ dev-time ทั้งคู่ |

**กติกาการรับช่วง:** สิ่งที่ย้าย = operational surface (ดู/สั่ง/อนุมัติ/เชื่อมต่อ); engine internals
+ methodology SSOT **ไม่ย้ายตาม** — GoVibe เรียก RWANG ผ่าน contract (`agent.run` MCP →
dispatch เข้า runner) ห้าม re-implement loop (ไม่งั้นได้ orchestrator ตัวที่สอง = แผลเดิม)

## ข้อเสนอ unify — แยก mechanical vs Boss decision

**Mechanical (สั่งได้เลย ไม่ต้องถกเพิ่ม):**
1. ยก `STD-Execution-Governance` เข้า RWANG PROMAX เป็น canonical; สำเนาใน govibe เป็น pointer
2. เพิ่ม status enum + sign-off field เข้า frontmatter standard ของ G-Maiden (`docs/README.md`)
3. ขยาย G1 doc-graph (PILOT-1) phase ถัดไป → structural validator + diff gate (ปิดช่อง SOP-only)
4. Sync แกน H: แก้ auto-memory stale + ประกาศ H0–H4/CH/R เป็น vocabulary กลางทุก repo
5. GoVibe adopt end-session skill + rolling todo + auto-memory (ฟื้น brain ที่ตายแล้ว)
6. ยก `fts.ts` + `atomic_index.jsonl` pattern เข้าฝั่ง G-Maiden brain/docs

**Boss decision (product-level — mechanical merge ไม่ได้):**
1. ~~ADR ชนกันต้องเลือก supersede~~ → **ลดเหลือแก้ถ้อยคำ** (ตัดสินโดยโมเดล succession ที่ Boss
   ชี้แจง 2026-07-19): แก้ PRD/BRD ของ GoVibe จาก "central governance layer" เป็น "dev-time
   multi-agent platform hosting the RWANG engine" — งานแก้เอกสารฝั่ง GoVibe ตาม Step-5 SOP
2. **ชะตากรรม SDD desktop shell:** descope ทิ้ง หรือให้ Mission Control เป็น module ใน
   G-Orchestra Tauri app (`orchestration/`)?
3. **Branding:** GoVibe ไม่มี `G-` prefix ตาม ADR-01 — ดึงเข้า G-series ทางการหรือไม่

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-19 | รายงานแรก — สังเคราะห์จาก 3 agent axes (doc governance / context-brain / ADR-18 position) + ข้อเสนอ unify 6 mechanical + 3 Boss decisions |
| 0.2.0 | 2026-07-19 | แก้แกน 3 ตาม intent ที่ Boss ชี้แจง: โมเดล **succession** (RWANG=engine → GoVibe=platform รับช่วง, contract=progress schema+MCP) แทน "GoVibe สังกัด RWANG"; ตาราง scope split ถาวร 8 ชิ้น; ADR-conflict ลดเหลือแก้ถ้อยคำ PRD |
