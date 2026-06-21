# Session — 2026-06-21 (turn 11) · Voice fallback pipeline + G-Master Claude Plan

User ถามว่า HP ต่ำเรียก LLM ไหม + pre-recorded จะช่วยไหม → ผมตอบ design discussion
แล้วเสนอ 3 options. user เลือก **(c) ทำคู่กัน** — pre-recorded สำหรับ predictable
events + LLM สำหรับ advice. ก่อนหน้านี้ user ก็ถามเรื่อง Claude Plan quota เพื่อ
หลีกเลี่ยง Gemini API key. รวมเป็น turn เดียว.

## สิ่งที่ทำ (commit `33d2fa3`)

### `audio.rs` (ใหม่) — WAV playback pipeline

- `voice_cache_dir()`: resolve `<exe-dir>/voice-cache` ก่อน → fall back
  `assets/voice-cache` สำหรับ dev tree.
- `play_random(event)`: หา `.wav` ใน `{event}/` → สุ่มเล่นด้วย
  `(New-Object System.Media.SoundPlayer $path).PlaySync()`. PlaySync block
  PowerShell process ตลอด clip → kill child = cancel ทันที (สำคัญสำหรับ
  Belief Revision).
- `cancel()` pattern เดียวกับ tts.rs single-slot `Mutex<Option<Child>>`.
- Returns `false` ถ้าไม่มี clip → caller fall back SAPI synth.
- 1 unit test: missing folder → 0 clips, no panic.

### `master.rs` (ใหม่) — G-Master cloud advisor (Claude Plan quota)

- `advise(tick)`: shell-out `claude -p "<prompt>"` ใช้ session ของ user ที่
  login ค้างใน CLI → **zero per-token cost** (Plan quota). Pattern เดียวกับ
  TTS/registry/VDF parser — zero new Rust dep.
- PERSONA_PROMPT: Maiden = Crystal Maiden caster, ห้ามทักทาย ตอบตรง, มี
  humor Nerf-CM.
- `build_prompt(tick)` ใส่บริบทเกม: phase (ก่อนเข้าเลน/early/mid/late จาก
  clock_time), hero, level, KDA, net worth, gold, HP%, mana%, score.
- Throttle 30s + cache last response ใน static Mutex → spam-click ไม่กิน Plan
  quota. UI แสดง `cached=true` badge ถ้าโดน cache.
- Error path ครบ: `claude` ไม่พบใน PATH → ข้อความไทยบอกติดตั้ง CLI + login.
- 3 unit tests: hero prefix strip, prompt content (phase + KDA + HP + persona),
  phase boundaries.

### `gsi.rs`: GameTick + `Deserialize`

frontend ต้องส่งทั้ง tick กลับมาให้ `request_advice` — add `serde::Deserialize`.

### `main.rs`: 5 commands ใหม่

- `speak_event(event, fallback, voice, rate)`: try `audio::play_random(event)`
  ก่อน — false → `tts::speak(fallback, ...)`. **ทุก call site เดิม** (HP danger,
  persona events, Belief Revision) เปลี่ยนเป็น command นี้ → ทันทีที่ user วาง
  WAV ใน folder ระบบจะใช้เสียงจริง โดยไม่ต้อง re-code.
- `voice_cache_status()`: ส่ง dir + count per event + total.
- `open_voice_cache_dir()`: explorer.exe.
- `request_advice(tick)`: async; `spawn_blocking(master::advise)`.
- `cancel_speech` รวม audio::cancel + tts::cancel → Belief Revision ตัดทั้ง 2
  เส้นทาง.

### Frontend

- **ทุก `invoke('speak')` ของ persona/danger/revision → `invoke('speak_event')`**
  — เปลี่ยน contract เดียวกัน, fallback path คงเดิม → ทดสอบ regression-safe.
- `VoiceCacheCard` ใหม่: status 🟢/⚫, count ต่อ event, "📂 เปิดโฟลเดอร์" +
  คำแนะนำวาง `{event}/01.wav`.
- `MasterCard` ใหม่ (full-width): ปุ่ม "ขอคำแนะนำ" disabled ถ้า !in_game (กัน
  spam ตอนยังไม่เริ่ม), ปุ่ม "🔊 อ่าน" speak advice หลังได้, error banner สีแดง
  ถ้า claude CLI fail.

## Verify (5-layer)

| Layer | ผ่าน |
|-------|------|
| `cargo test` | **15/15** (3 gsi + 5 setup + 3 tts + 1 audio + 3 master) |
| `tsc --noEmit` | clean |
| `pnpm tauri build` | MSI + NSIS + exe ออกครบ |
| **Smoke: `claude -p <Maiden prompt>`** | ตอบเข้า persona เป๊ะ: *"ขึ้น Aghanim's Scepter ต่อเลยค่ะ — เน็ตเวิร์ธ 8200 พอแล้ว ช่วยให้ Frostbite ปล่อยได้แม้ติดสกิล..."* — ไม่มีคำทักทาย, ตรงประเด็น, มีบริบท |
| Launch + POST tick | Live card sync ครบ (lvl 11, KDA 4/2/6, HP 68%) — UI grid layout ใหม่ render |

## บทเรียน

1. **Pattern shell-out รอบที่ N** = TTS (SAPI), registry (Steam path), VDF (Dota
   library), explorer (log dir), Claude CLI (G-Master). ทุกตัวใช้ `std::process::
   Command` + PowerShell/native binary. Cargo.toml ยังอยู่ที่ axum + tokio +
   serde + tauri + tauri-plugin-global-shortcut เท่านั้น (ไม่บวมเลย).
2. **SoundPlayer.PlaySync() = blocking** → kill PowerShell process = stop clip
   ทันที. ไม่ต้องใช้ `MediaPlayer` ที่ async กว่าและ stop ยากกว่า.
3. **`speak_event` pattern (try clip → fallback SAPI) ทำให้ asset/code orthogonal**
   — UI logic ไม่รู้ว่าเสียงมาจากไหน, ทันทีที่ user วาง clip ลงโฟลเดอร์
   ระบบ pick up โดยไม่ต้อง redeploy.
4. **Claude Plan quota เป็น sweet spot สำหรับ pet project** — ไม่ต้องเก็บ API
   key ไม่ต้อง billing setup, latency 3-8s รับได้สำหรับ "ขอคำแนะนำ" on-demand
   (ไม่ใช่ทุก tick). Persona prompt ตรงนิดเดียวก็ได้ Maiden ที่ฟังดูเหมือนเดิม.
5. **`#[tauri::command] async fn` + `spawn_blocking`** — ถูกต้องสำหรับ
   shell-out ที่ block 3-8s; ถ้าใส่ใน normal command จะ block ทั้ง tauri runtime
   ตลอด → game-tick events ค้าง.

## Status ของ 6 modules ตาม CLAUDE.md ตอนนี้

| Module      | สถานะ                                                      |
|-------------|------------------------------------------------------------|
| G-Sentry    | (fog-of-war) — ยังไม่เริ่ม, ต้อง minimap CV                  |
| G-Motion    | (path prediction) — ยังไม่เริ่ม, ต้อง G-Sentry data           |
| G-Signal    | (voice gank warning) — seed (HP danger) + Belief Revision ✓ |
| **G-Master**| (item/skill advisor) — **skeleton ใช้งานได้ใน turn นี้** ✓   |
| G-Sensory   | (overlay + perf) — เสร็จเต็ม                                |
| G-Log       | (feedback loop) — skeleton + privacy-first                  |

→ **6/6** มี skeleton อย่างน้อย; **4/6** มีของจริงที่ใช้งานได้ (G-Sensory + G-Signal
seed + G-Master + G-Log). เหลือแค่ G-Sentry / G-Motion ที่ต้องเกมจริงและ minimap CV.

## State ปลาย turn

- Branch `main` ahead of origin by 21 commits.
- Working tree: untracked เป็น orchestration ของ user (`ADR-O-002..004`, SPECs,
  `poc/`, `store/`) + .gitignore/engine.mjs edit ของ user — ไม่แตะ.
- งานต่อ: WAV asset generation (ขึ้นกับ user voice acting / TTS), G-Sentry
  minimap CV spike (เกมจริง), Control GUI polish.
