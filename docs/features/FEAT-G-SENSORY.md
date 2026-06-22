# FEAT-G-SENSORY — Overlay & Hardware Optimization

> **Module:** G-Sensory · **Priority:** Core · **Phase:** 0–1 (scaffold), 7 (hardened)
> **SRS:** §3.5 · **Eng Spec:** §2.5, §7 · **TDD:** §2, §7

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

วัดทุก 1 วินาที แล้วบังคับ budget:

| Resource | Limit | Mitigation |
| --- | --- | --- |
| CPU | ≤2.5% | ลด capture rate, ลด vision frequency, batch |
| RAM | ≤400 MB | unload SLM, ลด cache, GC ring buffer |
| FPS impact | ≤3% | ลด overlay redraw, ปิด blur/effects, static HUD |

### 2c. Global Hotkeys

| Hotkey | Action |
| --- | --- |
| `Alt + M` | Maiden สรุปสถานการณ์ทันที (`request_situation_summary`) |
| (future) | toggle overlay, mute, sensitivity +/- |

## 3. Input

| Source | Data |
| --- | --- |
| All G-Series modules | `CoreEvent` (EnemyMissing, GankRisk, SignalAlert, Advice, Narration) |
| Resource telemetry | CPU %, RAM MB, est. FPS impact |
| User input | Hotkeys, overlay settings |

## 4. Output

- UI state → React overlay (Tauri events: `listen('core-event', ...)`)
- Render commands → GPU-composited transparent window
- `ResourceStat { cpu_pct, ram_mb, est_fps_impact_pct }` → G-Log

## 5. Visual Design

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
| DXGI capture | `capture` component (TDD §2) |
| → Governor สั่ง | ทุก module (throttle/reduce) |

## 10. Acceptance Criteria

- [ ] overlay แสดงทับ Dota 2 ถูกต้อง (transparent, always-on-top)
- [ ] click-through: ไม่ดัก mouse/keyboard ของเกม
- [ ] ไม่บัง minimap, skill bar, stats panel
- [ ] **FPS drop ≤3%** vs baseline (GATE P7)
- [ ] **CPU ≤2.5%** total (GATE P2/P7)
- [ ] **RAM ≤400 MB** (GATE P7)
- [ ] `Alt+M` hotkey triggers situation summary
- [ ] governor auto-throttle เมื่อ resource เกิน budget
- [ ] glassmorphism visual ตรง design spec
