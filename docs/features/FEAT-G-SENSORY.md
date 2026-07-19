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

วัดทุก **10 วินาที** ([`governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs) [`POLL_INTERVAL_S`](file:///g:/G-Maiden/src-tauri/src/governor.rs#L27) `= 10`) → emit `resource-stats`
event ไปยัง control window แล้วเช็ค budget:

| Resource | Limit | Mitigation |
| --- | --- | --- |
| CPU | ≤2.5% | CPU-throttle flag → capture loop drop ~ครึ่งหนึ่งของ tick |
| RAM | ≤400 MB | (นับรวมใน over-budget flag เดียวกัน) |
| FPS impact | ≤3% | budget TARGET เท่านั้น — ยังไม่ instrument |

> **สถานะ (2026-07): mitigation ที่ทำจริงคือ CPU-throttle flag ตัวเดียว** —
> [`measure()`](file:///g:/G-Maiden/src-tauri/src/governor.rs#L143) ตั้ง `over_budget = ram_mb > 400 || cpu_pct > 2.5` แล้ว
> [`poll_loop`](file:///g:/G-Maiden/src-tauri/src/governor.rs#L121) เก็บลง [`CPU_THROTTLE`](file:///g:/G-Maiden/src-tauri/src/governor.rs#L67) (atomic) ให้ capture loop อ่านเพื่อ drop
> ~ครึ่งหนึ่งของ tick. ตาราง "unload SLM / ปิด blur / static HUD" ยังเป็น
> aspirational (ยังไม่ได้ทำ). FPS-impact ไม่ถูกวัดที่ใดเลย (ไม่มี `est_fps`).
>
> **Open issue (2026-07-08):** มี observation ล่าสุดจาก **Windows Task Manager**
> ว่า process CPU peak ไปที่ `20%+` ซึ่งยังถือว่า **ผิด spec** (`<=2.5%`).
> หลักฐานในโค้ดปัจจุบันชี้ว่า governor วัดแบบ 1-second burst sample แต่ re-check
> ทุก `10s` และ mitigation จริงลดได้แค่ capture cadence; จึงยังไม่ใช่หลักประกัน
> ว่า steady-state ทั้ง app จะอยู่ใน budget และอาจไม่สะท้อนภาระจริงที่ OS เห็นครบทุกช่วง.

### 2c. Global Hotkeys

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
- Announcer pack banner → overlay ([`packBanner`](file:///g:/G-Maiden/src/src/App.tsx) ใน [`App.tsx`](file:///g:/G-Maiden/src/src/App.tsx), driven โดย
  `announcer-banner` event; รูปของ pack แทน built-in kill card เมื่อ event fire)
- [`ResourceStats { ram_mb, cpu_pct, over_budget, gpu_pct, gpu_temp_c, vram_used_mb, vram_total_mb }`](file:///g:/G-Maiden/src-tauri/src/governor.rs#L87)
  (ทั้งหมด `f64`, [`governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs)) → emit `resource-stats` ไปยัง control window

> **สถานะ (2026-07): ไม่มีฟิลด์ `est_fps_impact_pct`** — struct จริงคือ
> `ResourceStats` ข้างบน. GPU load/temp + VRAM เป็นฟิลด์จริงที่ป้อนโดย
> [`gpu-feeder`](file:///g:/G-Maiden/gpu-feeder/) sidecar (nvidia-smi → `POST /telemetry` → [`governor::ingest_gpu`](file:///g:/G-Maiden/src-tauri/src/governor.rs#L193),
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
- [ ] **FPS drop ≤3%** vs baseline (GATE P7)
- [ ] **CPU ≤2.5%** total (GATE P2/P7)
- [ ] **RAM ≤400 MB** (GATE P7)
- [ ] global hotkeys ทำงาน: `Ctrl+Alt+S` (toggle overlay), `Alt+↑/↓` (vol ±10%), `Alt+M` (mute toggle)
- [ ] governor auto-throttle เมื่อ resource เกิน budget
- [ ] glassmorphism visual ตรง design spec
- [ ] Control Dashboard และ Overlay ใช้ token/component contract จาก [[design-system]] (`docs/architecture/design-system.md`)

## 11. Current Issue

- Spec hard limit คือ **background CPU <= 2.5%** แต่ observation ล่าสุดจาก Windows Task Manager มี peak `20%+`.
- Root cause ที่ยืนยันได้ตอนนี้คือ protection path ยังหยาบเกินไป: sample burst 1 วินาที,
  governor ตรวจซ้ำทุก `10s`, และ throttle แค่ minimap capture cadence.
- สถานะนี้ยังไม่ถือว่าผ่าน gate จนกว่าจะมี sustained harness บนเส้นทางจริงของ app
  ที่พิสูจน์ได้ว่า CPU steady-state อยู่ใน budget.
- Harness ที่ควรใช้ไล่เรื่องนี้คือ [`tests/perf/src/bin/perf_cpu_tree.rs`](file:///g:/G-Maiden/tests/perf/src/bin/perf_cpu_tree.rs) ซึ่งรวม root
  host + child WebView2/utility/sidecar แบบใกล้เคียง Task Manager มากกว่า
  [`governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs) ที่วัดแค่ current process.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | — | FEAT-G-SENSORY ฉบับแรก (untracked) |
| 0.1.1 | 2026-07-19 | link/metadata sweep (G15-T2): fixed unresolved wikilink slug `[[architecture/design-system]]` → `[[design-system]]` (×2) |
