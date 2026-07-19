---
title: "CR-001 Review & Corrected Multi-Agent Execution Plan (DXGI Migration)"
doc_id: "CR-001-REVIEW-and-execution-plan"
status: "Wave A+B code-complete & gate-green (2026-06-29); Wave C in-game test pending Boss"
version: "0.1.0"
updated: "2026-06-29"
owner: "Boss"
source_of_truth: true
related_docs: ["ADR-13-dxgi-capture-migration", "IMPL-PLAN-DXGI-migration", "DXGI-task-assignment"]
---

# CR-001 Review & Corrected Multi-Agent Execution Plan

> **Purpose**: ผลตรวจสอบ CR-001 (DXGI migration) เทียบกับโค้ดจริง ณ 2026-06-29 + แผน
> multi-agent ที่ปรับให้ตรงกับ tool ที่มีจริง (Claude subagents) + appendix interface
> signatures ที่ verify แล้ว. ไฟล์ต้นฉบับสามฉบับ **ไม่ถูกแก้** — เอกสารนี้ระบุ patch-point
> ให้ทั้งหมด. **ยังไม่เริ่มเขียนโค้ด — รอ Boss อนุมัติ.**

---

## A. Verification Verdict — ✅ CR ใช้ได้ (greenfield)

ยังไม่มีงาน migration เริ่มเลย: `dxgi.rs` และ `capture_wgc.rs` **ยังไม่มีในโปรเจกต์** →
เป็น clean greenfield. โครงสร้างที่ CR อ้างถึงตรงกับโค้ดจริงทั้งหมด:

| CR อ้าง | สถานะจริง (file:line ณ 2026-06-29) |
|---|---|
| `capture.rs` ใช้ WGC, `pub fn start(app)` → thread → `on_frame_arrived` | ✅ `capture.rs:276`, callback `:135–266` |
| `Frame::from_bgra(w,h,Vec<u8>)` รับ BGRA8 validate len | ✅ `cv/mod.rs:29` |
| Pipeline gate→calib→crop→prefilter→detect→sentry→motion→signal→emit | ✅ ทุก signature ตรง (ดู Appendix D) |
| `MinimapRegion::for_resolution(w,h)` | ✅ `cv/region.rs:34` |
| `governor::cpu_throttle()→bool`, `runtime::in_game()→bool` | ✅ `governor.rs:28`, `runtime.rs:62` |
| `perf_p7.rs`, `modules.json` (g-sensory เจ้าของ capture.rs) | ✅ มีจริง |

---

## B. Required Corrections — ⚠️ ต้อง patch ก่อน execute

| # | CR เขียนไว้ | ความจริง → patch-point |
|---|---|---|
| **B1** | ใช้ `windows` crate **0.58**, เพิ่ม `[dependencies.windows]` block ใหม่ (DXGI-task-assignment L100–111) | จริงคือ **`windows = "0.61"`** มีอยู่แล้ว (`Cargo.toml:21`, feature `Win32_UI_Shell`). ต้อง **merge** features เพิ่ม ไม่ใช่เพิ่ม block ใหม่ → จะได้ duplicate-key. โค้ด unsafe ต้องเขียนตาม **API 0.61** (signature `AcquireNextFrame`/`Map`/`CopyResource` ต่างจาก 0.58). แก้ทุก prompt ที่เขียน "0.58+". |
| **B2** | SPR04-01: "perf_p7 assert **CPU ≤ 2.5%**, RAM ≤ 400 MB" | `perf_p7.rs` วัด **RAM 400MB** (`:54`) + **FPS-drop 3%** (`:57`) ผ่าน PresentMon ETW — **ไม่มี** assert CPU% ตรงๆ. แก้ task ให้ตรง: gate จริงคือ RAM+FPS; CPU% ดูจาก `resource-stats`/Task Manager แยก. |
| **B3** | SPR04-05: แก้ "CLAUDE.md gotcha #2 / Tauri v2 gotchas" | `CLAUDE.md` **ไม่มี** section "gotchas" — น่าจะอยู่ใน **AGENTS.md**. ต้องยืนยัน target ไฟล์ก่อนแก้ (ดู Open Question OQ-1). |
| **B4** | cadence 8/15Hz → **4/8/2Hz** + อ่าน `cpu_throttle()` เลือก interval | ของเดิม (`capture.rs:43–57`, `:156–163`) ใช้ `sentry.missing` อย่างเดียว, **ไม่อ่าน** `cpu_throttle` ในลูป. การลด detection rate + wire throttle = behavior **ใหม่** (ตั้งใจ, รับได้เพราะ gank window 10–12s) แต่ต้องบันทึกว่าเป็น product-behavior change. |
| **B5** | Model tier = Ollama (gemma4:12b / Aroow-Rust / gemma-e2e) + Opus/Sonnet | ใน harness นี้ **ไม่มี Ollama** — มีแต่ Claude subagents. Tier mapping ทั้งหมดใน [[DXGI-task-assignment]] ใช้ไม่ได้ → remap ตาม §C. |

---

## C. Corrected Multi-Agent Orchestration (Claude subagents)

**ข้อเท็จจริงเชิงสถาปัตยกรรม**: critical path เป็น **serial** —
`Cargo.toml → dxgi.rs → capture refactor` เป็นโซ่ unsafe ข้ามไฟล์ที่ต้อง reason ต่อเนื่อง,
**ไม่ควร fan-out**. งานที่ขนานได้จริงคือ leaf tasks หลัง core compile เท่านั้น. ดังนั้น
"multi-agent" ที่ซื่อสัตย์ = ขับ core เอง + fan-out เฉพาะ Wave B.

### 🔴 Wave A — Core (serial, Opus-tier ขับเอง · ไม่ fan-out)

| Step | งาน | Target | แทน SPR |
|---|---|---|---|
| **A1** | merge DXGI/D3D11 features เข้า `windows="0.61"`; ทำ `windows-capture` เป็น `optional` ใต้ `[features] wgc` | `src-tauri/Cargo.toml` | SPR01-01 (+B1) |
| **A2** | เขียน **`src-tauri/src/dxgi.rs`**: `DxgiCapture::new / acquire_frame / Drop` + `DXGI_ERROR_ACCESS_LOST` recreate + `#[ignore]` tests — windows 0.61 | `src-tauri/src/dxgi.rs` (ใหม่) | SPR01-02/03/04/05 |
| **A3** | `mod dxgi;` ใน `main.rs` → `cargo check` | `src-tauri/src/main.rs` | (ใหม่) |
| **A4** | rename `capture.rs`→`capture_wgc.rs` (feature-gate); เขียน `capture.rs` ใหม่ = `CaptureState` + `process_frame` (ยกของเดิม L135-266 มาทั้งดุ้น) + `crop_bgra` + `select_interval` + `run_dxgi` loop + Lite fallback + `capture-mode` events + cadence consts (B4) | `src-tauri/src/capture.rs` + `capture_wgc.rs` | SPR02-01/02/03/04/05 |
| **A5** | DoD gate: `cargo check` + **`cargo clippy -D warnings`** (CI gate จริงคือ clippy — ต้อง `#![allow(dead_code)]` ฝั่ง wgc) | — | DoD P1+P2 |

### 🟢 Wave B — Leaf tasks (parallel agents จริง · หลัง A compile)

| Agent | งาน | Target | แทน SPR |
|---|---|---|---|
| **B-fe** | `captureMode` state + listener (control useEffect `App.tsx:1466`) + badge ใน System card (`:1783`) + tooltip → `tsc --noEmit` | `src/src/App.tsx` | SPR03-01/02 |
| **B-doc** | AGENTS.md/CLAUDE.md gotcha (OQ-1) + `modules.json` bump g-sensory + perf_p7 comment review (B2) | docs + `modules.json` + `perf_p7.rs` | SPR04-04/05/06 (+01 review) |

→ คนละไฟล์ ไม่ชนกัน = ขนานได้จริง (parallel Agent calls หรือจัดเป็น Workflow 1 phase ก็ได้).

### ⚫ Wave C — Validation (manual, automate ไม่ได้)

- ผม: `cargo build --release`
- **Boss**: Dota borderless + G-Maiden + OBS → error.log SLOW=0 / gank alert / FPS; แล้วสลับ
  exclusive fullscreen → badge "Lite" (SPR04-02/03)

**เวลาประเมิน**: Wave A ~half-day (Opus รวดเดียว) · Wave B ~1–2h ขนาน · Wave C = เวลาบอสเล่น 1 match.

---

## D. Verified Interface Appendix (ใช้ตอน execute — ไม่ต้องค้นใหม่)

> **Note (post [[CR-002-Phase2-wire-backend|CR-002]]):** the [`src/src/App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) line anchors below predate the
> App.tsx/CommandDeck.tsx split — they now point to [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) /
> [`src/src/live/`](file:///g:/G-Maiden/src/src/live/) instead.

**capture.rs (เดิม, จะกลายเป็น [`capture_wgc.rs`](file:///g:/G-Maiden/src-tauri/src/capture_wgc.rs))**
- `pub fn start(app: AppHandle)` `:276`; invoked [`main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs)`:421`
- `struct MinimapCapture` `:87–105` fields: `app, region, icon, detector, sentry, motion, signal, start, last_processed, last_emit, last_calib`
- `on_frame_arrived` `:135–266`: gate `runtime::in_game()` → calib `:147` (`calibration::push_full_bgra`, ~9Hz) → adaptive throttle `:156–163` (`suspicious = !sentry.missing(now).is_empty()`) → crop `frame.buffer_crop(x,y,end_x,end_y)` `:175` → `as_nopadding_buffer` `:181` → `Frame::from_bgra(w,h,packed)` `:183` → prefilter/detect → sentry/motion/signal → emit `minimap-cv`/`gank-alert`/`gank-clear`/`enemy-missing` → SLOW watchdog `:259`
- consts `:43–57`: `CAPTURE_HZ=15, NORMAL_INTERVAL_MS=125, DEBUG_EMIT_INTERVAL_MS=200, SLOW_FRAME_MS=250`
- `voice_interrupt(event,fallback)` `:357`; `GANK_LINE`/`REVISION_LINE` `:65/:67`; `model_dir(app)` `:369`
- WGC settings `modern_settings` `:320` / `compat_settings` fallback `:301–316` (DrawBorderSettings::WithoutBorder = Win10 crash source)

**Downstream (ต้องคงเดิม)** — all lock-free reads / pure methods:
- `cv::Frame{width,height,bgra}` [`cv/mod.rs`](file:///g:/G-Maiden/src-tauri/src/cv/mod.rs)`:22`; `from_bgra(usize,usize,Vec<u8>)->Option<Frame>` `:29`
- `prefilter_candidates(&Frame, icon:usize, frac:f32)->Vec<(i32,i32)>` [`prefilter.rs`](file:///g:/G-Maiden/src-tauri/src/cv/prefilter.rs)`:29` (`DEFAULT_THRESHOLD_FRAC=0.18`)
- `Detector::detect(&self,&Frame,&[(i32,i32)],icon)->Vec<Detection>` [`detector.rs`](file:///g:/G-Maiden/src-tauri/src/cv/detector.rs)`:109`; `Detection{label,name,x,y,score}` `:42`
- `Sentry::update(&mut,&[Detection],&MinimapRegion,now_ms)->Vec<EnemyMissing>` [`sentry.rs`](file:///g:/G-Maiden/src-tauri/src/sentry.rs)`:50`; `missing(now_ms)->Vec<(String,u64,(f32,f32))>` `:87` (threshold 5000ms)
- `Motion::record(...)` [`motion.rs`](file:///g:/G-Maiden/src-tauri/src/motion.rs)`:54`; `assess(&missing,now_ms)->GankRisk{probability,missing_heroes,eta_ms}` `:80` (window 300000ms)
- `Signal::evaluate(&GankRisk)->SignalEvent{Alert(SignalAlert),Revision,None}` [`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs)`:98`; `set_sensitivity(Sensitivity{Low,Med,High})` `:92`
- `MinimapRegion{x,y,side}` [`region.rs`](file:///g:/G-Maiden/src-tauri/src/cv/region.rs)`:22`; `for_resolution(w,h)` `:34`; `icon_size()`; `pixel_to_normalised()`
- [`governor::cpu_throttle()`](file:///g:/G-Maiden/src-tauri/src/governor.rs)`->bool` `:28`; [`runtime::in_game()`](file:///g:/G-Maiden/src-tauri/src/runtime.rs)`->bool` `:62`

**Frontend `src/src/App.tsx`**
- control listeners useEffect `:1466–1478` (game-tick, overlay-ready, gsi-status, resource-stats) — เพิ่ม `capture-mode` ที่นี่
- System card `:1767–1796`; resource stats `:1783–1795` (RAM `:1785`, CPU `:1788`, over_budget `:1791`) — badge slot
- useState pattern `:1350–1356`; palette `C` `:158` (`ice#8fd4ff, ok#5be3a7, warn#ffcf6b, bad#ff7b85, line rgba(143,212,255,0.16)`); glass `panel(op)` `:247`

**Tooling**
- [`tests/perf/src/bin/perf_p7.rs`](file:///g:/G-Maiden/tests/perf/src/bin/perf_p7.rs): `RAM_BUDGET_MB=400` `:54`, `FPS_DROP_MAX_PCT=3.0` `:57` (ไม่มี CPU const)
- [`modules.json`](file:///g:/G-Maiden/modules.json): `g-sensory` `:12–22` ver `1.0.0` (source รวม capture.rs); app `0.7.2` `:4`

---

## E. Risks & Open Questions (ต้อง Boss ตัดสิน)

- **R1** unsafe DXGI บน windows 0.61: correctness ตรวจอัตโนมัติได้แค่ `cargo check`+`clippy`; ของจริงต้อง in-game test (Wave C). Unit test เป็น `#[ignore]` (ต้องมี display).
- **R2** DXGI ก็ fail บน **exclusive fullscreen** เหมือน WGC → พึ่ง Lite mode + บอสต้องตั้ง Dota borderless (`-window -noborder`). DXGI ต่างตรง fail-fast ไม่ค้าง 1.5s/frame.
- **R3** ต้อง handle `DXGI_ERROR_ACCESS_LOST` (alt-tab/res change) → recreate duplication ไม่ใช่ crash.
- **OQ-1 ✅ RESOLVED (2026-06-29)** gotcha update ลง **ทั้ง AGENTS.md และ CLAUDE.md** (B3)
- **OQ-2 ✅ RESOLVED** cadence ใหม่ **4/8/2 Hz** ยืนยันใช้ (ยอม minimap detection ช้าลง ~125ms แลก CPU) (B4)
- **OQ-3 ✅ RESOLVED** เก็บ WGC ใต้ `--features wgc` เป็น rollback; **default = DXGI** ยืนยัน

---

## F. Go / No-Go

สถานะ: **✅ APPROVED (2026-06-29) — executing Wave A** (A1→A5), gate ด้วย `cargo clippy -D warnings`,
แล้ว fan-out Wave B, ปิดท้าย Wave C (manual). ไม่ tag release จนกว่าจะผ่าน in-game (batching policy).

## Changelog
| Version | Date | Summary |
|---|---|---|
| 0.1.0 | 2026-06-29 | Review CR-001 vs codebase: greenfield confirmed, 5 corrections (windows 0.61, perf_p7 gate, doc target, cadence, model tier), corrected Wave A/B/C orchestration + verified interface appendix |
| 0.2.0 | 2026-06-29 | Boss resolved OQ-1/2/3 (both docs / 4-8-2 Hz / wgc feature-flag) → approved; Wave A execution started |
| 0.3.0 | 2026-06-29 | **Wave A done**: dxgi.rs (windows 0.61, 1 fix: GetDesc by-value) + capture.rs DXGI refactor + capture_wgc.rs frozen rollback; gates green (cargo check default, clippy -D warnings default, cargo check --features wgc). **Wave B done** (parallel agents): App.tsx capture-mode badge+tooltip (tsc PASS), AGENTS.md+CLAUDE.md gotcha, modules.json g-sensory 1.1.0, perf_p7 comment. **Wave C (in-game) pending Boss.** |
| 0.1.0 | 2026-07-19 | link/metadata sweep (G1.5) — reconcile frontmatter version with changelog |
