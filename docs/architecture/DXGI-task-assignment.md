---
title: "DXGI Migration — Agent Task Assignment"
doc_id: "DXGI-task-assignment"
status: "active"
version: "0.1.0"
updated: "2026-06-28"
owner: "Boss"
related_docs: ["IMPL-PLAN-DXGI-migration", "ADR-13-dxgi-capture-migration"]
---

# DXGI Migration — Agent Task Assignment

## Model Tier Strategy

| Tier | Model | Strengths | Assign When |
|---|---|---|---|
| **T1 — Opus** | Claude Opus | Architecture, unsafe Rust, complex Windows API, multi-file reasoning | Complex tasks ที่ต้องเข้าใจ context ข้ามไฟล์ + unsafe code + error handling ที่ซับซ้อน |
| **T2 — Sonnet** | Claude Sonnet | General Rust/TS, moderate complexity, good reasoning | Tasks ทั่วไปที่ต้อง reasoning แต่ไม่ซับซ้อนระดับ architecture |
| **T3a — gemma4:12b** | Ollama local | Top local performance, Rust capable | Tasks ที่ต้อง reasoning + Rust แต่ scope ชัดเจน ไม่ต้องข้ามไฟล์เยอะ |
| **T3b — aroon-rust:9b** | Ollama local | Rust-specialized, efficient | Rust-focused tasks ที่ scope แคบ, boilerplate, pattern-matching |
| **T3c — gemma-e2e** | Ollama local | Fast execution | Mechanical edits, config changes, trivial code gen |

---

## Assignment Matrix

### Phase 1 — DXGI Wrapper

| Task ID | Task | Pt | Tier | Model | Rationale |
|---------|------|----|------|-------|-----------|
| SPR01-01 | เพิ่ม `windows` crate features ใน Cargo.toml | 1 | T3c | **gemma-e2e** | Mechanical — แค่เพิ่ม feature flags |
| SPR01-02 | `DxgiCapture::new()` — D3D11 + output duplication | 5 | T1 | **Opus** | Complex unsafe Windows API, multi-step init chain, error handling critical |
| SPR01-03 | `acquire_frame()` → BGRA bytes | 5 | T1 | **Opus** | GPU texture mapping, stride handling, unsafe pointer arithmetic |
| SPR01-04 | `Drop` trait — cleanup resources | 1 | T3b | **aroon-rust:9b** | Pattern-based Rust Drop impl, scope ชัดเจน |
| SPR01-05 | Unit test: capture 10 frames | 3 | T2 | **Sonnet** | Test design needs reasoning about assertions + edge cases |

### Phase 2 — Integration

| Task ID | Task | Pt | Tier | Model | Rationale |
|---------|------|----|------|-------|-----------|
| SPR02-01 | Rename `capture.rs` → `capture_wgc.rs` + feature gate | 2 | T3c | **gemma-e2e** | Mechanical file ops + simple `#[cfg(feature)]` |
| SPR02-02 | DXGI capture loop (main integration) | 8 | T1 | **Opus** | ต้องเข้าใจ pipeline ทั้งหมด: WGC pattern → extract → restructure สำหรับ DXGI loop |
| SPR02-03 | ปรับ cadence constants | 1 | T3c | **gemma-e2e** | เปลี่ยน 3 ค่า constant |
| SPR02-04 | GSI-only fallback (Lite mode) | 3 | T2 | **Sonnet** | ต้อง design fallback flow + error handling + event emission |
| SPR02-05 | Emit `capture-mode` event | 1 | T3c | **gemma-e2e** | One-liner emit call |

### Phase 3 — Frontend

| Task ID | Task | Pt | Tier | Model | Rationale |
|---------|------|----|------|-------|-----------|
| SPR03-01 | Listen `capture-mode` + badge UI | 2 | T2 | **Sonnet** | React/TS event listener + conditional rendering |
| SPR03-02 | Lite mode tooltip | 1 | T3c | **gemma-e2e** | Static text + hover tooltip |

### Phase 4 — Validation

| Task ID | Task | Pt | Tier | Model | Rationale |
|---------|------|----|------|-------|-----------|
| SPR04-01 | Run `perf_p7` benchmark | 3 | T3a | **gemma4:12b** | ต้องเข้าใจ perf harness + ปรับ assertions ถ้าจำเป็น |
| SPR04-02 | In-game test (Dota + OBS) | 5 | — | **Human (Boss)** | Manual play test |
| SPR04-03 | Verify Lite mode fallback | 2 | — | **Human (Boss)** | Manual verification |
| SPR04-04 | Cleanup `windows-capture` from defaults | 1 | T3c | **gemma-e2e** | Mechanical Cargo.toml edit |
| SPR04-05 | Update CLAUDE.md | 1 | T3b | **aroon-rust:9b** | Documentation update, needs project context awareness |
| SPR04-06 | Update modules.json version | 1 | T3c | **gemma-e2e** | Trivial version bump |

---

## Workload Distribution

| Model | Tasks | Total Points | % of Work |
|---|---|---|---|
| **Opus** (T1) | 3 tasks (SPR01-02, SPR01-03, SPR02-02) | 18 pt | 39% — heavy lifting |
| **Sonnet** (T2) | 4 tasks (SPR01-05, SPR02-04, SPR03-01) | 9 pt | 20% — moderate |
| **gemma4:12b** (T3a) | 1 task (SPR04-01) | 3 pt | 7% — perf validation |
| **aroon-rust:9b** (T3b) | 2 tasks (SPR01-04, SPR04-05) | 2 pt | 4% — Rust patterns |
| **gemma-e2e** (T3c) | 6 tasks (SPR01-01, SPR02-01, SPR02-03, SPR02-05, SPR03-02, SPR04-04, SPR04-06) | 7 pt | 15% — mechanical |
| **Human** | 2 tasks (SPR04-02, SPR04-03) | 7 pt | 15% — manual test |

---

## Execution Order + Prompts

### 🔴 Wave 1: Foundation (Day 1 morning)

#### Task 1.1 — gemma-e2e: Cargo.toml features
```
TSK-GMMP01P01EP01SPR01-01

คุณเป็น Rust developer ทำงานใน Tauri v2 project

## Task
เพิ่ม Windows DXGI features ใน Cargo.toml

## File
แก้ไขไฟล์: src-tauri/Cargo.toml

## Action
เพิ่ม dependency ต่อไปนี้ (หรือเพิ่ม features ถ้า `windows` crate มีอยู่แล้ว):

```toml
[dependencies.windows]
version = "0.58"
features = [
    "Win32_Graphics_Dxgi",
    "Win32_Graphics_Dxgi_Common",
    "Win32_Graphics_Direct3D",
    "Win32_Graphics_Direct3D11",
    "Win32_Security",
    "Win32_Foundation",
    "Win32_System_Threading",
]
```

ถ้า `windows` crate มีอยู่แล้วใน Cargo.toml ให้ merge features เข้าไป (ไม่ลบ features เดิม)

## Verify
`cargo check` ต้อง pass
```

---

#### Task 1.2 — Opus: DxgiCapture::new() (หลัง 1.1 เสร็จ)
```
TSK-GMMP01P01EP01SPR01-02

คุณเป็น senior Rust developer ที่เชี่ยวชาญ Windows API + unsafe Rust
ทำงานใน G-Maiden project (Tauri v2 desktop app สำหรับ Dota 2 AI companion)

## Task
สร้างไฟล์ใหม่ `src-tauri/src/dxgi.rs` ที่ implement DXGI Desktop Duplication capture

## Context
- G-Maiden จับภาพ minimap ของ Dota 2 เพื่อ detect ตำแหน่งศัตรูด้วย CV
- ปัจจุบันใช้ WGC (windows-capture crate) แต่มีปัญหา CPU 8% + frame stall 1.3-2.3 วินาที
- เราเปลี่ยนมาใช้ DXGI Desktop Duplication ซึ่ง capture ผ่าน GPU copy โดยตรง
- Output ต้องเป็น BGRA bytes (ตรงกับ `crate::cv::Frame::from_bgra(w, h, Vec<u8>)`)

## Reference
ดู `src-tauri/src/capture.rs` สำหรับ:
- Error handling style: ใช้ `.map_err(|e| format!("...: {e}"))` ไม่ใช่ `.unwrap()`
- Logging: `eprintln!("[capture] ...")` สำหรับ debug, `crate::log::error(...)` สำหรับ persistent

## Requirements

### Struct `DxgiCapture`
```rust
pub struct DxgiCapture {
    duplication: IDXGIOutputDuplication,
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    staging: ID3D11Texture2D,
    width: u32,
    height: u32,
}
```

### `DxgiCapture::new(monitor_index: u32) -> Result<Self, String>`
ขั้นตอน:
1. `D3D11CreateDevice(None, D3D_DRIVER_TYPE_HARDWARE, None, D3D11_CREATE_DEVICE_BGRA_SUPPORT, &[D3D_FEATURE_LEVEL_11_0], D3D11_SDK_VERSION)` → ได้ `(device, context)`
2. `device.cast::<IDXGIDevice>()` → `.GetAdapter()` → `adapter.EnumOutputs(monitor_index)` → cast เป็น `IDXGIOutput1`
3. `output1.DuplicateOutput(&device)` → ได้ `IDXGIOutputDuplication`
4. อ่าน `DXGI_OUTDUPL_DESC` จาก duplication เพื่อได้ width/height
5. สร้าง staging texture: `D3D11_TEXTURE2D_DESC` ด้วย:
   - `Width/Height` จาก desc
   - `Format = DXGI_FORMAT_B8G8R8A8_UNORM`
   - `Usage = D3D11_USAGE_STAGING`
   - `CPUAccessFlags = D3D11_CPU_ACCESS_READ`
   - `MipLevels = 1, ArraySize = 1, SampleDesc.Count = 1`
   - `BindFlags = 0`

ทุก Windows API call ต้องอยู่ใน `unsafe` block พร้อม comment อธิบายว่าทำไมถึง safe

### `pub fn acquire_frame(&mut self) -> Option<(Vec<u8>, u32, u32)>`
ขั้นตอน:
1. `self.duplication.AcquireNextFrame(100)` — timeout 100ms
   - ถ้า `DXGI_ERROR_WAIT_TIMEOUT` → return `None` (ไม่มี frame ใหม่)
   - ถ้า error อื่น → `eprintln!` + return `None`
2. `resource.cast::<ID3D11Texture2D>()`
3. `self.context.CopyResource(&self.staging, &desktop_texture)`
4. `self.context.Map(&self.staging, 0, D3D11_MAP_READ, 0)` → `mapped_resource`
5. Copy bytes:
   - ถ้า `mapped.RowPitch == self.width * 4` → memcpy ตรงๆ
   - ถ้าไม่ → copy row-by-row (skip padding)
   - Result: `Vec<u8>` ขนาด `width * height * 4`
6. `self.context.Unmap(&self.staging, 0)`
7. `self.duplication.ReleaseFrame()`
8. Return `Some((bytes, self.width, self.height))`

ต้อง handle กรณี `DXGI_ERROR_ACCESS_LOST` — ต้อง recreate duplication

### `Drop` trait
Release resources in order: duplication → staging → context → device
(จะถูก implement แยกใน task ถัดไป — เตรียม struct ให้ Drop ได้)

## Output
ส่ง code block เต็มไฟล์ `dxgi.rs` พร้อม:
- `use` statements ที่ถูกต้อง
- `unsafe` blocks ทุก Windows API call
- Error handling ทุกจุด
- `pub mod` ready (จะถูก add ใน lib.rs ภายหลัง)

## Constraints
- ใช้ `windows` crate version 0.58+ (ไม่ใช่ `winapi`)
- ไม่ใช้ `.unwrap()` — ทุก error ต้อง handle
- ไม่ใช้ `panic!` — return Error แทน
- Thread-safe ไม่จำเป็น — struct นี้ถูกใช้จาก thread เดียว
```

---

#### Task 1.3 — Opus: acquire_frame() (หลัง 1.2 เสร็จ)
```
TSK-GMMP01P01EP01SPR01-03

(รวมอยู่ใน Task 1.2 แล้ว — Opus ควรทำ new() + acquire_frame() ในรอบเดียวกัน
เพราะต้อง reason เรื่อง resource lifetime ข้ามทั้งสอง method)
```

---

#### Task 1.4 — aroon-rust:9b: Drop trait (หลัง 1.2 เสร็จ)
```
TSK-GMMP01P01EP01SPR01-04

คุณเป็น Rust developer

## Task
เพิ่ม `Drop` trait implementation ให้ struct `DxgiCapture` ในไฟล์ `src-tauri/src/dxgi.rs`

## Context
`DxgiCapture` ถือ Windows COM resources ที่ต้อง release เมื่อ struct ถูก drop:
- `duplication: IDXGIOutputDuplication`
- `device: ID3D11Device`
- `context: ID3D11DeviceContext`
- `staging: ID3D11Texture2D`

## Action
เพิ่ม impl block นี้ต่อท้ายไฟล์:

```rust
impl Drop for DxgiCapture {
    fn drop(&mut self) {
        // COM pointers ของ windows crate จะ Release() อัตโนมัติเมื่อ drop
        // — ไม่ต้อง manual release เพราะ windows crate wrap ComPtr ไว้แล้ว
        // Log เพื่อ debug lifecycle
        eprintln!("[dxgi] DxgiCapture dropped — resources released");
    }
}
```

หมายเหตุ: `windows` crate (ต่างจาก `winapi`) ใช้ Rust ownership model กับ COM objects
ดังนั้น Drop ของ struct fields จะ call `Release()` ให้อัตโนมัติ — แค่ต้อง verify
ว่าไม่มี dangling reference

## Verify
`cargo check` pass
```

---

### 🟡 Wave 2: Unit Test + Integration Start (Day 1 afternoon)

#### Task 2.1 — Sonnet: Unit test (หลัง Wave 1 เสร็จ)
```
TSK-GMMP01P01EP01SPR01-05

คุณเป็น Rust developer ที่เขียน test สำหรับ Windows desktop app

## Task
เขียน unit test สำหรับ `DxgiCapture` ในไฟล์ `src-tauri/src/dxgi.rs`

## Context
`DxgiCapture` capture หน้าจอผ่าน DXGI Desktop Duplication API
- `DxgiCapture::new(monitor_index)` → init capture สำหรับจอที่ระบุ
- `acquire_frame()` → `Option<(Vec<u8>, u32, u32)>` — BGRA bytes, width, height

## Requirements
เพิ่ม `#[cfg(test)] mod tests` ท้ายไฟล์:

1. **`test_capture_init`**: `DxgiCapture::new(0)` สำเร็จ, width > 0, height > 0
2. **`test_capture_10_frames`**: init → loop 10 ครั้ง → `acquire_frame()`:
   - ต้องได้ `Some(...)` อย่างน้อย 1 frame จาก 10 (บาง frame อาจ timeout)
   - frame ที่ได้: `buf.len() == (w * h * 4) as usize`
   - `w > 0 && h > 0`
3. **`test_capture_bgra_not_blank`**: capture 1 frame → check ว่า buffer ไม่ใช่ 0 ทั้งหมด
   (`buf.iter().any(|&b| b != 0)`)

ทุก test ต้อง `#[ignore]` เพราะต้องมี display จริง — รันด้วย `cargo test -- --ignored`

## Reference
ดู `src-tauri/src/capture.rs` ท้ายไฟล์ (`#[cfg(test)] mod tests`) สำหรับ test style ของ project

## Verify
`cargo test --lib dxgi` compile สำเร็จ (test จะ skip เพราะ #[ignore])
```

---

#### Task 2.2 — gemma-e2e: Rename + feature gate (parallel กับ 2.1)
```
TSK-GMMP01P02EP02SPR02-01

## Task
1. Rename ไฟล์ `src-tauri/src/capture.rs` → `src-tauri/src/capture_wgc.rs`
2. สร้างไฟล์ใหม่ `src-tauri/src/capture.rs` ที่มีเนื้อหา:

```rust
//! Minimap screen capture — DXGI Desktop Duplication (primary) with
//! WGC fallback via feature flag and GSI-only Lite mode.

#[cfg(feature = "wgc")]
mod capture_wgc;

mod dxgi;

// จะถูกเติมใน task ถัดไป (SPR02-02)
pub fn start(app: tauri::AppHandle) {
    // TODO: DXGI loop implementation
    eprintln!("[capture] capture::start() placeholder");
}
```

3. ใน `src-tauri/Cargo.toml` เพิ่ม:
```toml
[features]
wgc = ["dep:windows-capture"]
```
และเปลี่ยน `windows-capture` dependency เป็น optional:
```toml
windows-capture = { version = "...", optional = true }
```

## Verify
`cargo check` pass (ทั้ง default features และ `--features wgc`)
```

---

#### Task 2.3 — gemma-e2e: Cadence constants (parallel)
```
TSK-GMMP01P02EP02SPR02-03

## Task
ในไฟล์ `src-tauri/src/capture.rs` (ไฟล์ใหม่) เพิ่ม constants:

```rust
/// Normal-state processing cadence (ms) ≈ 4 Hz
const NORMAL_INTERVAL_MS: u64 = 250;
/// Alert-state cadence when Sentry has missing heroes (ms) ≈ 8 Hz
const ALERT_INTERVAL_MS: u64 = 125;
/// Throttled cadence when governor reports over-budget (ms) ≈ 2 Hz
const THROTTLE_INTERVAL_MS: u64 = 500;
/// Debug overlay emit throttle (ms) ≈ 5 Hz
const DEBUG_EMIT_INTERVAL_MS: u64 = 200;
/// Slow frame warning threshold (ms)
const SLOW_FRAME_MS: u64 = 100;
```

## Verify
`cargo check` pass
```

---

### 🟢 Wave 3: Main Integration (Day 2)

#### Task 3.1 — Opus: DXGI capture loop (หลัง Wave 2 เสร็จ)
```
TSK-GMMP01P02EP02SPR02-02

คุณเป็น senior Rust developer ที่เข้าใจ real-time processing pipelines
ทำงานใน G-Maiden project (Tauri v2 Dota 2 AI companion)

## Task
เขียน DXGI capture loop ใน `src-tauri/src/capture.rs` ที่แทนที่ WGC

## Context
ไฟล์ `capture_wgc.rs` (WGC เดิม) มี `MinimapCapture::on_frame_arrived()` (L135-265)
ที่ทำงานต่อไปนี้ต่อ frame:
1. Gate: `crate::runtime::in_game()` — ไม่ทำงานถ้าไม่ได้อยู่ในเกม
2. Calibration feed (optional, ~9 Hz)
3. Adaptive throttle: 8 Hz ปกติ, 15 Hz ถ้า Sentry มี missing heroes
4. Crop minimap region จาก full frame
5. `prefilter_candidates()` → `detector.detect()` — CV pipeline
6. `sentry.update()` → emit `enemy-missing` events
7. `motion.record()` + `motion.assess()` — gank risk
8. `signal.evaluate()` → emit `gank-alert` / `gank-clear` + voice
9. Emit `minimap-cv` debug payload (throttled ~5 Hz)
10. SLOW frame watchdog

## Action
แทนที่ WGC callback ด้วย explicit loop:

```rust
pub fn start(app: AppHandle) {
    std::thread::Builder::new()
        .name("g-capture".into())
        .spawn(move || {
            crate::log::error("[capture] DXGI capture thread started");
            match run_dxgi(app.clone()) {
                Ok(()) => {}
                Err(e) => {
                    eprintln!("[capture] DXGI failed: {e} — falling back to Lite mode");
                    crate::log::error(&format!("[capture] DXGI unavailable: {e}. Running in Lite mode (GSI-only)"));
                    let _ = app.emit("capture-mode", "lite");
                }
            }
        })
        .expect("capture thread spawn");
}

fn run_dxgi(app: AppHandle) -> Result<(), String> {
    let mut dxgi = crate::dxgi::DxgiCapture::new(0)?;
    let _ = app.emit("capture-mode", "dxgi");

    let (sw, sh) = (dxgi.width(), dxgi.height());
    let region = MinimapRegion::for_resolution(sw, sh);
    let mut state = CaptureState::new(app, region);

    loop {
        if !crate::runtime::in_game() {
            std::thread::sleep(Duration::from_secs(1));
            continue;
        }

        let interval = select_interval(&state);
        
        if let Some((buf, w, h)) = dxgi.acquire_frame() {
            let cropped = crop_bgra(&buf, w, &state.region);
            process_frame(&mut state, &cropped, state.region.side as usize, state.region.side as usize);
        }
        
        std::thread::sleep(Duration::from_millis(interval));
    }
}
```

## Reference Files (อ่านก่อนเริ่ม)
- `src-tauri/src/capture_wgc.rs` — WGC implementation เดิม (L135-265 คือ core logic)
- `src-tauri/src/dxgi.rs` — DxgiCapture struct (จาก task ก่อนหน้า)
- `src-tauri/src/cv/prefilter.rs` — `prefilter_candidates()` signature
- `src-tauri/src/cv/detector.rs` — `Detector::detect()` signature
- `src-tauri/src/sentry.rs` — `Sentry::update()` + `missing()` signature
- `src-tauri/src/motion.rs` — `Motion::record()` + `assess()` signature
- `src-tauri/src/signal.rs` — `Signal::evaluate()` + `SignalEvent` enum

## Sub-tasks
1. สร้าง `CaptureState` struct (เหมือน MinimapCapture แต่ไม่ implement WGC trait)
2. Extract `fn process_frame(state, bgra, w, h)` — ย้าย logic จาก on_frame_arrived
3. เขียน `fn crop_bgra(buf, full_w, region) -> Vec<u8>` — crop minimap จาก full-screen
4. เขียน `fn select_interval(state) -> u64` — เลือก cadence ตาม suspicious + throttle
5. ประกอบทุกส่วนเข้า `run_dxgi()` main loop

## Constraints
- Logic ข้างใน process_frame ต้องเหมือน WGC เดิม — ไม่เปลี่ยน behavior
- ใช้ constants ที่กำหนดไว้: NORMAL_INTERVAL_MS, ALERT_INTERVAL_MS, THROTTLE_INTERVAL_MS
- Voice interrupt logic คงเดิม (voice_interrupt fn ย้ายมาด้วย)
- Calibration feed คงเดิม (optional, เฉพาะเมื่อ enabled)

## Verify
`cargo check` pass + `cargo clippy` clean
```

---

#### Task 3.2 — Sonnet: GSI-only fallback (parallel กับ 3.1 ได้บางส่วน)
```
TSK-GMMP01P02EP02SPR02-04

คุณเป็น Rust developer ทำงานใน Tauri v2 project

## Task
เพิ่ม GSI-only fallback logic ใน `src-tauri/src/capture.rs`

## Context
เมื่อ DXGI capture fail (เช่น exclusive fullscreen, permission denied):
- G-Maiden ต้องยังทำงานต่อได้ — ใช้เฉพาะ GSI data
- ไม่มี CV pipeline (no minimap detection)
- แต่ announcer, overlay, G-Master advice, kill banner ยังทำงานปกติ
- แสดง "Lite Mode" badge ใน UI

## Action
ใน `start()` function ของ capture.rs — ตอนที่ DXGI fail:

1. Log ชัดเจน: `[capture] DXGI unavailable: {error}. Running in Lite mode`
2. Emit event: `app.emit("capture-mode", "lite")`
3. **ไม่ spawn capture thread** — return ทันที
4. ระบบอื่น (GSI server, announcer, overlay) ทำงานต่อได้เพราะไม่ depend on capture thread

## Verify
- Build: `cargo check` pass
- Test: รัน app โดยไม่มี display (จะ fail DXGI) → log แสดง Lite mode message
```

---

#### Task 3.3 — gemma-e2e: capture-mode event (parallel)
```
TSK-GMMP01P02EP02SPR02-05

## Task
ใน `src-tauri/src/capture.rs` ตรวจสอบว่ามีการ emit event ต่อไปนี้:
- เมื่อ DXGI start สำเร็จ: `app.emit("capture-mode", "dxgi")`
- เมื่อ DXGI fail: `app.emit("capture-mode", "lite")`

(ถ้า Opus task SPR02-02 ทำไว้แล้ว → verify เท่านั้น ไม่ต้องเพิ่ม)

## Verify
grep `capture-mode` ใน capture.rs → ต้องมี 2 จุด (success + fallback)
```

---

### 🔵 Wave 4: Frontend (Day 2 afternoon)

#### Task 4.1 — Sonnet: Badge UI
```
TSK-GMMP01P03EP03SPR03-01

คุณเป็น React/TypeScript developer ทำงานใน Tauri v2 app

## Task
เพิ่ม capture mode badge ใน G-Maiden control panel

## File
แก้ไข: `src/src/App.tsx`

## Context
- App.tsx เป็น single-file React app (~1,800 lines)
- มี System card ที่แสดง resource stats (RAM, CPU) อยู่แล้ว
- Backend emit event `capture-mode` ด้วยค่า `"dxgi"` หรือ `"lite"`

## Action
1. เพิ่ม state:
```tsx
const [captureMode, setCaptureMode] = useState<string>('initializing');
```

2. เพิ่ม listener (ใน useEffect ที่มี listeners อื่นอยู่แล้ว):
```tsx
const unCapture = await listen<string>('capture-mode', (e) => {
    setCaptureMode(e.payload);
});
```

3. แสดง badge ใน System card (หาตำแหน่งที่แสดง RAM/CPU stats):
```tsx
<span style={{
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    backgroundColor: captureMode === 'dxgi' ? '#22c55e33' : '#eab30833',
    color: captureMode === 'dxgi' ? '#22c55e' : '#eab308',
    border: `1px solid ${captureMode === 'dxgi' ? '#22c55e55' : '#eab30855'}`,
}}>
    {captureMode === 'dxgi' ? 'DXGI' : captureMode === 'lite' ? 'Lite' : '...'}
</span>
```

## Verify
`pnpm -C src exec tsc --noEmit` pass
```

---

#### Task 4.2 — gemma-e2e: Tooltip
```
TSK-GMMP01P03EP03SPR03-02

## Task
เพิ่ม `title` attribute ให้ badge ที่สร้างใน SPR03-01:

ถ้า `captureMode === 'lite'`:
```
title="Minimap detection ปิดอยู่ — ใช้ borderless fullscreen เพื่อเปิด full detection"
```

ถ้า `captureMode === 'dxgi'`:
```
title="DXGI Desktop Duplication — minimap detection active"
```

## Verify
`pnpm -C src exec tsc --noEmit` pass
```

---

### ⚫ Wave 5: Validation (Day 3)

#### Task 5.1 — gemma4:12b: perf_p7 benchmark
```
TSK-GMMP01P04EP04SPR04-01

คุณเป็น Rust developer ที่เชี่ยวชาญ performance testing

## Task
ตรวจสอบว่า `tests/perf/src/bin/perf_p7.rs` ยังใช้ได้กับ DXGI capture ใหม่

## Context
- perf_p7 วัด RAM (≤400 MB) และ CPU ของ G-Maiden process
- ไม่ได้ depend on capture implementation โดยตรง — วัดจาก process-level metrics
- แต่ต้องตรวจว่า assertions/thresholds ยัง align กับ ADR-13

## Action
1. อ่านไฟล์ `tests/perf/src/bin/perf_p7.rs`
2. Verify ว่า `RAM_BUDGET_MB = 400` และ CPU threshold ยัง correct
3. ถ้ามี reference ถึง WGC/capture — update comment ให้สะท้อน DXGI
4. เพิ่ม comment ว่า CPU budget ปรับจาก observation: DXGI ควรใช้ ≤1.5% แทน WGC 8%

## Verify
`cargo check -p perf` pass
```

#### Task 5.2 + 5.3 — Human: Manual testing
```
SPR04-02 + SPR04-03: Boss ทดสอบเอง
- เล่น Dota 2 (borderless fullscreen) + G-Maiden + OBS
- ตรวจ error.log: SLOW frame = 0
- ตรวจ gank alert ทำงาน
- ตรวจ Lite mode: เปลี่ยน Dota เป็น exclusive fullscreen → badge แสดง "Lite"
```

#### Task 5.4 — gemma-e2e: Cleanup Cargo.toml
```
TSK-GMMP01P04EP04SPR04-04

## Task
ใน `src-tauri/Cargo.toml`:
- ตรวจว่า `windows-capture` เป็น optional + อยู่ใน `[features] wgc`
- Default features ไม่รวม `wgc`

## Verify
`cargo check` pass (ไม่มี wgc) + `cargo check --features wgc` pass
```

#### Task 5.5 — aroon-rust:9b: Update CLAUDE.md
```
TSK-GMMP01P04EP04SPR04-05

## Task
อัปเดต `CLAUDE.md` ใน root ของ G-Maiden repo

## Action
เพิ่มใน section "Tauri v2 gotchas":

```markdown
5. **Screen capture uses DXGI Desktop Duplication (not WGC).** WGC had CPU 8% +
   frame stalls on Win10 (ADR-13). DXGI captures via GPU copy — ≤1.5% CPU. Dota 2
   must run in **borderless fullscreen** (`-window -noborder`). If exclusive
   fullscreen → auto-fallback to GSI-only Lite mode (no CV, still has voice/overlay).
   WGC code preserved behind `--features wgc` flag.
```

## Verify
Content is valid markdown
```

#### Task 5.6 — gemma-e2e: modules.json version bump
```
TSK-GMMP01P04EP04SPR04-06

## Task
ใน `modules.json` (root ของ G-Maiden) — bump version ของ capture module

หา entry ที่เกี่ยวกับ capture/cv/minimap แล้ว bump patch version +1

## Verify
JSON valid (ใช้ `python -m json.tool modules.json`)
```

---

## Execution Timeline

```
Day 1 AM:  Wave 1 ─── gemma-e2e(SPR01-01) → Opus(SPR01-02+03) → aroon(SPR01-04)
Day 1 PM:  Wave 2 ─── Sonnet(SPR01-05) ∥ gemma-e2e(SPR02-01, SPR02-03)
Day 2 AM:  Wave 3 ─── Opus(SPR02-02) ∥ Sonnet(SPR02-04) ∥ gemma-e2e(SPR02-05)
Day 2 PM:  Wave 4 ─── Sonnet(SPR03-01) → gemma-e2e(SPR03-02)
Day 3:     Wave 5 ─── gemma4(SPR04-01) ∥ Human(SPR04-02+03) ∥ gemma-e2e(SPR04-04+06) ∥ aroon(SPR04-05)
```

---

## DAG — Dependency Map

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 1 — DXGI Wrapper (Day 1)                                                        │
│                                                                                         │
│  ┌──────────────┐     ┌────────────────────┐     ┌──────────────┐     ┌──────────────┐  │
│  │ SPR01-01     │────▶│ SPR01-02 + 03      │────▶│ SPR01-04     │────▶│ SPR01-05     │  │
│  │ Cargo.toml   │     │ DxgiCapture::new() │     │ Drop trait   │     │ Unit test    │  │
│  │ features     │     │ + acquire_frame()  │     │ (cleanup)    │     │ (10 frames)  │  │
│  │              │     │                    │     │              │     │              │  │
│  │ ⬤ gemma-e2e │     │ ⬤ OPUS      10pt  │     │ ⬤ aroon  1pt│     │ ⬤ Sonnet 3pt│  │
│  │ 1pt          │     │ ⚡ CRITICAL PATH   │     │              │     │              │  │
│  └──────────────┘     └────────────────────┘     └──────────────┘     └──────────────┘  │
│       ⛓️ SERIAL ──────────────────────────────────────────────────────────▶              │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  PHASE 2 — Integration (Day 2)                                                          │
│                                                                                         │
│  ┌──────────────┐     ┌────────────────────┐     ┌──────────────┐                       │
│  │ SPR02-01     │──┬─▶│ SPR02-02           │──┬─▶│ SPR02-04     │                       │
│  │ Rename +     │  │  │ DXGI capture loop  │  │  │ GSI-only     │                       │
│  │ feature gate │  │  │ (main integration) │  │  │ fallback     │                       │
│  │              │  │  │                    │  │  │              │                       │
│  │ ⬤ gemma-e2e │  │  │ ⬤ OPUS       8pt  │  │  │ ⬤ Sonnet 3pt│                       │
│  │ 2pt          │  │  │ ⚡ CRITICAL PATH   │  │  │              │                       │
│  └──────────────┘  │  └────────────────────┘  │  └──────────────┘                       │
│                    │                          │                                         │
│                    │  ┌──────────────┐        │  ┌──────────────┐                       │
│                    └─▶│ SPR02-03     │        └─▶│ SPR02-05     │                       │
│                 🔀    │ Cadence      │     🔀    │ capture-mode │                       │
│                       │ constants    │           │ event        │                       │
│                       │              │           │              │                       │
│                       │ ⬤ gemma-e2e │           │ ⬤ gemma-e2e │                       │
│                       │ 1pt          │           │ 1pt          │                       │
│                       └──────────────┘           └──────────────┘                       │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                    │                                    │
                    ▼                                    ▼
┌──────────────────────────────────┐  ┌───────────────────────────────────────────────────┐
│  PHASE 3 — Frontend (Day 2 PM)  │  │  PHASE 4 — Validation & Cleanup (Day 3)           │
│                                  │  │                                                   │
│  ┌──────────────┐ ┌────────────┐ │  │  ┌──────────────┐     ┌──────────────┐            │
│  │ SPR03-01     │▶│ SPR03-02   │ │  │  │ SPR04-01     │────▶│ SPR04-02     │──┬────────▶│
│  │ Badge UI     │ │ Tooltip    │ │  │  │ perf_p7      │     │ In-game test │  │         │
│  │ (React)      │ │            │ │  │  │ benchmark    │     │ (Dota+OBS)   │  │         │
│  │              │ │            │ │  │  │              │     │              │  │         │
│  │ ⬤ Sonnet    │ │ ⬤ gemma   │ │  │  │ ⬤ gemma4    │     │ ⬤ HUMAN     │  │         │
│  │ 2pt          │ │ -e2e  1pt │ │  │  │ :12b    3pt  │     │ 5pt          │  │         │
│  └──────────────┘ └────────────┘ │  │  └──────────────┘     └──────────────┘  │         │
│                                  │  │       ⚡ CRITICAL PATH ────────────────▶ │         │
└──────────────────────────────────┘  │                                         │         │
                                      │  ┌──────────────┐                       │         │
                                      │  │ SPR04-03     │◀──── (from SPR02-04)  │         │
                                      │  │ Lite mode    │                🔀     │         │
                                      │  │ verify       │                       │         │
                                      │  │              │  ┌──────────────┐     │         │
                                      │  │ ⬤ HUMAN     │  │ SPR04-04     │◀────┘         │
                                      │  │ 2pt          │  │ Cleanup      │               │
                                      │  └──────────────┘  │ Cargo.toml   │               │
                                      │                    │ ⬤ gemma-e2e │               │
                                      │                    │ 1pt          │    🔀         │
                                      │                    └──────────────┘               │
                                      │                    ┌──────────────┐               │
                                      │                    │ SPR04-05     │◀──── (after   │
                                      │                    │ CLAUDE.md    │      SPR04-02) │
                                      │                    │ ⬤ aroon 1pt │               │
                                      │                    └──────────────┘    🔀         │
                                      │                    ┌──────────────┐               │
                                      │                    │ SPR04-06     │◀────┘         │
                                      │                    │ modules.json │               │
                                      │                    │ ⬤ gemma-e2e │               │
                                      │                    │ 1pt          │               │
                                      │                    └──────────────┘               │
                                      └───────────────────────────────────────────────────┘
```

### Critical Path (⚡)

```
SPR01-01 → SPR01-02+03 → SPR01-04 → SPR01-05 → SPR02-01 → SPR02-02 → SPR04-01 → SPR04-02
   1pt         10pt          1pt         3pt         2pt         8pt         3pt        5pt
 gemma-e2e    OPUS        aroon-rust   Sonnet     gemma-e2e    OPUS       gemma4:12b  HUMAN
                                                                          ─────────────────
                                                                          Total: 33pt
                                                                          Bottleneck: Opus (18pt)
```

### Parallel Execution Opportunities

| Parallel Slot | Tasks | Models Running Concurrently | Dependency Gate |
|---|---|---|---|
| **P1** | SPR02-02 🔀 SPR02-03 | Opus + gemma-e2e | Both wait for SPR02-01 |
| **P2** | SPR02-04 🔀 SPR02-05 | Sonnet + gemma-e2e | Both wait for SPR02-02 |
| **P3** | SPR03-01 (Phase 3) 🔀 SPR04-01 (Phase 4) | Sonnet + gemma4:12b | Phase 3 needs SPR02-04; Phase 4 needs SPR02-02 (independent) |
| **P4** | SPR04-02 🔀 SPR04-03 | Human × 2 | SPR04-02 needs SPR04-01; SPR04-03 needs SPR02-04 |
| **P5** | SPR04-04 🔀 SPR04-05 🔀 SPR04-06 | gemma-e2e + aroon-rust + gemma-e2e | All wait for SPR04-02 pass |

### Adjacency List (machine-readable)

```json
{
  "SPR01-01": { "depends_on": [],           "unlocks": ["SPR01-02"] },
  "SPR01-02": { "depends_on": ["SPR01-01"], "unlocks": ["SPR01-04"] },
  "SPR01-04": { "depends_on": ["SPR01-02"], "unlocks": ["SPR01-05"] },
  "SPR01-05": { "depends_on": ["SPR01-04"], "unlocks": ["SPR02-01"] },
  "SPR02-01": { "depends_on": ["SPR01-05"], "unlocks": ["SPR02-02", "SPR02-03"] },
  "SPR02-02": { "depends_on": ["SPR02-01"], "unlocks": ["SPR02-04", "SPR02-05", "SPR04-01"] },
  "SPR02-03": { "depends_on": ["SPR02-01"], "unlocks": [] },
  "SPR02-04": { "depends_on": ["SPR02-02"], "unlocks": ["SPR03-01", "SPR04-03"] },
  "SPR02-05": { "depends_on": ["SPR02-02"], "unlocks": [] },
  "SPR03-01": { "depends_on": ["SPR02-04"], "unlocks": ["SPR03-02"] },
  "SPR03-02": { "depends_on": ["SPR03-01"], "unlocks": [] },
  "SPR04-01": { "depends_on": ["SPR02-02"], "unlocks": ["SPR04-02"] },
  "SPR04-02": { "depends_on": ["SPR04-01"], "unlocks": ["SPR04-04", "SPR04-05", "SPR04-06"] },
  "SPR04-03": { "depends_on": ["SPR02-04"], "unlocks": [] },
  "SPR04-04": { "depends_on": ["SPR04-02"], "unlocks": [] },
  "SPR04-05": { "depends_on": ["SPR04-02"], "unlocks": [] },
  "SPR04-06": { "depends_on": ["SPR04-02"], "unlocks": [] }
}
```

---

## Changelog

| Version | Date | Summary |
|---|---|---|
| 0.1.0 | 2026-06-28 | Initial assignment — 5 waves, 6 models, 18 tasks |
| 0.2.0 | 2026-06-28 | Added DAG dependency map, critical path, parallel slots, adjacency list |
