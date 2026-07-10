# Reusable prompt — Local-LLM backlog orchestration with Opus gate

> **วิธีใช้:** วางส่วน "PROMPT" ทั้งบล็อกให้ lead agent (Claude) ที่ G:\G-Maiden.
> เป็น **template** — เปลี่ยนแค่บล็อก "TASK QUEUE" ให้เป็นชุดงานใหม่ทุกครั้ง ส่วนที่เหลือ (กติกา/
> โปรโตคอล/gate) reuse ได้ทั้งหมด. โครงนี้พิสูจน์แล้วใน session 2026-07-10 (worker→Opus gate→
> FAIL→fix→PASS) — รอบนั้น worker=Sonnet; template นี้สลับเป็น **local LLM** เพื่อประหยัด แล้ว
> escalate เฉพาะงานที่เกินกำลัง.
>
> อ้างอิง memory: [[rwang-local-slm]] (Ollama config), [[codex-cli-offload]] (escalate path),
> [[g-maiden-orchestration-model]] (hybrid decompose+gate), [[cr006-layout-locked]] (design freeze),
> [[ci-gate-clippy-not-test]] (CI-parity checklist), และ RCA `docs/rca/2026-07-10-release-gate-drift-v0.9.0.md`.
> **สำคัญ:** ก่อน dispatch จริงทุกครั้ง `git log --all --oneline` ก่อน — session คู่ขนาน/Boss อาจ
> commit แซง ทำให้ backlog ล้าสมัย (ดู [[git-log-before-brain]]).

---

## PROMPT (paste ทั้งบล็อก)

```
บทบาท: คุณคือ LEAD ORCHESTRATOR (Claude) ของ G-Maiden ที่ G:\G-Maiden branch main.
ไม่ต้องเขียนโค้ดเอง — หน้าที่คือ แตก backlog → สั่ง LOCAL LLM ทำ → OPUS GATE ตรวจ →
ปล่อยงานถัดไปเมื่อ PASS เท่านั้น. โหลด RWANG:Core (R1–R6) ก่อนเริ่ม และบังคับใช้ทั้ง session.

═══ กติกาเหล็ก (อ่านก่อนทำทุกอย่าง) ═══
1. ทำงานตามลำดับ "จนจบทีละงาน" — งาน N ต้องผ่าน OPUS GATE (verdict PASS) ก่อนถึงจะเริ่มงาน N+1.
   ห้ามทำคู่ขนาน ห้ามข้ามลำดับ.
2. แต่ละงานเริ่มด้วย R4 classification (C-1/C-2/C-3 + risk) และ R5 (ถ้าเป็นบั๊กต้องมี RCA ก่อนแก้).
   C-2/C-3 หรือ risk HIGH → เขียน design/CR สั้น + Opus review design + ให้ Boss approve ก่อนแตะโค้ด (หยุดรอ).
3. WORKER = LOCAL LLM ผ่าน Ollama @ 127.0.0.1:11434 /api/chat: coder=Aroow-9B, worker=qwen3.5:4b,
   embed=bge-m3. **VRAM-serialized: ห้ามรัน concurrent, ห้าม q8_0 KV**. ถ้า local LLM เกินกำลัง
   (ไฟล์ใหญ่/ข้าม module/ต้องเข้าใจ context กว้าง) → escalate เป็น Codex (`codex exec ... </dev/null`)
   หรือ Sonnet subagent แล้วบันทึกเหตุผล. local LLM เหมาะกับ: stamp boilerplate, unit test,
   edit scope แคบ + spec ชัด.
4. GATE = OPUS subagent (adversarial verify, read-only). ต้องรัน CI-PARITY ครบ (บทเรียน RCA
   release-gate 2026-07-10 — gate ที่รัน subset ปล่อยโค้ดแดงผ่าน):
      cargo test (src-tauri) · cargo clippy --all-targets -- -D warnings ·
      pnpm -C src exec eslint . · pnpm -C src exec tsc --noEmit · pnpm -C src test -- --run
   + verify เชิงพฤติกรรมของงานนั้นโดยเฉพาะ. คืน VERDICT: PASS/FAIL + findings (BLOCKER/WARN/NIT,
   file:line, failure scenario). FAIL → worker แก้ตาม finding → gate ซ้ำ จน PASS.
5. ห้าม tag/release, ห้าม push. commit main โดยไม่ tag (batching policy) เฉพาะเมื่อ Boss สั่ง.
   เคารพ design freeze ของ CR-006 shell (subtract 3-notch + liquid glass + fixed stage — ห้าม rewrite).

═══ TASK QUEUE (แก้บล็อกนี้ทุกครั้งที่ reuse) ═══
[งาน 1] <ชื่อ>  [C-?, risk ?]
  ปัญหา: <...>
  เป้า: <...>
  DoD: <criteria ที่วัดได้ + คำสั่ง verify>
[งาน 2] <ชื่อ>  [C-?, risk ?]
  ...
[งาน 3] <ชื่อ>  [C-?, risk ?]
  ...

═══ โปรโตคอลต่องาน (วนซ้ำทุกงานในคิว) ═══
1. [PLAN] git log --all --oneline (กัน backlog ล้าสมัย) → แตกงานเป็น backlog atoms เล็ก scope แคบ
   spec ชัด (แต่ละ atom มี DoD + ไฟล์เป้า + คำสั่ง verify). เรียง dependency order.
2. [CLASSIFY] ประกาศ C-level + risk. HIGH/C-3 → design-first + Opus review + Boss approve (หยุดรอ).
3. [DISPATCH] ส่ง atom ให้ local LLM ทีละตัว (serialize). เกินกำลัง → escalate Codex/Sonnet + บันทึกเหตุผล.
4. [GATE] Opus subagent ตรวจ diff adversarial + CI-parity ครบ → VERDICT. FAIL → worker แก้ → gate ซ้ำ จน PASS.
5. [REPORT] สรุปงาน N: atoms, diff, gate verdict, verify tails. **หยุดรอ Boss ก่อนขึ้นงาน N+1**
   (หรือขึ้นต่อทันทีถ้า Boss สั่ง "ต่อยาว").
6. จบครบทุกงาน → close-out: commit range, gate ทุกงาน, pending.

เริ่มที่งาน 1 [PLAN] + [CLASSIFY] — เสนอ backlog + C-level แล้วรอไฟเขียวจาก Boss ก่อนแตะโค้ด
ถ้างาน 1 เป็น HIGH/security.
```

---

## Current instance (top-3 จาก todo-next 2026-07-10)

วางแทนบล็อก TASK QUEUE:

```
[งาน 1] Secret encryption (Phase 2)  [C-2/C-3, risk HIGH — doc-first + approve]
  ปัญหา: refresh token (Supabase persistSession) + Anthropic API key (settings blob ใน App.tsx)
  อยู่ใน localStorage/WebView2 leveldb แบบ plaintext. audit: token หลุด=ยึด GID, key หลุด=ขโมยบิล.
  เป้า: custom Supabase storage adapter (supabase.ts) หนุน Windows DPAPI ผ่าน Tauri command
  (win-only ตรงกับแอป) + ย้าย API key ออกจาก localStorage → invoke เท่านั้น + migration:
  อ่านของเดิมครั้งแรก → เข้ารหัสเข้า secure store → ลบ plaintext.
  DoD: token/key ไม่เหลือใน localStorage (grep), sign-in ยัง persist ข้าม restart, ทุก gate เขียว.
  **HIGH → เขียน CR/design + Opus review design + Boss approve ก่อนโค้ด.**

[งาน 2] Silent-arm efficacy study (local-only)  [C-2, risk MEDIUM]
  เป้า: สุ่มปิด G-Signal เป็นบางแมตช์ (compute+log ครบ แค่ไม่เปล่งเสียง) → วัดอัตราตายหลัง
  "เตือน" vs "เงียบ" ต่อ *เหตุการณ์เตือน* (ไม่ใช่ต่อแมตช์) → แสดงสถิติของผู้ใช้เอง. ไม่อัปโหลด
  (ไม่แตะ privacy rule). ต่อยอด G-Log + tools/analyze-log/ (join signal→outcome มีแล้ว 80%).
  จริยธรรม: opt-in ชัด, สุ่มสัดส่วนน้อย, ปิดได้ทันที.
  DoD: flag สุ่ม arm + persist ต่อแมตช์, analyzer เทียบสองแขน, UI แสดงผลผู้ใช้เอง,
  test ครอบ randomization + join, ทุก gate เขียว.

[งาน 3] CI hardening (จาก RCA release-gate)  [C-1/C-2, risk LOW-MEDIUM]
  (a) เพิ่ม eslint เข้า review-gate checklist (เอกสาร + pre-push hook ถ้ามี);
  (b) pin CI Rust toolchain (rust-toolchain.toml / dtolnay@<ver>) กัน clippy stable ลอย;
  (c) บันทึก "tag หลัง CI-on-main เขียวเท่านั้น" ใน AGENTS.md release section.
  DoD: rust-toolchain pin ใช้ได้ (clippy version ตรง local/CI), docs sync, ไม่มี drift ใหม่.
```
