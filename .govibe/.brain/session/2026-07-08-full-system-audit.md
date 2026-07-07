# Session 2026-07-08 — Independent full-system audit + level-up scoping plan

## Entry point
ผู้ใช้สั่งทำ **audit ระดับ senior/independent** ทั้งระบบ (บทบาท CTO/Architect/Security/AI/
Product/… พร้อมกัน) บน `main @ 72162e66` — หา weakness/risk/tech-debt แบบไม่ต้องเอาใจ
ท้ายเซสชันมี follow-up: (1) "ควรทำไรต่อ" → แนะนำลำดับงาน, (2) สั่งแก้ level-up ให้มีเสียง
เฉพาะเลเวลสำคัญ + ขอแผนงาน.

## Arc — เกิดอะไร ทำไม
- รัน audit แบบ **fan-out 6+ subagent ขนาน** (Rust backend ×2, frontend/UX ×2, security
  [live-DB verified], AI architecture, DevOps/docs, product/strategy) + ผม verify เองจุดเสี่ยง
  สูงสุด (`:3000` bind, TTS injection, secrets, SEC-001 RLS, CSP, CI gate). สังเคราะห์เป็น
  รายงานเดียว → `docs/audits/2026-07-07-independent-full-audit.md`.
  - **หมายเหตุ整การ overwrite:** path นี้ถูกลิสต์เป็น untracked ตั้งแต่ git-snapshot ตอนเปิด
    session (อาจเป็นไฟล์ค้างจาก session ก่อน/agent อื่น) แต่ `Write` สำเร็จแบบ create — ผม
    เขียนทับ path เดิม. ถ้ามีเนื้อหาเดิมถือว่าถูกแทนที่. เป็น untracked → git กู้ไม่ได้.
- **ธีมหลักที่ค้นพบ (สำคัญกว่ารายละเอียด):** โค้ด engineering ดีจริง แต่ feature เรือธง
  **ไม่ทำงานจริงหลายจุด + ไม่มี gate พิสูจน์ว่าทำงาน** + มีปัญหาเชิงกลยุทธ์/กฎหมายระดับ
  existential. "product ที่แกล้งทำงานในไม่กี่จุดวิกฤต".
- **ของดีที่ยืนยัน (อย่าไปรื้อ):** DXGI FFI ถูกต้อง; pure state machines (Signal/Sentry/
  announcer) testable; **SEC-001 F1 ปิดสนิทจริง — verify กับ live gstore แล้ว** (column-grant
  = {steamid64,display_name,account_id} เท่านั้น, GID/role forge ไม่ได้); privacy-first G-Log;
  `revive.rs` prompt pattern (deterministic + "ห้ามแต่งเหตุการณ์") = แบบอย่างที่ AI layer อื่น
  ควรลอก.
- Follow-up level-up: พบว่า **เสียง level-up มี 2 ทางแยกกัน** — announcer pack path
  (`announcer.rs:128`) + persona TTS path (`App.tsx:544`, พูดทุกเลเวลจริงจากทางนี้). ต้องแก้
  ทั้งคู่ + sync ชุดเลเวล (แนว STREAK_LABELS enforce-both-places). เสนอ default milestone
  `{6,12,18,25}` หรือ talent `{6,10,15,20,25}` — **รอผู้ใช้เลือก, ยังไม่ลงมือ**.

## สิ่งที่ทำ
- `docs/audits/2026-07-07-independent-full-audit.md` — **uncommitted (untracked)**. รายงานเต็ม:
  executive summary, Top-20, 9 scores, tech-debt, hidden risks, roadmap (Quick win/Medium/Major),
  + Appendix A security deep-dive (live-DB verified).
- ไม่มีการแก้โค้ดโปรดักชันใด ๆ ในเซสชันนี้ (audit + plan only).

## Verify (gate ที่รันจริง)
- **ไม่ได้รัน** `cargo test` / `tsc` / vitest / lint — เซสชันนี้เป็น read-only audit + planning,
  ไม่มี code change ให้ gate. (subagent อ่านโค้ด + ผม grep/read ตรวจ ground truth เท่านั้น.)
- **Live gstore:** security subagent รัน **read-only** `get_advisors` + SQL/grant/RLS/trigger
  introspection (ไม่มี mutation, ไม่มี migration apply, ไม่ deploy Edge Fn). ยืนยัน SEC-001 F1
  ปิดจริงบน prod.

## Key numbers / results
- โค้ด ~8,200 บรรทัด Rust + ~8,080 บรรทัด TS. Overall grade audit = **C+ (6.0)**.
- Scores: Arch 6.0 · UX 4.0 · UI 6.0 · Maintainability 5.0 · Scalability 5.5 · Security 6.0 ·
  Performance 4.5 · AI 4.5 · Docs 5.5.
- Critical ที่ verify แล้ว: **Dire-blindness** (`cv/mod.rs:16` ring color hardcode Dire-red →
  gank detection ตาย ~50% เกมเมื่อผู้เล่นอยู่ Dire); **stub latency gate** (`tests/perf/src/main.rs`
  sleep=budget → PASSED เสมอ); **CI รัน 0 test** (146 test ไม่เคยรัน); **release ไม่มี test gate**;
  grounded engines (`damage.rs`, `counter_advice`) ไม่ถูก wire; `counter_advice_text(&[])` เรียก
  ว่างเสมอ; **CSP ไม่มี origin Supabase** → Google sign-in พังใน packaged build.
- Security (live-verified) เพิ่ม: pack manifest **path traversal → arbitrary file read** (H);
  refresh-token + Anthropic key เก็บ **plaintext localStorage** (H); ทุก signup ถูก mint
  `generation='F'` Founder (M, base schema ไม่ commit ใน repo).

## Artifacts / live actions
- Artifact: รายงาน audit (path ข้างบน).
- **Live actions: ไม่มีการเขียน/แก้ live DB หรือ deploy** — read-only introspection เท่านั้น.

## State ปลาย turn
- Branch `main`, **behind origin/main by 21** (local ตามหลัง remote — เตือนตาม memory
  "git-log-before-brain": pull ก่อนเริ่มงานหน้า).
- Working tree: untracked `docs/audits/2026-07-07-independent-full-audit.md` (audit นี้) +
  `tools/offload-monitor/` (ค้างมาก่อน ไม่ใช่ของเซสชันนี้) + brain writes นี้. ไม่มี tracked change.
- **ยังไม่ commit** (ไม่ได้สั่ง). **ยังไม่ลงมือแก้ level-up** (รอเลือกชุดเลเวล + scope batch).

## Pending / deferred
1. รอผู้ใช้ยืนยัน: ชุด milestone level `{6,12,18,25}` vs `{6,10,15,20,25}` + เริ่ม Task1 อย่างเดียว
   หรือทั้ง batch (level-up → Dire → audio-priority).
2. Shared-context drift (ดู todo-next): CLAUDE.md/AGENTS.md ยังเขียน v0.7.x; Cargo.toml + root
   package.json ยัง 0.1.0.
