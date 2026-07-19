---
title: "CR-001: Migrate Screen Capture from WGC to DXGI Desktop Duplication"
doc_id: "CR-001-dxgi-capture-migration"
type: "Change Request"
status: "Submitted"
priority: "Critical"
version: "1.0.0"
submitted: "2026-06-28"
submitted_by: "Boss"
reviewed_by: ""
approved_by: ""
target_release: "v0.2.0"
related_docs:
  - "ADR-13-dxgi-capture-migration"
  - "IMPL-PLAN-DXGI-migration"
  - "DXGI-task-assignment"
updated: "2026-06-28"
owner: "Boss"
---

# CR-001: Migrate Screen Capture from WGC to DXGI Desktop Duplication

---

## 1. Change Summary

| Field | Value |
|---|---|
| **Request ID** | CR-001 |
| **System** | G-Maiden (Dota 2 AI Companion) |
| **Module** | Capture Pipeline ([`src-tauri/src/capture.rs`](file:///g:/G-Maiden/src-tauri/src/capture.rs)) |
| **Current Version** | v0.1.0 |
| **Target Version** | v0.2.0 |
| **Type** | Performance Fix / Architecture Change |
| **Priority** | Critical — blocks streamer positioning (G-Suite roadmap) |
| **Urgency** | High — ตรวจพบจาก in-game test ล่าสุด (2026-06-28) |

---

## 2. Problem Statement

### สิ่งที่เกิดขึ้น
G-Maiden ใช้ **Windows Graphics Capture (WGC)** จับภาพ minimap ของ Dota 2 เพื่อส่งเข้า CV pipeline (hero detection → gank prediction). จาก in-game test ล่าสุดพบ:

| Metric | Budget | Actual | Over |
|---|---|---|---|
| **CPU Usage** | ≤ 2.5% | **8.0%** | 3.2x |
| **Frame Time** | 67–125ms (8–15 Hz) | **1,300–2,300ms** (~0.7 Hz) | 10–18x |
| **SLOW Frames** | 0 | **1,294 entries** in error.log | — |
| **Startup Failures** | 0 | **6 retries** per session (Win10 `SetBorderRequired` not supported) | — |

### ผลกระทบ
1. **CV pipeline แทบไม่ทำงาน** — ได้ภาพ ~0.7 Hz ไม่เพียงพอสำหรับ hero detection
2. **Gank prediction ล้มเหลว** — Sentry เห็น hero หาย → boost Hz → WGC ยิ่ง stall → วงจรอุบาทว์
3. **ใช้ CPU มากเกินงบ 3.2 เท่า** — ยังไม่มี overlay/effects หนักๆ เพิ่มเข้ามา
4. **Blocks streamer use case** — รันคู่ OBS ไม่ไหว, ขัดกับ G-Suite positioning เป็น "Streamer OS"

### Root Cause
- WGC ต้องการ compositor active → **ไม่รองรับ exclusive fullscreen** (Dota 2 default)
- WGC busy-wait ระหว่างรอ frame → CPU สูงแม้ได้ frame น้อย
- `SetBorderRequired` API ไม่มีบน Windows 10 (build 19045) → startup crash/retry

---

## 3. Proposed Change

**เปลี่ยน screen capture backend จาก WGC เป็น DXGI Desktop Duplication API** พร้อม GSI-only fallback

### 3.1 Scope of Change

| Component | Change Type | Description |
|---|---|---|
| [`src-tauri/src/dxgi.rs`](file:///g:/G-Maiden/src-tauri/src/dxgi.rs) | **New** | DXGI Desktop Duplication wrapper (~250 LOC) |
| [`src-tauri/src/capture.rs`](file:///g:/G-Maiden/src-tauri/src/capture.rs) | **Major Refactor** | WGC callback → DXGI explicit loop + Lite mode fallback |
| [`src-tauri/src/capture_wgc.rs`](file:///g:/G-Maiden/src-tauri/src/capture_wgc.rs) | **Rename** | เก็บ WGC code เดิมไว้ behind feature flag |
| [`src-tauri/Cargo.toml`](file:///g:/G-Maiden/src-tauri/Cargo.toml) | **Modify** | เพิ่ม `windows` crate features, ย้าย `windows-capture` เป็น optional |
| [`src/src/App.tsx`](file:///g:/G-Maiden/src/src/App.tsx) | **Minor** | เพิ่ม capture mode badge (DXGI/Lite) |
| `CLAUDE.md` | **Minor** | อัปเดต gotcha #5 |
| [`modules.json`](file:///g:/G-Maiden/modules.json) | **Minor** | Version bump |

### 3.2 What Does NOT Change

| Component | Reason |
|---|---|
| CV Pipeline (prefilter/detector/sentry/motion/signal) | รับ BGRA bytes เหมือนเดิม — input format ไม่เปลี่ยน |
| GSI Server | Independent — ไม่เกี่ยวกับ capture |
| Voice System / Announcer | Independent |
| Overlay / Kill Banner | Independent |
| G-Master Advice Engine | Independent |

### 3.3 Architecture Before vs After

```
BEFORE (WGC):
  capture.rs ─── windows-capture crate ─── WGC API ─── Compositor ─── Frame
       │                                                    ↑
       │                                          (fights with game)
       ▼
  CV Pipeline (prefilter → detect → sentry → motion → signal)

AFTER (DXGI):
  capture.rs ─── dxgi.rs ─── DXGI Desktop Duplication ─── GPU Copy ─── Frame
       │                           │                          ↑
       │                           │                  (direct, no compositor)
       │                     (fail? → Lite mode)
       ▼
  CV Pipeline (prefilter → detect → sentry → motion → signal)  ← UNCHANGED
```

---

## 4. Justification

### 4.1 Business Justification

| Factor | Impact |
|---|---|
| **Streamer readiness** | G-Suite positioning เป็น "Streamer OS" ต้องรันคู่ OBS ได้ — CPU 8% ทำไม่ได้ |
| **Product tiering** | DXGI เปิดทาง Lite (GSI-only, ฟรี) / Standard (DXGI CV) / Pro (+ cloud AI) |
| **User experience** | Gank prediction ที่ทำงานจริง (ไม่ใช่ ~0.7 Hz ที่ detect อะไรไม่ได้) |
| **Platform support** | หยุดพึ่ง Win10 API ที่ไม่ stable (`SetBorderRequired`) |

### 4.2 Technical Justification

| Metric | WGC (Current) | DXGI (Proposed) | Improvement |
|---|---|---|---|
| CPU Usage | ~8% | ≤1.5% | **5.3x better** |
| Frame Latency | 1,300–2,300ms | <50ms | **26–46x better** |
| Effective Hz | ~0.7 Hz | 4–8 Hz | **6–11x better** |
| Startup Reliability | 6 retries, sometimes fails | Instant (fail → Lite) | **No retry needed** |
| OBS Compatibility | Conflicts (both use compositor) | No conflict (DXGI is separate) | **Streamer-safe** |
| Win10 Support | Partial (no `SetBorderRequired`) | Full (no Win11 APIs needed) | **Full support** |

### 4.3 Cost of Inaction

ถ้าไม่ทำ:
- G-Maiden CV pipeline ใช้งานจริงไม่ได้ (0.7 Hz = ไม่มี gank prediction)
- G-Suite ไม่สามารถ position เป็น streamer tool ได้ (CPU เกินงบ 3.2 เท่า)
- ทุก feature ใหม่ที่ build บน CV pipeline (smart overlay, danger zone, ward suggestion) จะ inherit ปัญหานี้

---

## 5. Impact Analysis

### 5.1 Affected Systems

| System | Impact Level | Description |
|---|---|---|
| Capture Pipeline | **High** | เปลี่ยน backend ทั้งหมด |
| CV Pipeline | **None** | Input format (BGRA bytes) ไม่เปลี่ยน |
| Resource Governor | **None** | อ่าน CPU/RAM เหมือนเดิม, threshold ไม่เปลี่ยน |
| Frontend (App.tsx) | **Low** | เพิ่ม badge component |
| Build System | **Low** | เพิ่ม `windows` crate features |
| User Settings | **Low** | ต้องใช้ borderless fullscreen (ไม่ใช่ exclusive) |

### 5.2 User Impact

| User Segment | Impact | Mitigation |
|---|---|---|
| **Borderless fullscreen users** (majority) | Positive — better performance | ไม่ต้องทำอะไร |
| **Exclusive fullscreen users** | Feature reduction — no CV | Lite mode badge + tooltip อธิบาย + แนะนำ borderless |
| **Multi-monitor users** | Potential wrong-monitor capture | Auto-detect Dota window position (backlog BL-001) |

### 5.3 Backward Compatibility

| Aspect | Status |
|---|---|
| WGC code preserved | `capture_wgc.rs` + `--features wgc` flag |
| Rollback possible | Switch Cargo feature flag — rebuild เสร็จใน 2 นาที |
| Config migration | ไม่จำเป็น — ไม่มี user config ที่เปลี่ยน |
| Data migration | ไม่จำเป็น — ไม่มี persistent data ที่เปลี่ยน |

---

## 6. Risk Assessment

| # | Risk | Probability | Impact | Severity | Mitigation |
|---|---|---|---|---|---|
| R1 | DXGI ไม่รองรับ exclusive fullscreen | High | Medium | **Medium** | GSI-only Lite mode ทำงานทันที |
| R2 | Multi-monitor จับจอผิด | Medium | Medium | **Medium** | Auto-detect Dota window (BL-001, phase ถัดไป) |
| R3 | DXGI acquire timeout → thread hang | Low | High | **Medium** | Timeout 100ms + retry backoff |
| R4 | `windows` crate API breaking change | Low | Medium | **Low** | Pin version ใน Cargo.toml |
| R5 | Regression ใน CV pipeline | Low | High | **Medium** | Pipeline logic ไม่เปลี่ยน + perf_p7 benchmark |
| R6 | Local LLM generate incorrect unsafe code | Medium | High | **High** | Opus ทำ unsafe tasks + cargo clippy + code review |

---

## 7. Implementation Plan

### 7.1 Effort Summary

| Phase | Description | Duration | Story Points | Owner |
|---|---|---|---|---|
| **P1** | DXGI Wrapper | 1–2 days | 15 pt | Opus (core) + gemma-e2e + aroon-rust + Sonnet |
| **P2** | Integration | 1 day | 15 pt | Opus (core) + Sonnet + gemma-e2e |
| **P3** | Frontend | 0.5 day | 3 pt | Sonnet + gemma-e2e |
| **P4** | Validation & Cleanup | 1–2 days | 13 pt | gemma4:12b + Human + gemma-e2e + aroon-rust |
| **Total** | | **3–5 days** | **46 pt** | **18 tasks + 7 sub-tasks** |

### 7.2 Resource Allocation

| Resource | Role | Availability |
|---|---|---|
| Claude Opus | Complex unsafe Rust + Windows API (39% of work) | On-demand |
| Claude Sonnet | Moderate reasoning tasks (20%) | On-demand |
| gemma4:12b (Ollama) | Performance validation (7%) | Local, Q4_K_XL |
| Aroow-Rust-Coder-9B (Ollama) | Rust patterns (4%) | Local, Q4_K_S |
| gemma-e2e (Ollama) | Mechanical edits (15%) | Local, 4-bit |
| Boss (Human) | Manual in-game testing (15%) | Day 3 |

### 7.3 Critical Path

```
SPR01-01 → SPR01-02+03 → SPR01-04 → SPR01-05 → SPR02-01 → SPR02-02 → SPR04-01 → SPR04-02
   1pt         10pt          1pt         3pt         2pt         8pt         3pt        5pt
 gemma-e2e    OPUS        aroon-rust   Sonnet     gemma-e2e    OPUS       gemma4:12b  HUMAN
───────────────────────────────────────────────────────────────────────────────────────────
Total: 33pt on critical path │ Bottleneck: Opus (18pt) │ ~3 days minimum
```

### 7.4 Parallel Opportunities

5 parallel slots identified — see [[DXGI-task-assignment]] DAG section

---

## 8. Testing Strategy

### 8.1 Automated Testing

| Test | Gate | Owner |
|---|---|---|
| `cargo check` | Every task | Assigned model |
| `cargo clippy` — no warnings | Every task | Assigned model |
| `cargo test` — all existing tests pass | Phase 1, 2 | Assigned model |
| `cargo test -- --ignored capture_10_frames` | Phase 1 (requires display) | Sonnet |
| `pnpm -C src exec tsc --noEmit` | Phase 3 | Sonnet |
| `perf_p7` benchmark: CPU ≤ 2.5%, RAM ≤ 400 MB | Phase 4 | gemma4:12b |

### 8.2 Manual Testing

| Test | Acceptance Criteria | Owner |
|---|---|---|
| In-game test (Dota 2 borderless + G-Maiden + OBS) | (1) error.log: 0 SLOW frames (2) Gank alert fires within 3s (3) OBS stream smooth (4) FPS drop < 5 | Boss |
| Lite mode test (Dota 2 exclusive fullscreen) | (1) Badge shows "Lite" (2) Announcer/overlay/advice work (3) No crash | Boss |

### 8.3 Regression Scope

| Area | Test Method | Risk Level |
|---|---|---|
| CV detection accuracy | Compare gank alert timing vs WGC baseline | Medium |
| Voice system | Play test — voice triggers on events | Low |
| Overlay rendering | Visual check during test match | Low |
| GSI data flow | Verify stats/gold/items update in-game | Low |

---

## 9. Rollback Plan

### 9.1 Rollback Trigger
- `perf_p7` fails (CPU > 2.5% หรือ RAM > 400 MB)
- In-game test: SLOW frames > 0 (regression)
- Gank detection ไม่ trigger เลยตลอด match
- Crash/panic ที่ reproduce ได้

### 9.2 Rollback Procedure

| Step | Action | Duration |
|---|---|---|
| 1 | `cargo build --release --features wgc` | 2 min |
| 2 | ใน `capture.rs` เปลี่ยน `start()` เรียก `capture_wgc::start()` | 1 min |
| 3 | Rebuild + test | 5 min |
| **Total** | | **< 10 min** |

### 9.3 Rollback Window
สามารถ rollback ได้ตลอดเวลา — WGC code ไม่ถูกลบ, อยู่ใน `capture_wgc.rs` behind feature flag

---

## 10. Definition of Done

### 10.1 Acceptance Criteria

- [ ] `dxgi.rs` สร้างเสร็จ — `DxgiCapture::new()` + `acquire_frame()` ทำงาน
- [ ] `capture.rs` ใช้ DXGI เป็น default — WGC อยู่ behind `--features wgc`
- [ ] GSI-only Lite mode fallback ทำงานเมื่อ DXGI fail
- [ ] Frontend แสดง capture mode badge (DXGI/Lite)
- [ ] `cargo check` + `cargo clippy` + `cargo test` pass
- [ ] `pnpm -C src exec tsc --noEmit` pass

### 10.2 Success Criteria

- [ ] **CPU ≤ 2.5%** (วัดจาก perf_p7 ขณะเล่น Dota 2 + OBS)
- [ ] **Frame time < 100ms** (ไม่มี SLOW frame ใน error.log)
- [ ] **Gank alert fires within 3s** ของ enemy หายจาก minimap
- [ ] **OBS stream smooth** — ไม่กระตุก ไม่ FPS drop > 5

### 10.3 Exit Criteria

- [ ] `cargo build --release` สำเร็จ
- [ ] In-game test: 1 full match ผ่านทุก success criteria
- [ ] Lite mode test: exclusive fullscreen → Lite badge + ไม่ crash
- [ ] Documentation updated (CLAUDE.md, modules.json)
- [ ] Code committed + pushed to main

---

## 11. Approval

| Role | Name | Decision | Date | Signature |
|---|---|---|---|---|
| **Requester** | Boss | Submitted | 2026-06-28 | |
| **Technical Lead** | | | | |
| **QA** | | | | |
| **Approved By** | | | | |

### Decision Options

- [ ] **Approved** — Proceed with implementation as described
- [ ] **Approved with conditions** — Proceed with noted modifications
- [ ] **Deferred** — Valid request, defer to sprint ___
- [ ] **Rejected** — Reason: ___

---

## 12. References

| Document | Location |
|---|---|
| ADR-13: DXGI Capture Migration | [[ADR-13-dxgi-capture-migration]] |
| Implementation Plan | [[IMPL-PLAN-DXGI-migration]] |
| Task Assignment + DAG | [[DXGI-task-assignment]] |
| Error Log Evidence | `%LOCALAPPDATA%\G-Maiden\logs\error.log` (2026-06-28) |
| Resource Governor | [`src-tauri/src/governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs) |
| Current Capture Code | [`src-tauri/src/capture.rs`](file:///g:/G-Maiden/src-tauri/src/capture.rs) |

---

## Changelog

| Version | Date | Summary |
|---|---|---|
| 1.0.0 | 2026-06-28 | Initial submission — CR-001 |
