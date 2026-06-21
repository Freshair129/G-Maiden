# Session — 2026-06-21 (turn 16) · Phase 2 kickoff — CV core (prefilter + region)

วาง roadmap Phase 2 (plan approved) แล้วเริ่มลงมือส่วนที่ทดสอบได้จริงโดย
**ไม่ต้องเปิด Dota** ก่อน — de-risk logic ล้วน ๆ ก่อนแตะ WGC ที่ verify สดเท่านั้น.

## การตัดสินใจ (ยืนยันจาก user, turn 15)
- **Training data = synthetic จาก official hero minimap icons** → ปลด bottleneck
  footage. footage จริงใช้แค่ validation.
- **Stack = tract (pure-Rust ONNX, ไม่ต้อง bundle DLL) + windows-capture (WGC v2.0)**.
- ADR-05 แก้: ONNX = default, NCC = fallback (เพราะ S-1 NCC FAIL 10%).

## ทำแล้ว (2 commits, 8 unit tests ผ่าน)
- `f1c0741` cv module: `Frame` (BGRA region) + `prefilter.rs` — port `candidates()`
  จาก spike. generalise 256/20 → runtime-sized. **per-pixel-averaged grid** แก้
  edge-cell bias (dimension หาร cell ไม่ลงตัว ทำให้ cell ขอบดูดพิกเซลเกิน → score
  สูงปลอม). **contrast gate** (>1.5×mean) กัน flat/fogged frame flag ทั้งจอ.
- `520430c` `region.rs`: `MinimapRegion::for_resolution()` (bottom-left anchor,
  side ≈15.6% screen height), `icon_size()` scale, `pixel_to_normalised()` map.
  serializable เผื่อ user calibrate override.

## งานต่อ (P2.0 ส่วนสุดท้าย — ต้อง verify สดกับ Dota)
- `capture.rs`: windows-capture v2.0 API (callback `GraphicsCaptureApiHandler`,
  `on_frame_arrived` → crop region ด้วย `MinimapRegion` → ส่ง `Frame` เข้า prefilter).
  adaptive rate 5–8 Hz (เร่ง 15 Hz เมื่อ Sentry สงสัย). **compile อย่างเดียวไม่พอ**
  — ต้องเปิด Dota/replay ดู candidate box เกาะไอคอนจริง + วัด CPU.
- หลังจากนั้น: P2.1 dataset generator (ขนาน), P2.2 tract detector, P2.3 G-Sentry.

## กับดักที่เจอ turn นี้
1. **prefilter sum-per-cell มี edge bias** เมื่อ MAP/cell ไม่ลงตัว — spike ไม่เจอ
   เพราะ synthetic มี peak จริงกลบ. production ต้อง average ต่อ pixel.
2. **flat frame = ทุก cell เท่ากัน = flag หมด** ถ้าใช้แค่ peak-fraction. ต้อง
   contrast-above-mean gate.
3. windows-capture เป็น **v2.0** (API เปลี่ยนจาก v1) — เขียนตาม v2 trait.
4. tauri bin ไม่มี lib target → `cargo test --bin g-maiden cv::` (ไม่ใช่ --lib).
