# Session 2026-07-06 — FluxNode AI copilot / agent layer (งานนอก G-Maiden)

> ⚠️ **session นี้ทำงานที่ repo อื่น: `D:\fluxnode-dev` (FluxNode)** ไม่ใช่ G-Maiden.
> รันจาก root G-Maiden แต่ **ไม่มี G-Maiden code/doc ถูกแตะเลย**. บันทึกละเอียดฝั่งโน้นอยู่ที่
> **`D:\fluxnode-dev\HANDOFF.md`** (source of truth). ไฟล์นี้เป็น pointer ข้าม project.

## Entry point
เริ่มจาก user ขอ **โพสต์ Facebook หากลุ่ม Dota2** (คัด beta tester G-Maiden) → **ตัดคลิปวิดีโอ** 8:50–9:40
จาก `D:\dota` (เจอ ffmpeg ใน `D:\fluxnode-dev/src-tauri/target/release/`) → คำถาม **"local llm ทำงานนี้ได้ไหม"**
→ **"ฝัง AI เข้าโปรแกรม fluxnode"** → บานเป็นการสร้าง **AI copilot / agent-native layer ใน FluxNode** เต็มรูปแบบ.

## Arc (เล่าเหตุ + บทเรียน)
1. **FB post + ตัดคลิป** — ร่างโพสต์ไทย 2 เวอร์ชัน (ฟีเจอร์เด่น + คัดคน); ตัดคลิป stream-copy 50 วิ (`clip_0850-0940.mp4`).
2. **ดีไซน์สถาปัตย์** (design doc) — ตัดสินใจสำคัญ: **llama.cpp ไม่ใช่ vLLM/SGLang** (vLLM ผิด use case desktop), **GGUF vs safetensors** ตัดสิน runtime, **ComfyUI = optional** (sd.cpp native + cloud), หลักการ **"One Action Registry, Many Callers"** (SSOT → derive LLM tools/MCP/CLI). Media แยกตาม modality (Ollama ทำ image/video/audio ไม่ได้ = ต้อง diffusion engine ต่างหาก).
3. **สร้างแบบ waves + ขนาน** — ยิง Claude subagents ทำ backends ขนาน (comfy/sdcpp/whisper/piper) + **local benchmark Codex vs Ollama** (Packet 1A wrappers). **บทเรียน: Codex(gpt-5.4) ชนะ Ollama aroow-9b** ทั้ง speed(20s vs 65s cold) + ตรง spec → default code-offload ไป Codex ([[codex-vs-ollama-rust-boilerplate]]). Subagent ทำงานได้ดีเมื่อให้ contract freeze ก่อน + สั่ง "สร้างไฟล์เดียว ห้ามแตะ shared" แล้ว lead integrate เอง.
4. **E2E verified จริง** — `fluxnode --agent "probe clip"` → agent เรียก `asset_probe` → ffprobe จริง → ตอบ h264/1280x720/50.1s (ข้อมูลจริงจากคลิปที่ตัดตอนต้น). ไม่ใช่แค่ compile.
5. **llama-cpp-2 build ไม่ได้** — ขาด **cmake + libclang** (แต่ **cl.exe/MSVC มี** จาก VS2022 BuildTools — ตอนแรกผมบอกผิดว่าไม่มี compiler เพราะเช็คแค่ PATH). ทำเป็น stub หลัง `--features llama` + doc prerequisites.
6. **Doc audit 2 repo** — ยิง Explore สแกน. **FluxNode 10 ไฟล์ต้องอัพ** (8 md + 2 html), **G-Maiden 0** (grep ไม่เจอ ref FluxNode). อัพครบ. **user เลือก commit ทั้งหมด** ทั้งที่มัด doc WIP ค้างเดิม (README rewrite ฯลฯ) — disclose ใน message.
7. **user เน้นเรื่อง WIP ค้างเดิมตลอด** — ผมเว้น .md/Cargo.toml WIP ไม่แตะมาทั้ง session, แยก commit เฉพาะไฟล์งาน, disclose ทุกครั้งที่ต้องมัด.

## สิ่งที่ทำ (commit — ทั้งหมดที่ `D:\fluxnode-dev` master, **local only, ไม่ push, ไม่มี remote**)
- `e80999e` Wave 0 contracts + media backends · `33fad1f` MCP + 27 actions · `e5f9fbb` registry live + `--mcp`
- `c7217bb` Wave 3 brain (Brain trait+agent loop+Ollama) · `250820b` safety gate + arbiter + `--agent` E2E + llama stub
- `1408e86` media broker → command layer (30 actions) · `df498d3` docs 8 ไฟล์ · `a3be0a2` docs 2 html · **`c6810e5` HANDOFF.md** (ปลายสุด)
- **G-Maiden: ไม่มี commit** (ไม่แตะ)

## Verify (ที่รันจริง — ฝั่ง FluxNode)
- `cargo check` **ผ่าน** ทุก step — ทั้ง default และ `--features llama`.
- **E2E `--agent` รันจริง** (build+run, agent→asset_probe→ffprobe→คำตอบจริง).
- Ollama tool-calling (qwen3.5:4b) เรียก tool ถูก schema (bench/wave3/).
- **ไม่ได้รัน:** `cargo test`, clippy, GUI app เต็ม, `--mcp` runtime, sidecar binaries จริง, llama build.

## Key numbers / artifacts
- **30 actions** ใน registry · benchmark Codex 20s vs Ollama 65s(cold, load 51s).
- FluxNode ไฟล์ใหม่: `src-tauri/src/{action.rs, actions/, brain/, media/, mcp.rs, services.rs}`, `docs/AI Copilot *.md` (2), `HANDOFF.md`, `bench/wave1a` + `wache3`.
- Dep เพิ่ม: rmcp 0.16 + tokio; feature `llama`.

## State ปลาย turn
- **FluxNode** `master` @ `c6810e5` — 9 commits AI copilot, **local ล้วน (ไม่มี remote → push ไม่ได้)**. WIP ค้างเดิมของ user (Design Guide.md, Phase1 spec, bench/PROMPT2+gen_actions.raw) ยัง uncommitted/untracked.
- **G-Maiden** — ไม่แตะ. branch เดิม `feat/deck-glass-redesign-ds` (งาน deck จาก session ก่อน) ยังคาที่เดิม. `.govibe/.brain/` มี write ใหม่ (ไฟล์นี้ + todo-next + auto-memory) **uncommitted** (ไม่ได้ขอ commit).
- **Pending (FluxNode, ranked)** อยู่ใน `HANDOFF.md`: (1) in-app chat UI (2) real-confirm write flow (3) `--mcp` runtime test (4) media-gen UI (5) bundle sidecar binaries (6) in-process llama.cpp.

## §4 Shared-context (AGENTS.md/CLAUDE.md) drift
- **G-Maiden** AGENTS.md/CLAUDE.md — **ไม่ได้ตรวจ version drift รอบนี้** เพราะ session ไม่แตะ G-Maiden เลย = ไม่มี drift ใหม่จากงานนี้ (ค้างจาก session ก่อน: CLAUDE.md ยังเขียน v0.7.x แต่ build เป็น 0.8.0 — ดู session 2026-07-05 series; ยังไม่แก้).
- **FluxNode** CLAUDE.md/AGENTS.md — อัพแล้ว (AI Copilot section + HANDOFF pointer), committed `c6810e5`/`df498d3`.
