---
title: "ADR: Migrate Screen Capture from WGC to DXGI Desktop Duplication"
doc_id: "ADR-13-dxgi-capture-migration"
status: "Accepted"
version: "0.1.1"
updated: "2026-06-28"
owner: "Boss"
source_of_truth: true
related_docs: ["ADR-05", "ADR-10-hybrid-ingestion-resilience", "src-tauri/src/capture.rs", "src-tauri/src/governor.rs"]
---

# ADR: Migrate Screen Capture from WGC to DXGI Desktop Duplication

## Status
Accepted · 2026-06-28 (DXGI migration implemented, CR-001 Wave A/B complete; see
[[CR-001-REVIEW-and-execution-plan|CR-001-REVIEW-and-execution-plan.md]])

## Context

G-Maiden ใช้ **Windows Graphics Capture (WGC)** จับภาพหน้าจอ Dota 2 เพื่อ crop minimap แล้วส่งเข้า CV pipeline (prefilter → ONNX hero detection → G-Sentry/G-Motion/G-Signal). ปัญหาที่พบจาก in-game test ล่าสุด:

### หลักฐานจาก error.log (2026-06-28)
- **SLOW frame 1,300–2,300ms** ต่อเนื่อง **1,294 ครั้ง** ตลอดทั้ง match — frame time ควรเป็น 67–125ms (8–15 Hz) แต่จริงได้แค่ ~0.7 Hz
- **`suspicious=true` ตลอด** — G-Sentry ตรวจพบ hero หายตลอดเวลา → capture loop boost เป็น 15 Hz → ยิ่ง stress WGC → วงจรอุบาทว์
- **CPU พุ่ง 8%** เกิน resource budget (≤2.5%) มากกว่า 3 เท่า ทั้งที่ยังไม่มี overlay effects หนักๆ
- **WGC startup failure ซ้ำ**: `"Toggling the capture border is not supported by the Graphics Capture API on this platform"` — ต้อง retry หลายรอบ ในบาง session เปิดไม่ได้เลย

### สาเหตุรากของปัญหา
1. **WGC ไม่รองรับ exclusive fullscreen** — Dota 2 default เป็น exclusive fullscreen; WGC ต้อง compositor active ซึ่ง exclusive fullscreen ไม่มี → frame delivery ช้าหรือ fail
2. **WGC busy-wait ระหว่างรอ frame** — แม้ได้ frame แค่ ~0.7 Hz แต่ thread ยังวนรอ → CPU สูง
3. **Capture border toggle ไม่รองรับ Win10** — WGC API บน Windows 10 (19045) ไม่มี `SetBorderRequired` → crash/retry ทุกครั้ง

### ผลกระทบต่อ product strategy
G-Suite กำลังจะ position เป็น streamer tool — ต้องรันข้างๆ OBS (ซึ่งก็ capture หน้าจอเช่นกัน). ถ้า capture กิน CPU 8% ขนาด Dota เกมเดียว จะรันคู่ OBS + stream encode ไม่ไหว

## Decision

**เปลี่ยน screen capture backend จาก WGC เป็น DXGI Desktop Duplication API** พร้อม GSI-only fallback เมื่อ capture ไม่พร้อม

### รายละเอียดการเปลี่ยน

#### 1. DXGI Desktop Duplication เป็น primary capture
- ใช้ `IDXGIOutputDuplication::AcquireNextFrame()` แทน `windows-capture` WGC crate
- DXGI ทำงานบน **GPU copy** โดยตรง — ไม่ผ่าน compositor → ไม่ fight กับเกม
- รองรับ borderless fullscreen (Dota setting: `-window -noborder`)
- Frame delivery เป็น vsync-aligned (~16ms @ 60Hz) ไม่ใช่ poll-based
- timeout parameter ใน `AcquireNextFrame` ป้องกัน busy-wait → CPU ลดลงมาก

#### 2. Capture cadence ปรับลง
- Normal: **4 Hz** (250ms) แทน 8 Hz — ลด CPU ครึ่งหนึ่ง
- Alert (Sentry missing): **8 Hz** (125ms) แทน 15 Hz — ยังเร็วพอสำหรับ gank detection (gank window 10–12s)
- Governor throttle: **2 Hz** (500ms) เมื่อ over budget

#### 3. GSI-only fallback (Lite mode)
- เมื่อ DXGI init fail (exclusive fullscreen / permission) → ทำงานต่อโดยไม่มี CV
- G-Signal ใช้ kill feed timing + death pattern จาก GSI ประมาณ gank risk แทน
- UI แสดง badge "Lite Mode — minimap detection off"
- ยังได้: announcer, overlay, G-Master advice, kill banner, stat HUD ทั้งหมด

#### 4. Migration path ใน capture.rs
```
capture::start()
  ├─ try DxgiCapture::new(monitor_index, timeout_ms)
  │   ├─ success → run dxgi_loop(4 Hz / 8 Hz alert)
  │   └─ fail → log warning, emit "capture-mode: lite"
  └─ fallback: GSI-only mode (no CV thread)
```

- [`DxgiCapture`](file:///g:/G-Maiden/src-tauri/src/dxgi.rs) struct: holds `IDXGIOutputDuplication` + staging texture
- `acquire_frame()` → returns `Option<Vec<u8>>` (BGRA) — same format as WGC
- Downstream pipeline (prefilter → detector → sentry → motion → signal) ไม่ต้องเปลี่ยนเลย — รับ `&[u8]` BGRA เหมือนเดิม

#### 5. User requirement
- Dota 2 ต้องรันเป็น **borderless fullscreen** (`-window -noborder` ใน launch options) — exclusive fullscreen ไม่รองรับ DXGI เช่นกัน แต่ต่างจาก WGC คือ DXGI fail fast + fallback ทันที ไม่ค้าง 1.5 วินาทีต่อ frame
- GSI setup ยังจำเป็น (ไม่เปลี่ยน)

## Consequences

### Positive
- **CPU ลดจาก ~8% → ≤1.5%** — DXGI GPU copy + ลด cadence + ไม่มี busy-wait
- **Frame latency ลดจาก 1,300–2,300ms → <50ms** — DXGI deliver frame ภายใน 1 vsync
- **Streamer-ready** — รันคู่ OBS ได้สบาย (OBS ก็ใช้ DXGI/Game Capture อยู่แล้ว ไม่ conflict)
- **Win10 compatibility** — ไม่ต้อง `SetBorderRequired` API ที่ Win10 ไม่มี
- **Graceful degradation** — fail → Lite mode ทันที ไม่ crash/ค้าง
- **เปิดทาง tiered product** — Lite (GSI-only, ฟรี) / Standard (DXGI CV) / Pro (+ cloud AI)

### Negative
- **ต้อง borderless fullscreen** — exclusive fullscreen ยังไม่ได้ทั้ง WGC และ DXGI; แต่ streamers ส่วนใหญ่ใช้ borderless อยู่แล้ว (ต้อง alt-tab บ่อย)
- **DXGI captures ทั้งจอ** — ต้อง crop minimap region เอง (WGC crop window-level ได้) → เพิ่มงาน crop เล็กน้อย แต่ pipeline เดิมรองรับอยู่
- **Multi-monitor** — DXGI ต้องระบุ output index; ถ้า Dota อยู่จอ 2 ต้อง detect ให้ถูก
- **Migration effort** — ต้องเขียน DXGI wrapper ใหม่ (~200–300 LOC Rust) แทน `windows-capture` crate

### Neutral / Trade-offs
- ลด capture cadence (4/8 Hz แทน 8/15 Hz) ทำให้ minimap detection ช้าลง ~125ms — ยอมรับได้เพราะ gank window คือ 10–12 วินาที ไม่ใช่ milliseconds
- DXGI Desktop Duplication ถูก deprecate ในอนาคต (Windows อาจย้ายไป WGC เท่านั้น) — แต่ WGC ตอนนี้ยังไม่ stable พอ; ค่อยย้ายกลับเมื่อ WGC แก้ปัญหา exclusive fullscreen

## Alternatives Considered

| Alternative | Reason Rejected |
|---|---|
| **WGC + force borderless** | แก้ได้บางส่วนแต่ WGC ยังมี overhead สูงกว่า DXGI (compositor round-trip) และ Win10 SetBorderRequired ยังพัง |
| **OBS Virtual Camera → G-Maiden** | Frame quality ลดลง (YUV encode/decode), เพิ่ม latency 30–50ms, ผูกกับ OBS (dependency ที่ไม่จำเป็น) |
| **OBS WebSocket screenshot** | ไม่เหมาะกับ 4–8 Hz — แต่ละ request ใช้ 100–200ms, ไม่ reliable |
| **OBS plugin shared memory** | ต้องเขียน C plugin สำหรับ OBS + shared memory protocol — complexity สูงมาก, ไม่คุ้ม |
| **Game Capture (hook injection)** | อ่าน frame จาก DirectX hook ใน process ของเกม — เร็วที่สุด แต่ **เสี่ยง VAC ban** ซึ่งขัดกับหลักการ ban-safe ของ G-Maiden (ADR-10) |
| **ยกเลิก CV ทั้งหมด (GSI-only)** | ง่ายที่สุดแต่สูญเสีย minimap detection ซึ่งเป็น core feature ของ G-Signal gank prediction — ยอมรับเป็น fallback แต่ไม่ใช่ primary path |

## Implementation Plan

### Phase 1: DXGI wrapper (1–2 days)
- เขียน [`src-tauri/src/dxgi.rs`](file:///g:/G-Maiden/src-tauri/src/dxgi.rs) — `DxgiCapture::new()`, `acquire_frame()`, `release_frame()`
- ใช้ `windows` crate (`IDXGIFactory1`, `IDXGIOutput1`, `IDXGIOutputDuplication`)
- Unit test: capture 10 frames, assert BGRA format + dimensions

### Phase 2: Integration (1 day)
- แก้ [`capture.rs`](file:///g:/G-Maiden/src-tauri/src/capture.rs) — try DXGI first, fallback GSI-only
- ปรับ cadence constants: NORMAL 250ms, ALERT 125ms, THROTTLE 500ms
- Emit `capture-mode` event ให้ frontend แสดง mode badge

### Phase 3: Validation (1–2 days)
- Run perf_p7 benchmark: assert CPU ≤ 2.5%, RAM ≤ 400 MB
- In-game test: Dota 2 borderless + G-Maiden + OBS simultaneously
- Verify gank detection still triggers within 2s of enemy disappearing
- Verify error.log has zero SLOW frame entries

### Phase 4: Cleanup
- Remove `windows-capture` crate dependency
- Update `CLAUDE.md` gotcha #2 (WGC → DXGI)
- Update user docs: recommend borderless fullscreen

## Related Documents
- ADR-05: Minimap CV pipeline
- [[ADR-10-hybrid-ingestion-resilience|ADR-10]]: Hybrid Ingestion Resilience (GSI + CV dual path)
- [`src-tauri/src/capture.rs`](file:///g:/G-Maiden/src-tauri/src/capture.rs): current WGC implementation
- [`src-tauri/src/governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs): resource budget enforcement
- `error.log` 2026-06-28: evidence of WGC frame stalls

## Changelog
| Version | Date | Summary |
|---|---|---|
| 0.1.0 | 2026-06-28 | Initial proposal based on in-game performance evidence (CPU 8%, frame time 1.3–2.3s) |
| 0.1.1 | 2026-07-19 | link/metadata sweep (G15-T2): `[[CLAUDE.md]]` converted to plain backtick path text (CLAUDE.md is outside docs/, not a doc-graph slug) |
