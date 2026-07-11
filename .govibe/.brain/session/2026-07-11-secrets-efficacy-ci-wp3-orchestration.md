# Session 2026-07-11 — Backlog 3 งาน (DPAPI secrets / silent-arm study / CI hardening) + WP-3 + fix-it-all

## Entry point
Boss สั่งเป็น **LEAD ORCHESTRATOR**: แตก 3 งานจาก `todo-next.md` → สั่ง worker (local LLM/Codex/subagent)
ทำ → **OPUS GATE** ตรวจ (adversarial + CI-parity) → ปล่อยงานถัดไปเมื่อ PASS. โหลด RWANG:Core (R1–R6)
บังคับทั้ง session. ต่อมา Boss สั่ง "ต่อยาว + เรียก agent แบบขนาน + /rwang-masterplan", แล้วปิดท้าย "fix it all".
branch `main`.

## Arc (ทำไม + จุดตัดสินใจ + กับดัก)
- **โมเดล orchestration ที่ใช้จริง** (RWANG roles): Architect=lead(Opus) · Executor=**Codex gpt-5.4**
  (งานที่ยาก/unsafe FFI) + **Sonnet subagent ขนาน** (งานใหญ่) + lead-integration (wiring/แก้ gate findings)
  · Verifier=CI-parity · Reviewer=**Opus adversarial subagent** · Merger=lead commit. **ได้ผลดีมาก** —
  gate จับบั๊กที่ CI เขียวมองไม่เห็นทุกงาน.
- **งาน 1 (DPAPI secrets, C-3/HIGH)** = **CR-008 WP-2** ที่มี CR ร่างไว้แล้ว (2026-07-10). ทำ design-first:
  Opus design-gate รอบแรก **REVISE** จับ 2 BLOCKER ก่อนเขียนโค้ด — (B1) shared `secrets.json` map มี
  read-modify-write race → token refresh write หาย → **silent logout**; (B2) mount effect ใน App.tsx จะ
  push `apiKey:''` ทับ key ที่โหลดจาก DPAPI ตอน startup ทุกครั้ง. แก้ design → **per-file store**
  (`secrets/<name>.bin`) + `WRITE_LOCK` + atomic temp-rename **ในโฟลเดอร์เดียวกัน** (กัน ERROR_NOT_SAME_DEVICE)
  + แยก `set_master_mode`(bool) ออกจาก `set_master_api_key`. `secret.rs` ให้ **Codex** เขียน (unsafe DPAPI FFI
  เกินกำลัง local 9B). Import `LocalFree`/`HLOCAL` จาก `Win32::Foundation` ถูกต้องใน windows 0.61 (ไม่ต้อง
  System::Memory path แม้เพิ่ม feature ไว้). final code-gate **PASS**.
- **/rwang-masterplan**: state ว่าง แต่ G-Maiden เป็น product ที่ ship แล้ว → **ไม่ทำ greenfield Phase-0**
  (จะชน CR-006 freeze + PRD/SRS/ADR). ตีความว่า Boss ต้องการ **operating model** ของ MasterPlan → init
  `state/PROJECT_STATE.json` ที่ **Phase 7 (Implementation)**, ถือ PRD/SRS/ADR corpus = phases 0–6 ที่ freeze แล้ว.
- **งาน 2 + 3 ขนาน** (Sonnet executor 2 ตัว, ไฟล์ disjoint). งาน 3 (CI) toolchain-pin = version ที่ติดตั้งอยู่
  (1.96.0) → benign ต่อ build ของงาน 2 ที่รันพร้อมกัน. **กับดัก**: agent งาน 3 ไป spawn clippy ในเวลาที่ agent
  งาน 2 กำลังแก้ Rust ในทรีเดียวกัน → clippy ปน; แก้โดยสั่งหยุด clippy ให้ lead รัน combined gate authoritative แทน.
- **งาน 2 gate FAIL — บั๊กสำคัญที่ CI มองไม่เห็น (B1):** randomization ใช้
  `SystemTime::now()...as_nanos() % 100`. บน **Windows SystemTime = FILETIME (100ns granularity)** → nanos
  เป็นพหุคูณของ 100 เสมอ → `% 100 == 0` เสมอ → `decide_silent_arm` = true ทุกแมตช์ → **ปิดเสียงเตือน 100%**
  (ไม่ใช่ 25%) และ armed bucket ว่างตลอด (study ใช้ไม่ได้). unit test เดิม inject entropy 0..99 เลยไม่โดน
  clock จริง. Opus gate พิสูจน์ empirical 2000/2000. แก้: **splitmix64 `mix_entropy`** ก่อน `% 100` + test ที่
  reproduce FILETIME quantization (raw path = degenerate, mixed = 15–35%). + W1 (armed bucket bias) แก้โดย
  filter เฉพาะ match ที่ `study:true` + W2 (calibration ยัง log เสียงที่ถูก suppress) gate ด้วย `armed`. re-gate PASS.
- **fix it all** (หลังปิด 3 งาน): ทำ **WP-3** (callback login-CSRF) = pending-gate ไม่แตะ redirect URL (กัน
  allowlist พัง — เพราะ live-test OAuth ไม่ได้) + PKCE เป็นชั้นสอง; Opus security-gate PASS. + 2 NIT
  (rate 0.0→null ให้ตรง Python; study อ่านจาก match_start ตัวแรก) + Release/Acquire ordering. **verify เชิง
  พฤติกรรมจริง (login persist / grep leveldb / real match) ทำไม่ได้** — ต้อง packaged build + Google sign-in จริง
  (sign-in เป็น action ที่ทำแทน Boss ไม่ได้).

## สิ่งที่ทำ (ตามไฟล์ + commit)
- **T1 DPAPI secrets** `a9c492e8`: `src-tauri/src/secret.rs` (ใหม่, Codex), `runtime.rs` (mode/secret split),
  `main.rs` (startup load + commands), `Cargo.toml` (Win32_Security_Cryptography + System_Memory),
  `src/src/secureStorage.ts` (ใหม่, supabase-js adapter), `secureStorage.test.ts` (ใหม่), `supabase.ts`,
  `App.tsx` (ลบ masterApiKey จาก blob + UI key-saved + migration), `CR-008` (ใหม่).
- **T3 CI hardening** `c5d8d4cb`: `rust-toolchain.toml` (ใหม่, pin 1.96.0), `ci.yml`/`release.yml`
  (dtolnay/rust-toolchain@1.96.0), `AGENTS.md` (tag-after-CI-green rule + review-gate checklist). eslint
  อยู่ใน gate ทั้งสอง workflow อยู่แล้ว (ไม่ต้องเพิ่ม).
- **T2 silent-arm study** `5bacec51`: `runtime.rs` (EFFICACY/SILENT_ARM + mix_entropy + decide/roll),
  `log.rs` (match_start {silent_arm,study} + gank_signal armed + efficacy_summary join/bucket),
  `capture.rs`+`capture_wgc.rs` (suppress voice+banner ใน silent arm, log เสมอ), `main.rs` (2 commands),
  `App.tsx` (efficacyStudy toggle + EfficacyCard), `tools/analyze-log/analyze.py`+`test_analyze.py`.
- **masterplan state** `2e582604`: `state/PROJECT_STATE.json` (Phase 7).
- **WP-3 + NITs** `ec5543ec`: `runtime.rs` (OAUTH pending-gate + Release/Acquire), `gsi.rs` (callback gate),
  `main.rs` (oauth_begin), `auth.ts` (oauth_begin ก่อน open_url), `log.rs`+`App.tsx` (rate null + study first),
  `CR-008` (WP-3 done).

## Verify (gate ที่รันจริง — ค่าสุดท้ายหลัง fix it all)
| Gate | ผล |
|---|---|
| `cargo test --bin g-maiden` | **187 passed / 0 failed / 4 ignored** |
| `cargo clippy --all-targets -- -D warnings` | clean |
| `cargo check --features wgc` | clean (แก้ capture_wgc drift signature) |
| `pnpm exec tsc --noEmit` | 0 |
| `pnpm exec eslint .` | 0 errors (6 warning เดิม ไม่ใช่ของใหม่) |
| `pnpm exec vitest run` | 148 passed (16 files) |
| `python -m pytest` (analyze-log) | 9 passed |

Opus gates: T1 design REVISE→APPROVE, T1 code PASS · T2 FAIL(B1)→fix→PASS · T3 PASS · WP-3 PASS.

## Key numbers
- FILETIME bug: raw path 10000/10000 silenced; mixed 25.0% over realistic inputs (Opus verified).
- SILENT_ARM_PROB=25, join window=8000ms, OAUTH gate timeout=600000ms.
- Rust tests 187 (จาก 166 ต้น session).

## Artifacts (ใหม่)
`src-tauri/src/secret.rs` · `src/src/secureStorage.ts` + test · `rust-toolchain.toml` ·
`state/PROJECT_STATE.json` · `docs/change request/CR-008-login-hardening.md` (WP-2+WP-3 done).
**ไม่มี live/irreversible action** (ไม่แตะ gstore DB / Edge Fn / ไม่ tag / ไม่ release).

## State ปลาย turn
- branch `main`, pushed ถึง `ec5543ec` (origin sync). commit range session นี้: `a9c492e8..ec5543ec` (5 commits).
- working tree: เหลือเฉพาะ pre-existing ที่ไม่ใช่ของเรา — `dev.bat` (M), `orchestration/brain/failures.jsonl`
  (M), `tmp-power-radial-check.html` (??) — **ไม่แตะ** (tmp = reference ของ Boss) + ไฟล์ brain ของ session นี้ (uncommitted).
- **Pending/deferred:**
  1. **Behavioral verify (ต้อง Boss):** T1 sign-in persist ข้าม restart + grep leveldb ว่าง; T2 arm/suppress
     ในแมตช์จริง. ต้อง packaged build + Google sign-in จริง.
  2. **T1 leveldb residue caveat:** localStorage log-structured → plaintext เก่าค้างจน Chromium compact (แก้จาก JS ไม่ได้; documented).
  3. **WP-3 optional hardening:** per-flow nonce/state binding (แตะ redirect URL → เสี่ยง allowlist, ไม่ทำเพราะ live-test ไม่ได้).
  4. **Version drift (ยังไม่แก้ — รอ Boss สั่ง):** `CLAUDE.md:5` "v0.8.x" + `AGENTS.md:239` "v0.8.0 shipping"
     → จริง = **0.9.0** (tauri.conf/package.json/App.tsx). แก้ = bump บรรทัด status เท่านั้น.
