# Session — 2026-07-05 (B) · Deck HUD v2 ลงโค้ดจริง + G-Offload Monitor + provider tiers + orchestration fleet

**Entry point:** ต่อจาก session A (design-system SSOT + ADR-15 + CR-004/005 + orchestration model
ตั้งวง). user สั่ง **"build agent fleet ไปทำ"** → ลุยจริง: รัน fleet, ทำ monitor, แล้ว implement
deck Subtract redesign เป็นโค้ด. Branch เดิม `feat/deck-glass-redesign-ds`.

## Arc (ทำอะไร ทำไม + คำสั่ง/แก้ของ user)

1. **Orchestration fleet จริง (Workflow tool):** 7 drafters (component-based U1–U7) ขนาน → **audit
   gate** 1 ตัว → **REJECT/rework**: จับ 3 blocker (selector fracture — drafters ตั้งชื่อ selector
   คนละอย่าง / telemetry หาย / window-control handoff). **บทเรียน: งาน CSS ไฟล์ร่วม fan-out ต้อง
   freeze selector contract ใน shared context ก่อน** ไม่งั้น fracture. audit gate = คุ้มมาก (กัน integrate ของพัง).
2. **G-Offload Monitor** (`tools/offload-monitor/`): wrapper `run.mjs` (ollama/openrouter/codex →
   log cmd+output) + UI 3 tabs (Providers / Fleet & Progress / Activity) **codex เขียนเอง** (dogfood
   offload บน OpenAI quota, ประหยัด Claude). Monitor เสิร์ฟ :5176, poll json 3s.
3. **Provider tiers:** Ollama local (43 models, up), Codex CLI (gpt-5.5, authed), OpenRouter.
   **Codex gotcha:** `codex exec ... </dev/null` (ไม่ปิด stdin → background ค้าง exit 1).
   **OpenRouter debugging:** key โชว์ครั้งเดียวตอนสร้าง (New Key) → เก็บใน `.openrouter.key` (gitignore);
   free models deprecated/rate-limited เยอะ; **402 = ต้อง cap `max_tokens`** (account เครดิตน้อย จอง
   context เต็มไม่ไหว) → ใส่ max_tokens:1024 แล้วผ่าน. ดึง model list จริงจาก `/api/v1/models`.
4. **Deck HUD v2 → โค้ดจริง** (หลายรอบตาม feedback user):
   - shell: topbar FAB (re-home telemetry) + sidebar icon nav (codex `DeckIcons.tsx`) + glass panel
     **เก็บ Dashboard รวยเดิม** (hero flip cards/agent art) ไม่ downgrade เป็น prototype.
   - user: **"ไม่ตรง Subtract shape"** (ผมทำ FAB แต่ panel ยังสี่เหลี่ยม) → เพิ่ม clip-path notch top-right.
   - user: **"fix it all"** → 2 โหว่ (top-right topbar + bottom-right signals) + ย้าย G-Signal เป็น
     **FAB cards D/E/F/G** ในโหว่ล่างขวา (เอา gsignal-bento ออกจาก Dashboard = grid cell ว่าง = โหว่พอดี);
     conditional notch (โหว่ล่างขวาเฉพาะ dashboard tab).
   - user: **"มุมมน + P1–P5 anchors"** → clip-path เปลี่ยนเป็น **`path()` JS-computed rounded fillet**
     (Q Bézier, ResizeObserver) + P1–P5 anchor rail (ซ้ายบน, agent-comm ไม่ใช่ nav).
   - user (จอใหญ่ ดูโล่ง): **"1920×1080"** → **scale-to-fit stage** (fixed 1280×800 design, JS scale
     min(vw/1280,vh/800), FAB/panel anchor เข้า stage) → สม่ำเสมอทุกขนาด (1920 = scale 1.35).
   - แก้ **panel มองไม่เห็น** (โปร่งเกิน) → fill เข้ม + drop-shadow rim ตาม clip.
5. **⚠️ Deck ยัง NOT 100%** — user รอบสุดท้าย: **"ยังไม่หาย"** (Subtract shape ยังไม่เป๊ะ/มีจุดค้าง)
   → deferred, ปิด session (ยาวเกิน).

## สิ่งที่ทำ (commits — branch `feat/deck-glass-redesign-ds`)
- Monitor: `ed3d7110` wrapper+data · `968e1890` key-file · `052cd577` UI v2 · `a1a91698` max_tokens · `a1a840ea` progress
- Deck: `b14df060` shell · `fa486270` notch top-right · `d90fca6d` 2 notches+signal FABs · `07121a2a`
  conditional notch · `0bd53826` rounded fillet+anchors · `ad1fe4b6` visible rim · `dbd87287` scale stage
- (session A: `a5fd9900`/`62b2c680`/`a5a91664`)

## Verify (gate ที่รันจริง)
- `npx tsc --noEmit` (cwd `src/`) — **ผ่าน** ทุกรอบหลังแก้ deck.
- **Screenshots timeout ทุกครั้ง** (backdrop-filter + clip-path หนักเกิน preview renderer) →
  verify ด้วย `preview_eval` computed-style/geometry แทน (panel dims, clip path(), FAB positions, overflow).
- **ไม่ได้รัน** `cargo test` (ไม่แตะ Rust), lint, หรือ tauri build.
- user เห็นผลจริงในเบราว์เซอร์ตัวเอง (localhost:5173) — deck render ได้ แต่ Subtract ยังไม่เป๊ะ.

## Live / external actions (ต้องบันทึก)
- **OpenRouter: ยิง API จริงด้วย key ของ user** (paid `google/gemini-3.1-flash-lite`, ~15 tokens ≈ เศษเซนต์) — สำเร็จ OPENROUTER_OK.
- **Ollama local** หลาย call (aroow-rust-coder-9b), **Codex CLI** หลาย call (gpt-5.5, OpenAI quota) — icons + monitor UI.
- ไม่มี migration/Edge Fn/DB write.

## State ปลาย turn
- Branch `feat/deck-glass-redesign-ds`, **15 commits ahead, ยังไม่ push, ยังไม่ merge, ยังไม่ tag**.
- Working tree: เหลือ `tools/offload-monitor/offload-log.json` (runtime log seed — โดน run.mjs append; uncommitted, ไม่สำคัญ).
- **Pending/deferred:** (1) **deck Subtract shape ยังไม่เป๊ะ** (user "ยังไม่หาย" — ต้องดูภาพจริงรอบหน้า
  แล้วจูน: อาจ signal FAB ล่างขวาชิดขอบ/ตัด, โหว่/สัดส่วน, หรือ panel edge); (2) P1–P5 ยังไม่ wire agent;
  (3) inner zones ยังไม่ re-skin `--g-*` เต็ม; (4) OpenRouter ใช้ได้แต่ต้องเลือก model slug จริง (free เยอะตัว dead).
