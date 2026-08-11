# G-Maiden — Engineering Spec

> เอกสารนี้แปลง requirement จาก PRD/SRS ให้เป็น **สัญญาทางวิศวกรรม (contracts)** ที่ implement ได้:
> input/output ของแต่ละโมดูล, schema เหตุการณ์ภายใน, budget latency รายขั้น, สัญญา API และโครงข้อมูล.
> ใช้คู่กับ [[technical-design-document]] (สถาปัตยกรรม) และ [[tech-stack]].

---

## 1. Latency Budget — G-Signal (SRS §5.1: target 250ms / max 300ms)

วัดจาก "เงื่อนไขอันตรายเป็นจริง" → "ได้ยินเสียงเตือน". ทุกขั้นเป็น Rust, **ไม่แตะ cloud/webview**.

| ขั้น | งาน | งบ (ms) | หมายเหตุ |
| --- | --- | --- | --- |
| 1 | Minimap capture frame ล่าสุดพร้อม | ~30 | DXGI duplication, capture loop วิ่งอยู่แล้ว |
| 2 | CV ตรวจไอคอนศัตรู + อัปเดตตำแหน่ง | ~50 | ONNX detector เล็ก / template match บนพื้นที่ minimap เท่านั้น |
| 3 | G-Motion ประเมินความน่าจะเป็น gank | ~20 | คำนวณบน ring buffer ในหน่วยความจำ |
| 4 | G-Signal เช็ค threshold (ตาม Sensitivity — default Med 0.65) + เลือกบทพูด | ~10 | rule eval + เลือก audio cache key |
| 5 | Interrupt เสียงที่กำลังเล่น + เริ่มเสียงใหม่ | ~30 | ส่งสัญญาณผ่าน channel ไป audio thread |
| 6 | Audio output buffer latency | ~40 | cpal/rodio output buffer |
| **รวม** | | **~180ms** | เหลือ headroom ~70–120ms ก่อนชน 300 |

**ข้อบังคับออกแบบ:** เสียงเตือนวิกฤตของ G-Signal **ต้องเป็น audio ที่ render ไว้ล่วงหน้า**
(สังเคราะห์สดด้วย Piper ~80–150ms อาจทำให้เกิน budget). บทพูดผันแปร (ชื่อไอเทม/ฮีโร่) ใช้วิธี
**slot-splicing** — ต่อคลิปประโยคหลัก + คลิปคำเฉพาะที่ cache ไว้.

---

## 2. โมดูล G-Series — สัญญา Input/Output

### 2.1 G-Sentry (Fog of War Monitor)
- **Input:** GSI tick (500ms poll ตาม SRS §3.1) + minimap enemy positions
- **State:** ต่อฮีโร่ศัตรู — `last_seen_at`, `last_seen_pos`, `is_visible`
- **Logic:** ถ้าฮีโร่ตำแหน่งแก๊ง (mid/pos4/pos5) `is_visible=false` นานเกิน **5s** → ออกเหตุการณ์
- **Output event:** `EnemyMissing { hero, missing_for_ms, last_pos, role }`

### 2.2 G-Motion (Heatmap / Path Prediction)

> **สถานะ (2026-08): สัญญาข้างล่างคือ *เป้าหมาย* ยังไม่ใช่ของที่ ship.** `motion.rs` เป็น
> time-off-map risk heuristic (มี heading-aware multiplier) — **ไม่มี heatmap และไม่มี path model
> ที่เรียนรู้** `predicted_paths[]` ยังไม่ถูกผลิตจริง. ห้ามอธิบายว่า heatmap/path prediction
> ship แล้ว (CR-005-W1B §52).

- **Input:** stream ของ `EnemyMissing` + ring buffer ตำแหน่งย้อนหลัง **5 นาที** (SRS §3.2)
- **Logic:** ประเมินเส้นทางหลบซ่อน/เส้น gank ที่น่าจะเป็น → ค่าความน่าจะเป็น 0–100%
- **Output event:** `GankRisk { lane, probability, predicted_paths[], eta_estimate }`

### 2.3 G-Signal (Real-time Gank Warning) — critical path
- **Input:** `GankRisk`
- **Logic:** ถ้า `probability` เกิน Danger Threshold ของ `Sensitivity` ที่ผู้เล่นเลือก
  (`signal.rs::thresholds` — **ค่าเริ่มต้น Med = 0.65**, Low = 0.85 คือ baseline ของ SRS, High = 0.50)
  → **interrupt** เสียงที่เล่นอยู่ทันที;
  ถ้ามี alert เก่ากำลังพูดและ confidence เปลี่ยน → trigger **Belief Revision** (ดู §3)
- **Output:** `SignalAlert { severity, voice_clip_key, interrupt: true }` → audio engine
- **Constraint:** ต้องจบใน budget §1
- **Speech priority contract:** `Critical = danger | gank | revision`, `Normal = manual/advice speech`, `Cosmetic = announcer events`; cosmetic ห้ามทับ critical
- **Level-up milestone contract:** announcer/persona path ใช้จุด `6, 12, 18, 25` และถือว่า "triggered" เมื่อข้าม milestone แม้ปลายทางจะไม่ตรง milestone พอดี (`11 -> 13` ต้องยัง fire)
- **Latency harness contract:** ต้องมี harness ที่วัดเส้นทาง in-process `GSI JSON parse -> team-side routing -> signal evaluate -> audio enqueue intent` เพิ่มจาก compute-only harness

### 2.4 G-Master (Strategic & Financial Advisor) — non-critical
- **Input:** GSI (net worth, items, abilities ของเรา + ที่มองเห็นของศัตรู) + meta dataset
- **Logic:** เทียบ net worth/ไอเทม → แนะนำ skill/item แก้ทาง (อ้าง meta ปัจจุบัน)
- **Output:** `AdvicePayload { topic, recommendation, rationale, persona_text }` (ผ่าน cloud หรือ SLM)

### 2.5 G-Sensory (Overlay & Hardware Optimization)
- **Input:** ทุก event ข้างบน + resource telemetry
- **Logic:** เรนเดอร์ glassmorphism HUD; **throttle ตัวเองเมื่อ FPS เกม drop เข้าใกล้ 3%**;
  ปรับโทนสี overlay ตาม element ฮีโร่ที่เล่น (PRD)
- **Output:** UI state + render commands; ไม่บัง minimap/skill bar/stats panel

### 2.6 G-Log (Feedback Loop) — local only
- **Input:** decisions ที่ Maiden ส่ง + ผลลัพธ์ (death/teamfight/win)
- **Logic:** เทียบคำแนะนำ vs ผล → ปรับ tuning params ของ G-Sentry/G-Signal เกมหน้า
- **Output:** เขียน G-Log เป็น JSONL local (`match-*.jsonl` ใน `%LOCALAPPDATA%\G-Maiden\logs\`, [`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs)); ส่ง `TuningDelta` กลับเข้า config (ดู §6)

---

## 3. Belief Revision — สัญญาพฤติกรรม (SRS §3.3, บังคับ ไม่ใช่ polish)

เมื่อ Maiden กำลังพูดบทหนึ่งอยู่ แล้วเงื่อนไขเปลี่ยน (เช่น ความเสี่ยงพุ่งข้ามเกณฑ์ Sensitivity กลางประโยค):

1. audio engine ได้รับ `Interrupt(reason)` ผ่าน channel ที่ priority สูงสุด
2. หยุดคลิปปัจจุบันที่ขอบคำถัดไป (word-boundary, ไม่ตัดดิบ)
3. เล่นคลิปสะดุด **"เอ๊ะ! เดี๋ยวก่อน!"** (cache) แล้วต่อด้วยบทเตือนใหม่
4. log การ revision ลง G-Log เพื่อวัดว่าการเปลี่ยนใจเร็ว/ช้าส่งผลต่อการรอดอย่างไร

**สถานะภายในต้องรองรับ:** `currently_speaking`, `interruptible`, `revision_in_flight`.

---

## 4. External Interface Contracts

### 4.1 Dota 2 GSI (SRS §4.2)
- รับผ่าน **HTTP POST → `http://127.0.0.1:3000/gsi`**, body เป็น JSON ของ Valve
- ติดตั้งไฟล์ `gamestate_integration_gmaiden.cfg` ใน `.../dota 2 beta/game/dota/cfg/gamestate_integration/`
- ตั้ง `buffer 0.1`, `throttle 0.1`, `heartbeat 30.0` เพื่อให้ tick ถี่พอ
- ฟิลด์ที่บริโภค: `map` (clock_time, game_state), `player` (net worth, gold), `hero` (xpos/ypos/level/hp),
  `abilities`, `items`, `provider`
- **ข้อจำกัดสำคัญ:** GSI **ไม่ส่งตำแหน่งฮีโร่ศัตรู** → ตำแหน่งศัตรูมาจาก minimap CV (ดู TDD R-02)

### 4.2 Cloud Cognitive Engine — Claude CLI / Anthropic API (SRS §4.2)
- โค้ดจริง: **Claude CLI** (subprocess) หรือ **Anthropic Messages API** `POST https://api.anthropic.com/v1/messages` (`model: claude-haiku-4-5`, [`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs))
- streaming (SSE-style chunks) → feed เข้า narration queue (preemptible)
- timeout สั้น; ถ้า fail → fallback local SLM ผ่าน **Ollama** (resilience)
- ส่งเฉพาะ context ที่ผ่าน redaction — **ไม่ส่งข้อมูลระบุตัวตน/ไฟล์ G-Log ดิบ**

> **สถานะ (2026-07): Gemini เป็นเป้า Phase-4 — ยังไม่ wired. Cloud brain ปัจจุบันคือ Claude CLI / Anthropic Messages API (`claude-haiku-4-5`) แล้ว fallback เป็น Ollama SLM.**

### 4.3 TTS Module
- **Critical:** อ่านจาก audio cache (key → PCM/Ogg ที่ render ไว้)
- **Persona ทั่วไป (planned/opportunistic):** Piper (ONNX voice model) สังเคราะห์สด — ใช้เฉพาะเมื่อพบ `piper.exe` + โมเดลข้าง binary; ไม่งั้น default = Windows SAPI
- **Fallback:** Windows SAPI
- สัญญา: `synthesize(text, voice_profile) -> AudioHandle` ; `play(handle, {interrupt})`

### 4.4 Global Hotkeys (SRS §4.1)
- `Alt + M` → **สลับ mute/unmute เสียง Maiden** (main.rs; unmute กลับเป็นระดับเดิม). > **สถานะ (2026-07): ไม่มี `request_situation_summary` — `Alt+M` คือ mute toggle**
- ลงทะเบียนผ่าน Tauri global-shortcut plugin
- (ขยายภายหลัง: toggle overlay, mute, sensitivity +/-)

---

## 5. Internal Event Schema (Rust core ↔ UI ผ่าน Tauri events)

```rust
// ทุก event มี timestamp_ms (monotonic) เพื่อวัด latency จริง
enum CoreEvent {
    GameTick      { clock: i32, state: GameState },
    EnemyMissing  { hero: HeroId, missing_for_ms: u32, last_pos: Vec2, role: Role },
    GankRisk      { lane: Lane, probability: u8, paths: Vec<Path>, eta_ms: u32 },
    SignalAlert   { severity: Severity, clip_key: String, interrupt: bool },
    Advice        { topic: Topic, text: String, rationale: String },
    Narration     { text: String, source: BrainSource }, // Cloud | LocalSLM | Template
    ResourceStats { ram_mb: f64, cpu_pct: f64, over_budget: bool,
                    gpu_pct: f64, gpu_temp_c: f64, vram_used_mb: f64, vram_total_mb: f64 },
}
```

UI subscribe ผ่าน event แยกชื่อ (ไม่มี channel รวม `core-event`): `game-tick`, `gsi-status`, `resource-stats`, `minimap-cv`, `gank-alert`, `gank-clear`, `enemy-missing`, `announcer-banner`, `advice-update`, `buyback-advice`, `buyback-narrative`, `capture-mode`, `volume-change`, `oauth-callback`, `oauth-error`, `preview-kill`. commands ที่สั่งจาก UI เช่น `set_cv_signal_sensitivity`, `set_cv_signal_enabled` (ไม่มี `set_sensitivity`/`toggle_module`).

> **สถานะ (2026-07): `enum CoreEvent` ด้านบนเป็นแบบจำลอง — โค้ดจริง emit แต่ละ event แยกชื่อตามรายการนี้ และ `ResourceStats` มาจาก [`governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs).**

---

## 6. โครงข้อมูล G-Log (JSONL flat files, local-only)

> **สถานะ (2026-07): ไม่ใช่ SQLite/`rusqlite` — G-Log เก็บเป็น JSONL flat files ([`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs))**

หนึ่งไฟล์ `match-*.jsonl` ต่อแมตช์ใน `%LOCALAPPDATA%\G-Maiden\logs\` — append หนึ่ง JSON object ต่อ tick/เหตุการณ์ (match-start/decision/signal/outcome) ไม่มีสคีมา SQL, ไม่มี network egress. tuning params ที่ G-Log จูนกลับถูกเขียนแยกเป็น config ในโฟลเดอร์เดียวกัน (ป้อน feedback loop, SRS §3.6).

tuning params ที่ G-Log จูนถูกป้อนกลับเข้า G-Sentry/G-Signal ตอนเริ่มแมตช์ถัดไป (ปิด feedback loop, SRS §3.6).
**ไม่มี network egress จากตารางเหล่านี้.**

---

## 7. Orchestrator — Role-based Multi-Platform Agent Dispatch

> ADR: [ADR-O-005](../orchestration/docs/ADR-O-005--provider-registry.md) ·
> Spec: [SPEC--PROVIDER-REGISTRY](../orchestration/docs/SPEC--PROVIDER-REGISTRY.md) ·
> Guide: [GUIDE--ADDING-PROVIDER](../orchestration/docs/GUIDE--ADDING-PROVIDER.md)

G-Maiden ใช้ **G-Orch** orchestrator สำหรับจัดการ development agents (AI ที่เขียน code,
review, และ plan). G-Orch dispatch task ผ่าน **role-based provider registry** —
แยกชัดเจนระหว่าง "ต้องทำอะไร" (Role) กับ "ใครทำ" (Provider):

```
Task Type  →  Role  →  Provider (fallback chain + capability matching)
```

### 7.1 Roles (5 roles)

| Role | requires | ใช้กับ | fallback chain |
| --- | --- | --- | --- |
| architect | `long_context` | spike, plan, architecture | claude:opus → openrouter → ollama |
| coder | `file_edit` | code, test, integration | claude:sonnet → codex → antigravity → ollama |
| worker | `text_gen` | scaffold, config, docs | claude:haiku → ollama → openrouter |
| reviewer | `code_review` | Verify Gate | claude:opus → claude:sonnet |
| scout | `text_gen` | research, draft | ollama → claude:haiku → openrouter |

### 7.2 Providers (5 platforms)

| Provider | Transport | Capabilities | Resilience |
| --- | --- | --- | --- |
| claude | subprocess (CLI) | file_edit, shell_exec, code_review, streaming, long_context | Primary |
| ollama | HTTP (local) | text_gen | Offline-ready, $0 |
| codex | subprocess (CLI) | file_edit, shell_exec, sandbox | OpenAI fallback |
| openrouter | HTTP (API) | text_gen, streaming, vision, long_context | Multi-model gateway |
| antigravity | subprocess | text_gen, file_edit | IDE agent |

### 7.3 Capability tags

`file_edit` · `shell_exec` · `code_review` · `text_gen` · `streaming` · `vision` · `long_context` · `sandbox`

Role ประกาศ `requires`; Provider ประกาศ `capabilities`.
`resolveForRole()` เดิน fallback chain → skip provider ที่ไม่ครบ capability → **first match wins**.

### 7.4 SRS resilience compliance

- Cloud provider ล่ม → coder role automatic fallback ไป codex → ollama
- Reviewer ใช้ role-based resolution แทน hardcoded tier map (ADR-O-001)
- Scout/worker เริ่มจาก ollama (local) → ทำงานได้ offline
- เพิ่ม provider ใหม่โดยไม่แก้ engine core (แก้ 2 ไฟล์: config.json + providers.mjs)

### 7.5 Prompt routing

| กลุ่ม | Providers | Prompt style |
| --- | --- | --- |
| Full-agent | claude, codex, antigravity | ชี้ doc paths ให้ agent อ่านเอง |
| Text-only | ollama, openrouter | Inline scaffold + small-model rules |

**Implementation:** [`orchestration/providers.mjs`](file:///g:/G-Maiden/orchestration/providers.mjs), [`orchestration/config.json`](file:///g:/G-Maiden/orchestration/config.json), [`orchestration/engine.mjs`](file:///g:/G-Maiden/orchestration/engine.mjs)

### 7.6 Live Tauri events (command deck) & GID/account contract

Command deck (CR-002 Phase 2a/2b, merged `170805b8`) subscribes to live Tauri events via
[`useCompanionData`](file:///g:/G-Maiden/src/src/companion.ts#L927), feeding pure builders in `src/src/live/` that are merged over a MOCK
fallback (renders signed-out/offline). Events actually emitted: `game-tick`, `gsi-status`,
`minimap-cv`, `enemy-missing`, `gank-alert`, `gank-clear`, `resource-stats`. Live builders อยู่ใน `src/src/live/` (เช่น [`buildTelemetry`](file:///g:/G-Maiden/src/src/live/buildTelemetry.ts)/[`buildWeekly`](file:///g:/G-Maiden/src/src/live/buildWeekly.ts)/[`buildInsights`](file:///g:/G-Maiden/src/src/live/buildInsights.ts)/[`buildHistory`](file:///g:/G-Maiden/src/src/live/buildHistory.ts)).

Accounts/GID (ADR-14): optional, additive Google-OAuth sign-in producing a GID
(cross-G-series identity; codec [`src/src/gid.ts`](file:///g:/G-Maiden/src/src/gid.ts), format `G-[Gen][Payload][Checksum]`).
Backend is the shared Supabase project `gstore` (`profiles` table + RLS). Steam identity
links via [`src-tauri/src/identity.rs`](file:///g:/G-Maiden/src-tauri/src/identity.rs) ([`resolve_steam_id`](file:///g:/G-Maiden/src-tauri/src/identity.rs#L120)) and loads the player's public
OpenDota profile + baselines. Match/CV/G-Log data stays local; the account stores identity
+ public data only (opt-in per ADR-11).

> See [[ADR-14-gid-account-identity]] and
> [[CR-002-Phase2-wire-backend]].

---

## 8. Definition of Done (วัด constraint จริง)

ทุกฟีเจอร์ต้องผ่าน gate ก่อนถือว่าเสร็จ:
- [ ] G-Signal p99 end-to-end ≤300ms, p50 ≤250ms (วัดจาก `timestamp_ms`)
- [ ] background CPU ≤2.5% บนชิปเซ็ตระดับกลาง (วัดด้วย harness 10 นาที)
- [ ] CPU gate ต้องพิสูจน์จาก sustained app-path harness; Windows Task Manager peak `20%+` ณ 2026-07-08 ยังถือว่า fail spec จนกว่าจะยืนยัน steady-state อยู่ใน budget
- [ ] CPU investigation ต้องแยก `Rust host` vs `WebView2 child processes` vs `sidecars/subprocesses`; harness หลักคือ `tests/perf/src/bin/perf_cpu_tree.rs`
- [ ] RAM ≤400MB (สถานะ cloud-online, SLM ไม่โหลด)
- [ ] FPS drop ≤3% (วัดเทียบ baseline เกมจริง)
- [ ] cloud-loss test: ปิดเน็ต → G-Sentry/G-Signal ยังทำงานครบ
- [ ] no-egress test: ตรวจว่าไม่มี request พา G-Log/สถิติออกนอกเครื่อง
- [ ] orchestrator: `resolveForRole()` resolves ทั้ง 5 roles (parseModel → capability check → return)
- [ ] orchestrator: cloud-loss → coder/scout fallback chain ลงถึง ollama
- [ ] orchestrator: เพิ่ม provider ใหม่แก้ ≤2 ไฟล์ (config.json + providers.mjs)



## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| — | 2026-07-19 | symbol-link coverage extension (G1.5) |
