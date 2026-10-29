---
title: "FEAT-G-SENSORY — Overlay & Hardware Optimization"
doc_id: "FEAT-G-SENSORY"
status: "active"
version: "0.2.7"
updated: "2026-10-29"
owner: "Boss"
source_of_truth: false
complexity: "C-2"
risk: "MEDIUM"
---

# FEAT-G-SENSORY — Overlay & Hardware Optimization

> **Module:** G-Sensory · **Priority:** Core · **Phase:** 0–1 (scaffold), 7 (hardened)
> **SRS:** [[software-requirements-specification|SRS]] §3.5 · [[engineering-spec|Eng Spec]] §2.5, §7 · [[technical-design-document|TDD]] §2, §7

---

## 1. Purpose

เรนเดอร์ overlay HUD โปร่งใสทับหน้าจอ Dota 2 + จัดการ resource budget (CPU, RAM, FPS).
เป็นทั้ง **UI layer** และ **resource governor** ของทั้งระบบ.

## 2. Responsibilities

### 2a. Overlay Rendering

- Glassmorphism HUD: background `#08090c`, frosted panels `rgba(18, 20, 28, 0.72)`
- ปรับสีตาม element ของฮีโร่ที่เล่น (ice = Crystal Maiden default)
- **ห้ามบัง:** minimap, skill bar, stats panel, shop
- Transparent + always-on-top + click-through (Tauri window)
- แสดง: gank warnings, advice, narration text, resource stats

### 2b. Resource Governor (TDD §7)

วัดทุก **1 วินาที** ([`governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs) [`POLL_INTERVAL_S`](file:///g:/G-Maiden/src-tauri/src/governor.rs#L45) `= 1`) → emit `resource-stats`
event ไปยัง control window แล้วเช็ค budget:

| Resource | Limit | Mitigation |
| --- | --- | --- |
| CPU budget | ≤10% whole-app normalized CPU per 1-second sample; OS Job operating hard cap 8% | One-second group accounting and capture throttle; release at ≤8% for 3 samples |
| RAM | ≤900,000,000 bytes aggregate Working Set | รวมใน over-budget flag เดียวกัน |
| FPS impact | ≤3% | GATE P7 PresentMon/ETW receipt; live acceptance ยังไม่ยืนยัน |

> **สถานะ (2026-10-29):** ตาม [[mvp-decisions]] (`docs/product/mvp-decisions.md`), `measure()` อ่าน CPU สะสมของ Windows Job Object group ทุก 1 วินาทีและใช้ logical CPU capacity เป็นตัวหาร; `over_budget` เป็นจริงเมื่อ RAM >900,000,000 bytes, CPU >10% หรือ runtime CPU group query อ่านไม่ได้. ก่อน Tauri สร้าง WebView2, governor ต้องตั้ง OS operating hard cap 8% และ `KILL_ON_JOB_CLOSE`. แอปที่สร้าง children ผ่าน `CreateProcess` โดยไม่ใช้ breakaway flag จะอยู่ใน job ตาม Windows default; การรวม WebView2 process ยังต้องยืนยันด้วย Windows acceptance. หากสร้าง/configure/assign job ไม่ได้ แอปบันทึก error แล้วออกก่อนสร้าง Tauri/WebView หรือ sidecar; จะไม่มี degraded startup. หลัง setup สำเร็จแต่ runtime query ล้มเหลว UI แสดง unavailable และคง `CPU_THROTTLE` แม้ OS hard cap ยังทำงาน. ไม่มี fallback ที่อนุมานจากชื่อหรือ PID. การลด capture cadence ราวครึ่งหนึ่งเป็น soft mitigation เพิ่มเติม ไม่ใช่เพดาน CPU.
>
> **CPU gate ของ MVP ยังไม่ถือว่าผ่าน** จนกว่าจะเก็บ one-second job-group samples และ process-group harness บนเส้นทางจริงของ app; hard cap ที่ตั้งสำเร็จไม่พิสูจน์ FPS หรือ G-Signal latency. ตาราง "unload SLM / ปิด blur / static HUD" ยังเป็น
> aspirational (ยังไม่ได้ทำ). FPS มี measurement apparatus แล้วใน
> [`perf_p7`](file:///g:/G-Maiden/tests/perf/src/bin/perf_p7.rs) แต่ receipt จริงจากเกมยังไม่ถูกใช้เป็น acceptance proof.
>
> **Open issue (2026-07-08 observation; ต้องตรวจซ้ำหลังใส่ hard cap):** Windows Task Manager เคยแสดง process CPU peak `20%+` ก่อนมี Job Object hard cap. ปัจจุบัน startup ปฏิเสธการเปิดแอปเมื่อสร้าง/configure/assign job ไม่สำเร็จ. หาก runtime accounting query ล้มเหลวหลังตั้ง cap ได้ CPU จะแสดง unavailable และ capture จะ throttle โดย OS cap ยังคงตั้งอยู่. Sustained CPU, FPS และ latency acceptance ของ build ใหม่นี้ยังไม่มี receipt.

> **GPU feeder lifecycle:** เมื่อ Tauri ได้รับ normal `Exit` จะหยุด `gpu-feeder` child ที่แอปเป็นผู้สร้างโดยตรง. เมื่อ Job Object setup สำเร็จ job handle ที่แอปสร้างถูกเก็บไว้ใน `PROCESS_JOB` ตลอดอายุโปรเซสและโค้ดไม่ duplicate/inherit handle; feeder ที่ spawn ผ่าน `Command` โดยไม่ใช้ breakaway flag อยู่ใน job ตาม Windows default, และการปิด handle สุดท้ายจะยุติสมาชิก job เมื่อแอป crash/ถูก terminate. มติ fail-closed ทำให้ startup ปัจจุบันไม่สร้าง feeder เมื่อ Job Object setup ล้มเหลว; feeder ที่เหลือจากรุ่นก่อนซึ่งเปิด degraded mode อยู่นอก job อาจค้างหลัง host abnormal exit. นี่ยังไม่มี Windows crash-run receipt จึงไม่อ้างว่า orphan-proof ที่ผ่านการตรวจรับแล้ว; WebView2 membership ต้องยืนยันแยก.

### 2c. P7 FPS receipt contract

`tests/perf/src/bin/perf_p7.rs` measures `dota2.exe` through a two-phase local PresentMon/ETW run:

```text
fps = 1000 / mean(MsBetweenPresents)
fps_drop_pct = max(0, (baseline_fps - overlay_fps) / baseline_fps * 100)
PASS when fps_drop_pct <= 3.0
```

Every baseline, overlay, and prerequisite failure writes the same
`gmaiden.p7-fps-receipt` envelope (`schema_version=1`) with source, transport, sample window,
formula, fallback, and local-only privacy metadata. Missing Dota, PresentMon, elevation,
operator confirmation, or a valid baseline produces `SKIP`/exit `77`; it cannot produce PASS.
The receipt contains no GSI, CV, G-Log, match, or player data. A real overlay-on receipt with
`verdict=pass` is still required before claiming the ≤3% acceptance criterion.

### 2d. Global Hotkeys

Global shortcuts จริงจาก [`main.rs`](file:///g:/G-Maiden/src-tauri/src/main.rs) (ทำงานแม้ Dota 2 โฟกัสอยู่):

| Hotkey | Action |
| --- | --- |
| `Ctrl + Alt + S` | ซ่อน/แสดง overlay |
| `Alt + ↑` | เพิ่มระดับเสียง +10% |
| `Alt + ↓` | ลดระดับเสียง −10% |
| `Alt + M` | ปิด/เปิดเสียง (mute toggle — กลับเป็นระดับเดิมเมื่อ unmute) |

## 3. Input

| Source | Data |
| --- | --- |
| All G-Series modules | `CoreEvent` (EnemyMissing, GankRisk, SignalAlert, Advice, Narration) |
| Resource telemetry | RAM MB, CPU %, GPU load/temp, VRAM (จาก `gpu-feeder` sidecar) |
| User input | Hotkeys, overlay settings |

## 4. Output

- UI state → React overlay (Tauri events: `listen('core-event', ...)`)
- Render commands → GPU-composited transparent window
- Announcer pack banner → overlay: other packs retain the existing image path. VRZO uses the selected clip/event and decoded-audio SHA-256 to resolve one of 21 bundled muted composite WebM visuals; playback identity and session/pack scope fence starts and stops. A normal completion allows ≤1.4 s silent outro, while cancellation/preemption/new playback or scope change clears it. Inventory provides a variant picker when VRZO is equipped. Matching a catalog hash does not assert Store signature or entitlement. WebView2 alpha/mute, cold timing, live sync and resource acceptance remain NOT_RUN; see [[vrzo-banner-validation]] (`docs/operations/vrzo-banner-validation.md`).
- [`ResourceStats`](file:///g:/G-Maiden/src-tauri/src/governor.rs#L180) `{ ram_mb, cpu_pct, cpu_group_processes, over_budget, gpu_pct, gpu_temp_c, vram_used_mb, vram_total_mb }`
  (`cpu_group_processes` เป็น `i32`; ค่า `-1` หมายถึงอ่าน Job Object group accounting ใน sample นั้นไม่สำเร็จ แม้ cap ยัง active หลัง startup; ดู [`measure()`](file:///g:/G-Maiden/src-tauri/src/governor.rs#L276). `cpu_pct` และ sensor fields เป็น `f64`.) → emit `resource-stats` ไปยัง control window

> **สถานะ (2026-07): ไม่มีฟิลด์ `est_fps_impact_pct`** — struct จริงคือ
> `ResourceStats` ข้างบน. GPU load/temp + VRAM เป็นฟิลด์จริงที่ป้อนโดย
> [`gpu-feeder`](file:///g:/G-Maiden/gpu-feeder/) sidecar (nvidia-smi → `POST /telemetry` → [`governor::ingest_gpu`](file:///g:/G-Maiden/src-tauri/src/governor.rs#L319),
> staleness 30s; main app ไม่รัน nvidia-smi เอง). `-1` = ไม่มีค่า → footer แสดง "—".

## 5. Visual Design

Canonical UI/UX contract: [[design-system]] (`docs/architecture/design-system.md`).

```
┌─────────────────────────────────────────────────────┐
│                    Dota 2 Game                       │
│                                                     │
│  ┌──────────────────────┐                           │
│  │  G-Maiden Overlay    │  ← glassmorphism panel    │
│  │  ⚠ Gank warning!     │  ← ไม่บัง minimap        │
│  │  Advice: Buy MKB     │                           │
│  └──────────────────────┘                           │
│                                                     │
│  [minimap]    [skill bar]    [stats]  ← ห้ามบัง    │
└─────────────────────────────────────────────────────┘
```

## 6. Tech Stack

| Component | Technology |
| --- | --- |
| Window | Tauri v2 (transparent, always-on-top, click-through) |
| UI Framework | React + Vite + Tailwind |
| State | Zustand |
| Data Fetching | React Query |
| IPC | Tauri events (`listen`/`emit`) |

> **Note ([[CR-002-Phase2-wire-backend|CR-002]] Phase 2a/2b):** [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) = the overlay window + window routing;
> [`CommandDeck.tsx`](file:///g:/G-Maiden/src/src/CommandDeck.tsx) = the control window. The control dashboard is **live-wired**
> via Tauri events (`game-tick`, `gsi-status`, `minimap-cv`, `enemy-missing`,
> `gank-alert`) into pure builders under [`src/src/live/`](file:///g:/G-Maiden/src/src/live/), merged over a MOCK
> fallback (renders signed-out/offline) — not mock-only.

## 7. Persona Behavior

- Overlay สี/โทนปรับตามฮีโร่: ice palette default, fire สำหรับ Lina, etc.
- Animation ควรรู้สึก "magical" ไม่ใช่ "mechanical"
- Resource warning แสดง subtle (ไม่ panic ผู้เล่น)

## 8. Constraints

- **FPS drop ≤3%** — GATE P7
- **ไม่บังองค์ประกอบสำคัญ** (minimap, skill bar, stats) — SRS §3.5
- **Click-through:** overlay ไม่ดัก input ของเกม
- **Render budget:** overlay redraw ≤16ms (60 FPS)

## 9. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Events | ทุก G-Series module |
| DXGI capture | [`capture`](file:///g:/G-Maiden/src-tauri/src/capture.rs) component ([[technical-design-document|TDD]] §2) |
| → Governor สั่ง | ทุก module (throttle/reduce) |

## 10. Acceptance Criteria

- [ ] overlay แสดงทับ Dota 2 ถูกต้อง (transparent, always-on-top)
- [ ] click-through: ไม่ดัก mouse/keyboard ของเกม
- [ ] ไม่บัง minimap, skill bar, stats panel
- [ ] **FPS drop ≤3%** vs baseline (GATE P7) — requires a real measured overlay-on receipt with `verdict=pass`
- [ ] **CPU ≤10%** per one-second whole-app process-group sample (GATE P2/P7; MVP decision v0.2.0)
- [ ] **RAM ≤900,000,000 bytes** aggregate Working Set (GATE P7; native acceptance pending)
- [ ] global hotkeys ทำงาน: `Ctrl+Alt+S` (toggle overlay), `Alt+↑/↓` (vol ±10%), `Alt+M` (mute toggle)
- [ ] governor auto-throttle เมื่อ resource เกิน budget
- [ ] glassmorphism visual ตรง design spec
- [ ] Control Dashboard และ Overlay ใช้ token/component contract จาก [[design-system]] (`docs/architecture/design-system.md`)

## 11. Current Issue

- Budget ใหม่คือ **whole-app CPU ≤10%** ต่อ sample 1 วินาที (MVP decision v0.2.0); Windows Job Object hard cap/accounting code is present, while live samples and latency/FPS acceptance still need a process-group harness receipt.
- FPS computation and receipt validation are implemented, but live FPS acceptance remains **UNVERIFIED** because no real Dota 2 + PresentMon receipt is committed.
- Governor ตั้ง hard cap + kill-on-close ก่อนเปิด Tauri, sample CPU group ทุก `1s`, และมี hysteresis ตอนคืน capture cadence. Group create/configure/assignment ล้มเหลวทำให้ startup exit ก่อนสร้าง Tauri/WebView หรือ sidecar; runtime query failure หลังตั้ง cap แสดง CPU reading unavailable และคง throttle. Live measurement ยังจำเป็นเพื่อยืนยันการรวม process ลูกและผลต่อเกม.
- สถานะนี้ยังไม่ถือว่าผ่าน gate จนกว่าจะมี sustained harness บนเส้นทางจริงของ app
  ที่พิสูจน์ได้ว่า CPU steady-state อยู่ใน budget.
- Harness ที่ควรใช้ไล่เรื่องนี้คือ [`tests/perf/src/bin/perf_cpu_tree.rs`](file:///g:/G-Maiden/tests/perf/src/bin/perf_cpu_tree.rs) เพื่อยืนยันค่า job-group
  เทียบกับ root host + child WebView2/utility/sidecar ที่ Task Manager แสดง; governor ใช้ Job Object accounting แทนการไล่ process names/PIDs.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | — | FEAT-G-SENSORY ฉบับแรก (untracked) |
| 0.1.1 | 2026-07-19 | link/metadata sweep (G15-T2): fixed unresolved wikilink slug `[[architecture/design-system]]` → `[[design-system]]` (×2) |
| 0.1.2 | 2026-10-05 | Added the DL-004 P7 PresentMon/ETW receipt contract, strict fallback semantics, and explicit live-acceptance boundary. |
| 0.2.0 | 2026-10-12 | Updated the G-Sensory CPU trigger and documented one-second sampling, 10% budget, and hysteresis per MVP decision v0.2.0. |
| 0.2.1 | 2026-10-12 | Clarified the CPU acceptance boundary and required a root plus WebView2/utility/sidecar process-group harness. |
| 0.2.2 | 2026-10-12 | Documented whole-app Job Object hard cap/accounting, unavailable-state handling, and live acceptance boundary. |
| 0.2.3 | 2026-10-12 | Documented graceful GPU-feeder cleanup and the abnormal-termination limitation of the Job Object lifecycle. |
| 0.2.4 | 2026-10-12 | Documented the unavailable-cap/query ambiguity, kill-on-close assumptions, and degraded-state feeder risk. |
| 0.2.5 | 2026-10-12 | Corrected the `governor::ingest_gpu` symbol anchor after the CPU governor changes. |
| 0.2.6 | 2026-10-13 | Documented fail-closed startup on Job Object setup failure and clarified that the `-1` process-count sentinel means a runtime accounting read failed. |
| 0.2.7 | 2026-10-29 | Document VRZO visual lifecycle and pending native acceptance; align active RAM and operating CPU cap with MVP. |
