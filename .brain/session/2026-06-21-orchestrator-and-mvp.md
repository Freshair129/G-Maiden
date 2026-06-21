# Session — 2026-06-21 · Multi-agent orchestrator + Dota 2 MVP

สองสายงานใหญ่: (A) สร้างระบบ multi-agent orchestrator, (B) ลุยจนได้ MVP ใช้งานใน Dota 2 ได้จริง.
ทุกอย่างขึ้น `origin/main` แล้ว (https://github.com/Freshair129/G-Maiden).

---

## A. Design docs + Multi-agent Orchestrator (`orchestration/`, `docs/`)

- **Design docs** (`docs/`): `01-Tech-Stack`, `02-Engineering-Spec`, `03-TDD` (ADR-01..07 + risks),
  `04-Roadmap`, `05-Ultraplan` (45 tasks). + ผู้ใช้ให้ `CONCEPT--SUBAGENT-CONTEXT-SCOPING` (POLA)
  และ `GUIDE--SMALL-MODEL-PROMPTING` มาเป็นแนวทาง.
- **Orchestrator** (`orchestration/`): engine.mjs (DAG, claim/lease, model routing, executor),
  orchestrator.mjs (CLI), server.mjs + public/index.html (web UI: List / Waves DAG / Agent Room
  live-stream / Run-wave / Auto-run). ไม่มี dependency ภายนอก (Node built-in).
  - **Model routing**: opus=plan/arch/spike, sonnet=code, haiku/local=งานเบา.
  - **Providers**: Claude (Plan quota ↔ ANTHROPIC_API_KEY สลับผ่าน env ของ child) + **Ollama local**
    (`ollama:<model>`, ฟรี). usage ledger (session 5h / weekly 7d) ใน UI.
  - **Context scoping (POLA)**: per-task scope + doc tiers; เอกสาร `orchestrator-only` ไม่รั่วเข้า worker.
  - **Verify Gate** (ADR-O-001, `orchestration/docs/`): reviewer อิสระคนละ tier ตรวจ output เทียบ
    acceptance ก่อน `done`; สถานะ `reviewing`/`needs-rework`; fail-safe.

## B. MVP build (Tauri v2 + React) — ทำเอง (เร็วกว่า spawn agent)

ลำดับ commit: `9030488`(orchestrator+docs) → verify-gate → `9412b64`(G0.1 foundation verified) →
`7f34cbc`(beforeDev fix) → `70264d3`(GSI overlay) → `4600816`(danger alert) → `b103f0e`(settings) →
`36c306a`(two-window GUI). + standalone release exe (verified, ไม่ commit — gitignored).

สิ่งที่ทำงานจริง (verify ด้วยภาพ + simulated GSI รูปแบบจริง):
- **Foundation**: Tauri v2 + React/Vite/Tailwind monorepo, build+run+window จริง.
- **GSI server** (`src-tauri/src/gsi.rs`): axum :3000 รับ Dota 2 GSI → parse → emit `game-tick`.
- **OSD overlay**: transparent click-through always-on-top HUD (clock/score/hero+HP/mana/KDA/economy).
- **Danger alert**: HP ≤ threshold → banner "ถอยก่อนค่ะเพื่อน!" (seed ของ G-Signal).
- **Control GUI** (MSI-Afterburner style): หน้าต่าง `control` หลัก + หน้าต่าง `overlay` แยก;
  settings sync ผ่าน event (`settings` + `overlay-ready` handshake); Alt+S ซ่อน/แสดง overlay.
- **GSI config ติดตั้งใน Dota 2 จริง**: `D:\Steam\...\dota 2 beta\...\gamestate_integration\`.
- **Standalone exe** 9.8MB (`src-tauri/target/release/g-maiden.exe`) รันไม่ต้อง vite.

## Toolchain ที่ติดตั้งจริงในเครื่องนี้ (PRE)
pnpm 9 (corepack), **Rust 1.96 MSVC**, @tauri-apps/cli 2.11, WebView2, VS BuildTools 2022 (มีอยู่แล้ว).

## ⚠️ บทเรียน/กับดักสำคัญ (อ่านก่อนทำต่อ — กันพลาดซ้ำ)
1. **Claude worker prompt ต้องส่งทาง stdin ไม่ใช่ shell arg** — `shell:true` ทำตัว `| { } ( ) \`` พัง
   → agent ได้ prompt เปล่า → ตอบ greeting → ถูก mark done หลอก. (gate เป็นตัวเปิดโปง)
2. **Tauri v2 ต้องมี `capabilities/default.json`** ไม่งั้น frontend `listen()`/`invoke()` ถูกบล็อกเงียบ ๆ
   (overlay ไม่ขึ้นข้อมูล). ต้องระบุ `windows` ให้ครบทุก label.
3. **debug binary โหลด `devUrl`** (ต้องมี vite); **release embed frontend** (standalone). อย่า verify
   ด้วย debug exe เดี่ยว ๆ.
4. **`beforeDevCommand` รันจาก root** → ใช้ `pnpm -C src` ไม่ใช่ `../src`.
5. **tauri.conf ต้องเป็น v2 schema**: `identifier` บังคับ, `productName/version/bundle` top-level,
   `frontendDist` ตรงกับ vite outDir (`gen/web`). `shell-open` เป็น feature v1 (v2 พัง).
6. **verify ด้วยเส้นทางที่ผู้ใช้ใช้จริง** — `cargo build` ผ่านแต่ `pnpm tauri dev` พังเพราะคนละ entry.
   acceptance G0.1 = "หน้าต่างเปิด" ไม่ใช่ "compile ผ่าน".
7. **Ollama qwen3.5:4b เป็น thinking model** — เผา num_predict กับ reasoning → ตั้ง `think:false`;
   content ว่าง = ถือว่า fail. gemma4-rust-coder ทำตาม scaffold ดีกว่า.
8. Windows CRLF: `git diff` ว่างแต่ status ขึ้น M = line-ending → `git checkout --` ทิ้งได้.

## สถานะปลาย session
- orchestrator: progress 12/45 (ของจริง). หลายตัวเคย false-done (greeting) ถูก reset แล้ว.
- working tree สะอาด (เหลือ CLAUDE.md ที่แก้ก่อน session + untracked `.govibe/ assets/ models/ template/ tests/` ที่ไม่ใช่ของ session นี้).
