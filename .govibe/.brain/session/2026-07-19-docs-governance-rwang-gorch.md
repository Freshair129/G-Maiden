# Session 2026-07-19 — docs sync v0.13.0 · wikilink/symbol graph · codedoc-aligner hardening · governance architecture (ADR-17)

## Entry point

Boss สั่ง "อัพเดทเอกสารให้ตรงกับ codebase `docs/`" — จากนั้น arc ยืดเป็น: wikilink+symbol-link
ทั้ง repo → ตรวจ/แก้ codedoc-aligner → วางมาตรฐาน doc governance → ถกสถาปัตยกรรม
RWANG/G-Orchestra จนตกผลึกเป็น **ADR-17**.

⚠️ **มี session ขนาน ("Luna"/Fable) ทำงานพร้อมกันตลอดวัน** — commit ไปหลายรอบ
(README/LICENSE, CI test-gate + lockfiles, version-manifest sync 0.13.0, encoding fix + wikilink,
codedoc-aligner สร้าง+manifest, Symbol Graph Protocol) และตอนปิด session ยังถือไฟล์ Rust dirty อยู่
(`lib.rs` ใหม่, `main.rs`, `gsi.rs`, `dxgi.rs`, `capture_wgc.rs`, perf fixtures) + SPEC ใหม่ 4 ตัว
(`SPEC--RUNBOOK`, `SPEC--CONTEXT-SCOPING`, `SPEC--POOL-CLAIM-LEASE`, `SPEC--model-routing`)
— ฝั่งเราเลี่ยงชนด้วยการสร้างไฟล์ใหม่/แตะเฉพาะไฟล์ของเรา

## Arc (ทำไม ไม่ใช่แค่ทำอะไร)

1. **Docs sync v0.13.0** — roadmap ยังค้าง v0.10.0; อัปเดต status header + shipped log
   v0.11.0→v0.13.0 + แก้ "Now" (NFR CPU/RAM ปิดแล้ว เหลือ FPS ที่ Boss-run) + feature map
   (G-Store catalog seeded, overlay merged, voice 24/24). Agent sweep docs/features+architecture
   เจอ stale 4 ไฟล์ (G-Motion heading-aware, damage self_burst wired, G-Master ได้ enemies จริง,
   overlay merge) — แก้แล้วทั้งหมด
2. **Wikilink + symbol link ทั้ง repo** — 6 background agents กวาด 83 ไฟล์ docs/ ตาม slug map
   กลาง (สร้างที่ scratchpad); convention: `[[slug]]` cross-doc + `file:///` symbol links
   ที่ verify การมีอยู่ก่อนใส่ทุกตัว
3. **codedoc-aligner: ตรวจ→พบไม่ถูกบังคับใช้จริง→harden** — สรุปคือ skill ที่ Luna สร้างมี
   false-pass ร้ายแรง (model 404 → รายงาน "aligned!" exit 0) + SKILL.md สอน flags ที่ script
   ไม่รับ + ไม่อยู่ใน `.claude/skills/` (harness มองไม่เห็น). แก้ครบ + review รอบสอง ปิดช่องโหว่
   6 จุด (เด่นสุด: **Thai token undercount** — `split()` นับคำจากช่องว่างแต่ไทยไม่มีช่องว่าง →
   chunk ทะลุ num_ctx โดน truncate เงียบ; แก้เป็น `max(words*1.3, chars/3.5)`) + optimize 4 จุด
   (keep_alive 10m, dedupe ก่อน rollup, ข้าม rollup เมื่อ finding เดียว, เตือน C×D)
4. **Doc governance ตกผลึก 3 ชั้น** — (a) Step 5 SOP: ทุกการแก้เอกสาร bump version + แถว
   `## Changelog` ท้ายไฟล์, (b) SSOT boundary สองโปรดักต์ + กติกา atoms-derived (ห้ามแก้ .md
   ที่ compile จาก `gks/atoms*.json`), (c) มาตรฐาน frontmatter กลาง (ยึดแบบ FEAT/ADR/CR,
   migration แบบ lazy, audits/rca ยกเว้น) — ทั้งหมดลง `docs/README.md` (0.1.0→0.3.0)
5. **สถาปัตยกรรม governance (การถกที่ยาวสุด)** — Boss แก้ความเข้าใจผมหลายรอบ:
   - RWANG มี **สอง repo**: `G:\Rwang` = active control plane (ollama tiers ครบ) /
     `Rwang_remote` = stale → archive. ผมชี้ผิดตัวไปหนึ่งรอบ (จดเป็น memory แล้ว)
   - G-Orchestra ไม่ใช่แค่ dev tool — บทบาทรับน้ำหนักคือ **runtime self-debug governor**
     ship กับ production (local LLM แก้ปัญหาเฉพาะเครื่องใต้ governance เพราะ ollama ไร้ gov
     = อันตราย) → เขียน `SPEC--RUNTIME-REPAIR-GOVERNANCE.md` (Narrow Rails, whitelist,
     6 handoff triggers, anti-misuse, executor-agnostic 3-call contract)
   - **RWANG PROMAX** (`D:\rwang\RWANG-PROMAX-skills`) = umbrella รวม legacy 6 skill —
     ยังไม่ติดตั้ง global; Genesis Block Cycle (Stage 1–12 ↓ scan → knowledge / P0–P6 ↑ build)
     คือคำตอบของ "สแกน doc+code" — **ไม่สร้าง scanner ใหม่**
   - Business: ห้าม fork skill ฟรี/เสียเงิน — แจก methodology ขาย machinery (precedent:
     Graphite CLI-free/seat-paid, LangGraph framework-free/platform-paid; Graphite ไม่ใช่
     คู่แข่งตรง — ชั้น PR-review มนุษย์)
   - ทั้งหมดรวบเป็น **ADR-17** (8 decisions, Accepted)

## สิ่งที่ทำ (ไฟล์ · สถานะ commit)

- **Committed แล้ว (โดยเรา):** `5106e6c5` codedoc-aligner hardening · `ffbd2285` USECASE.md
- **Committed แล้ว (โดย session ขนาน แต่รวมงานเรา):** `cff3e11d`/`0dce6d41`/`12a17cf9` ช่วงกลางวัน
- **Uncommitted (ของเรา รอ commit):**
  - `.agents/skills/codedoc-aligner/SKILL.md` — กู้ exit-code table ที่ Luna เขียนทับ + Step 5 SOP
  - `.agents/skills/codedoc-aligner/USECASE.md` — UC2 ปิดงานด้วย Step 4+5
  - `docs/README.md` — SSOT boundary + frontmatter standard + changelog (0.3.0)
  - `docs/product/business-requirements.md` — สาธิต Step 5 (0.2.0→0.2.1)
  - `docs/architecture/adr/ADR-17-dev-runtime-governance-split.md` — ใหม่
  - `orchestration/docs/SPEC--RUNTIME-REPAIR-GOVERNANCE.md` — ใหม่
  - `.govibe/.brain/` session + todo-next (ไฟล์นี้)
- **Mirror `.claude/skills/codedoc-aligner/`** sync แล้ว (local-only, .claude ถูก gitignore)

## Verify

| Gate | ผล |
| --- | --- |
| codedoc-aligner unit checks (Thai tokens, hard-split, parse semantics, dedupe) | ✅ ผ่านหมด |
| codedoc-aligner E2E conflict (hello/goodbye) | ✅ HIGH 1 finding เดียว (anti-fabrication ทำงาน — รอบก่อนแต่ง 3), exit 1 |
| codedoc-aligner E2E aligned / bogus-model | ✅ exit 0 / preflight FATAL exit 2 ทันที |
| cargo test / tsc / vitest | ❌ ไม่ได้รัน — session นี้ไม่แตะ src โค้ดหลัก (ยกเว้น: session ขนานแตะอยู่ อย่าทับ) |

## State ปลาย turn

- branch `main` ahead of origin **หลาย commit ไม่ push** (ของสอง session รวมกัน)
- tree มีของสอง session ปน — ห้าม `git add -A` เด็ดขาด ตอน commit ต้องระบุไฟล์
- **Drift ที่พบใน shared context (ยังไม่แก้ — รอ Boss สั่ง):**
  - `CLAUDE.md:5` — "Status: implemented (v0.9.0)" → จริงคือ **v0.13.0**
  - `AGENTS.md:179` — "bump version in 3 places" → จริงคือ **5 ที่** (CLAUDE.md แก้แล้วโดย
    session ขนาน: + root `package.json` + `src-tauri/Cargo.toml`)

## Next (เรียงตาม leverage)

1. 🔴 **เทียบกับ `G:\govibe`** — งานที่ Boss สั่งไว้ท้าย session **ยังไม่เริ่ม** (จงใจ — กัน context
   บวมก่อน checkpoint) เริ่ม session ใหม่ให้อ่าน checkpoint นี้ก่อนแล้วค่อยเปิด GoVibe
2. ติดตั้ง RWANG PROMAX → `~/.claude/skills/` + retire legacy 6 · รัน `RWANG:scan` L1 กับ
   G-Maiden (แปลงงานวันนี้เป็น evidence มี hash) · reconcile VERSION-GOVERNANCE ↔ in-doc standard
3. commit ไฟล์ค้าง 6+ ไฟล์ (ระบุชื่อไฟล์ ห้าม -A) · แก้ drift CLAUDE.md/AGENTS.md เมื่อ Boss สั่ง
4. Archive `Rwang_remote` (หลังเช็ค VRAM guard migrate) · spec `doc-graph-maintenance`
   เป็นงานแรกของ `G:\Rwang` harness เต็มตัว
