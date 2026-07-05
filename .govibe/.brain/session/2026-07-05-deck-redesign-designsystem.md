# Session — 2026-07-05 · Command Deck glass redesign + design-system SSOT + CR-004/005 + orchestration setup

**Entry point:** ต่อจาก deck UI polish → Boss ขับ redesign layout ผ่าน Figma reference จนได้ทิศทาง
ใหม่ (Subtract-glass HUD) → เขียน design-system SSOT + CR-004/005 → ตั้งวง orchestration (agent
+ audit gate + local SLM) สำหรับงานต่อ. Branch = `feat/deck-glass-redesign-ds` (2 commits: code, docs).

## Arc (ทำอะไร ทำไม)

1. **Deck UI polish** — profile badge rescale (28px avatar) + dropdown (icon/caret/slide-in);
   window controls (min/max/close) + drag region; resizable=false + size presets ใน Settings;
   Dashboard trim ให้ fit grid (no scroll). commit `a5fd9900`.
2. **Layout redesign (Figma → concept):** Boss ให้ Figma "Urban District Planner" wireframe. เข้าใจผิด
   หลายรอบจน Boss ระบุชัด — **ไม่ใช่ box layout**: main content เป็น glass panel **เว้าแหว่ง
   (Boolean Subtract)** 3 จุด, FAB (topbar/sidebar/signal) ลอยในช่องเว้า, P1–P5 = **anchor**
   สื่อสาร agent (ไม่ใช่ nav), accent เพิ่ม **lime #A3E635** คู่ ice.
3. **Glass prototype** — HTML เดี่ยว: panel = `<div clip-path:url(#panelClip)>` + `backdrop-filter
   blur(30px)` (SVG fill เบลอ BG ไม่ได้ → ต้อง clip div), FAB โปร่ง blur, ambient BG blobs.
   อยู่ที่ `docs/design-system/assets/prototype.html`. Subtract path เดียวใช้ทั้ง clip + stroke.
4. **Design-system SSOT** (`docs/design-system/`) — hub README + 01 foundations / 02 tokens
   (`--g-*` + migration map จากค่าเก่าใน styles.css) / 03 layout (path + dimension ทุก zone บน
   1280×720) / 04 components (13 ตัว) / 05 sitemap-IA / 06 stack. + assets SVG annotated +
   swatches. ชี้ pointer จาก Iceglass เดิม. **ADR-15** บันทึกการตัดสินใจ. commit `62b2c680`.
5. **CR-004 (voice+browser)** draft — G-Ear+G-Intent core, G-Browser sidecar (fork stealth-browser-mcp).
6. **CR-005 (landing+auth+social)** draft — 3 surface additive (ห้ามแตะ deck layout): public web
   landing (Vercel) + in-app welcome + full-screen multi-provider auth (ต้องแก้ ADR-14) + G-Social
   community page (friend list + presence + add-friend, gstore schema `friendships`/`presence` + RLS).
   Boss lock: landing=ทั้งสอง, community=page เต็ม, auth=เพิ่ม provider. 5 waves W1–W5.
7. **Orchestration setup** — Boss สั่งตั้งวง: Claude=orchestrator+final gate, +audit gate 1 ชั้นก่อน
   (ลด context), subagent swap module/role, local SLM (RWANG). Spawn 2 subagent: RWANG SLM recon
   + G-Orchestra-vs-plan analysis.

## Verify / กับดัก

- **RWANG SLM (recon เสร็จ):** จริงคือ `G:/GenesisBlock_Dev/Rwang_remote/` (ไม่ใช่ `G:/Rwang`).
  Local SLM = **Ollama @ `127.0.0.1:11434`**; interface ที่ควรใช้ = เรียก `/api/chat` ตรง
  (copy `runOllama` + `ensureVram` guard จาก `providers.mjs`), **ไม่ผ่าน** RWANG :4577 (task/DAG-oriented).
  Config = `Rwang_remote/config.json`. Models: coder=Aroow-9B Q4 / gemma4-rust 4B, worker=qwen3.5:4b,
  embed=bge-m3. **coder+worker local-first; architect+reviewer cloud-first.** VRAM 12GB → serialize,
  ห้าม concurrent local call, ห้าม `OLLAMA_KV_CACHE_TYPE=q8_0`. G-Maiden มี Ollama fallback ใน `master.rs` แล้ว.
- **CRLF warnings** ตอน commit (LF→CRLF) — ปกติบน Windows, ไม่ใช่ error.
- **prototype = draft** — ยังไม่ port เข้า `styles.css` (ยังใช้ token เก่า `--bg #060913`). migration map อยู่ tokens §1.6.

## สถานะจบ session
- Branch `feat/deck-glass-redesign-ds` 2 commits (ยังไม่ push, ยังไม่ merge). ยังไม่ tag/release.
- design-system + ADR-15 + CR-004/005 = **draft** รอ Boss approve ทิศทาง/ตอบ open questions.
- Orchestration model: RWANG recon เสร็จ, G-Orchestra analysis กำลังรัน.
