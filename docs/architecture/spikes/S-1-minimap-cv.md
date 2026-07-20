# Spike S-1 — Minimap CV feasibility (detect enemy hero icons)

> ประเภท: spike | phase: spike | model: opus
> Source-of-truth ที่อ่าน (scope ที่ parent อนุญาต): [[engineering-spec]] §1, [[technical-design-document]] §5 + Risk R-02.
> Artifact ที่รันได้: [`spikes/s1-minimap-cv/`](file:///g:/G-Maiden/spikes/s1-minimap-cv/src/main.rs) (Rust = production-representative; [`node-equiv.mjs`](file:///g:/G-Maiden/spikes/s1-minimap-cv/node-equiv.mjs) = executable equivalent).

## 1. คำถามของ spike (acceptance gates)

| Gate | เกณฑ์ | ที่มา |
| --- | --- | --- |
| **G-LAT** | capture+detect loop ≤ **80 ms** | task acceptance / Spec §1 (detect budget 50ms, capture 30ms) |
| **G-CPU** | background CPU เพิ่ม ≤ **2.5 %** ที่ ~**6 Hz** | task / SRS NFR / TDD R-02 |
| **G-ACC** | template match แม่น ≥ **80 %** บน **เกมจริง** | task acceptance |

วิธีของ spike สะท้อน TDD §5: ใช้ **template matching** ก่อน (imageproc NCC), ยกเป็น ONNX detector ภายหลังถ้าแม่นไม่พอ.

## 2. การออกแบบ PoC (production-shaped)

ทำตาม pipeline ที่ Rust core จะใช้จริง (TDD §5), **ไม่** brute-force NCC ทั้ง region:

1. **capture** — คัดเฉพาะ bounding box ของ minimap (PoC: region memcpy = ส่วนถูกของ DXGI duplication; ค่า `AcquireNextFrame` ถูก budget แยก ~30ms ใน Spec §1 และเป็น refresh-bound ไม่ใช่ CPU).
2. **prefilter** — สแกน O(W·H) คิดคะแนน "heroness" จากสีวง **team-ring (Dire-red)** × ความสว่าง แล้วทำ grid non-max suppression → ได้ candidate list สั้น ๆ (~30–80 จุด). นี่คือกุญแจที่ทำให้อยู่ใน budget.
3. **match** — grayscale **NCC** (normalized cross-correlation) ของแต่ละ candidate patch เทียบ template ฮีโร่ที่รู้จาก draft ทั้ง 10 ตัว; คะแนนสูงสุดเกิน threshold (0.55) = เจอ; แล้ว NMS ทับซ้อน.

ข้อมูลทดสอบเป็น **synthetic + deterministic** (seeded xorshift\*, ไม่มี rng crate): minimap 256×256, icon 20×20, วางศัตรู 3–5 ตัว/เฟรม พร้อม **degradation จริง** — fog dimming (0.55–1.0), additive noise (σ=0.035), sub-pixel jitter (σ=0.6px), partial occlusion 18% — บวก distractor (creep/ward blips) เพื่อวัด false-positive. ดังนั้นบาร์ 80% เป็นการทดสอบความทนของ NCC จริง ไม่ใช่ของตาย.

## 3. ผลลัพธ์

### 3.1 สถานะการรันในสภาพแวดล้อมนี้

**อัปเดต 2026-06-21 (turn 14)**: รัน harness เชิงประจักษ์ทั้ง Rust + Node แล้ว
บนเครื่อง dev (12 cores). ตัวเลขข้างล่าง = **empirical** (replace
analytical estimate เดิม). พบ + แก้ **bug 2 ตัว** ที่ทำให้ harness ไม่
compile/runtime panic ก่อน — สาเหตุที่ worker เดิมรันไม่ได้ไม่ใช่แค่ sandbox
gate.

| Bug | ที่ไหน | แก้ |
|-----|--------|-----|
| `f32 / usize` compile error | main.rs:493 | cast `as f32` |
| index OOB ที่ grid prefilter | main.rs:282 | clamp `y/cell` ≤ `gh-1` (MAP/cell ไม่หาร พอดี) |

### 3.2 G-LAT (latency) — **PASS (empirical), headroom เหลือเฟือ**

วัดจาก 300 frames @ 6 Hz, MAP=256, ICON=20, 10 templates:

| Metric | Rust release | Node (upper bound) |
|--------|--------------|---------------------|
| capture region-copy p50 | 0.060 ms | (same — region memcpy) |
| **detect p50** | **0.792 ms** | 2.533 ms |
| detect p95 | 2.086 ms | 7.797 ms |
| **LOOP (cap+detect) p50** | **0.852 ms** | 3.322 ms |
| LOOP p95 | 2.291 ms | 9.428 ms |

Estimate เดิม ~0.7 ms (Rust) ใกล้เคียงจริง ~0.79 ms. **gate 80 ms ผ่านสบาย ~100x headroom.**

### 3.3 G-CPU (CPU @ 6 Hz) — **PASS (empirical)**

| | Rust | Node |
|---|---|---|
| avg detect / frame | 1.067 ms | 4.859 ms |
| single-core occupancy | 0.640 % | 2.915 % |
| **system CPU (12 cores)** | **0.053 %** | 0.243 % |

gate ≤ 2.5 % system CPU — **ผ่าน ~50x margin**. สอดคล้องกลยุทธ์ R-02.

### 3.4 G-ACC (accuracy) — **FAIL บน synthetic เอง (10.2 %)** ⚠️

**Estimate เดิม "น่าจะ > 80%" ถูกหักล้างด้วยตัวเลขจริง:**

| Metric | Rust | Node |
|--------|------|------|
| enemies placed | 1,208 | 1,208 |
| correct id+pos (TP) | 123 | 120 |
| false positives | 309 | 307 |
| **identity match-rate** | **10.2 %** | 9.9 % |
| precision | 28.5 % | 28.1 % |

ตัวเลขสองรันสอดคล้อง (~0.3% drift) → ไม่ใช่ noise การวัด, อัลกอริทึมจริง ๆ
ไม่ทน degradation profile (fog 0.55–1.0 + noise σ=0.035 + jitter σ=0.6px +
occlusion 18% + distractors). NCC normalize ครอบ brightness ได้ แต่ noise +
occlusion ทำให้ similarity score ตกลงต่ำกว่า threshold 0.55 บ่อยจน TP
หาย และ distractors ทำ FP ขึ้นสูง.

**Implication**: ONNX detector ยกระดับ (TDD §5) **น่าจะเป็นข้อบังคับ ไม่ใช่
optional** — แม้กระทั่งบน synthetic ก็ไม่ผ่าน 80%, real-game จะแย่กว่า.
latency headroom ~100x รองรับ ONNX small เพียบ.

### 3.5 Reference — ทำไม prefilter จำเป็น

| | Rust | Node |
|---|---|---|
| brute 1 template (full NCC region scan) | 30.5 ms | 373.9 ms |
| brute 10 templates | **305.3 ms** | 3,739 ms |

305 ms > 80 ms gate → **prefilter จำเป็น 100%**. ยืนยันว่าการออกแบบ
candidate-list pipeline (TDD §5) เป็นถูกทาง.

## 4. BLOCKED / ต้อง escalate (สิ่งที่ปิดในนี้ไม่ได้)

1. **G-ACC บนเกมจริงยังพิสูจน์ไม่ได้ — ขาด resource:**
   - (a) เฟรม minimap จาก Dota 2 จริง (หลาย resolution/HUD scale, มี/ไม่มี fog) พร้อม ground-truth ตำแหน่งศัตรู.
   - (b) ภาพ portrait ฮีโร่จริง crop เป็น template (รายชื่อจาก draft/GSI).
   - (c) รัน accuracy บนชุดนั้น → ยืนยัน ≥80% หรือ trigger ยกระดับเป็น ONNX (TDD §5; latency headroom รองรับได้).
2. **รัน harness เชิงประจักษ์ในนี้ไม่ได้** — `cargo`/`node` ถูก gate. ตัวเลข §3 เป็น analytical estimate; รันตาม §5 เพื่อแทนที่ด้วยค่าที่วัดจริง.

## 5. วิธีรัน (ยืนยันตัวเลข — คำสั่งเดียว)

```bash
# production-representative (Rust): พิมพ์ GATES + exit code != 0 ถ้า latency/CPU ตก (ใช้ใน CI)
cargo run --release --manifest-path spikes/s1-minimap-cv/Cargo.toml

# executable equivalent (Node): อัลกอริทึม + seed เดียวกัน; latency = upper bound
node spikes/s1-minimap-cv/node-equiv.mjs
```

ทั้งสองพิมพ์: latency p50/p95 (cap+detect), accuracy (TP/FP/match-rate/precision), CPU @6Hz, และ reference **brute-force NCC** (~หลายร้อย ms) ที่พิสูจน์ว่า prefilter จำเป็น.

## 6. สรุป (verdict — empirical, post turn-14)

- **G-LAT + G-CPU: PASS empirical** (Rust loop 0.85 ms p50 / 0.053% CPU @ 6 Hz)
  — template matching + color-prefilter ไม่ใช่คอขวดเลย, headroom ~100x.
- **G-ACC: FAIL บน synthetic เอง (10.2 %)** — estimate "น่าจะ > 80%" ถูก
  ตัวเลขจริงหักล้าง. NCC ไม่ทน noise + occlusion + distractors profile ที่
  ใช้ทดสอบ. real-game จะไม่ผ่านยิ่งกว่า.
- **แนะนำใหม่ (update จาก turn-14):**
  1. ONNX detector **จำเป็น** ไม่ใช่ "ถ้าไม่ผ่านค่อยยก" — synthetic ก็ไม่ผ่านแล้ว.
     latency headroom 100x เหลือเฟือ.
  2. คงโครงสร้าง pipeline เดิม (capture → prefilter → match) — เปลี่ยนแค่ขั้น
     match: NCC → ONNX inference (small CNN backbone, e.g., MobileNetV3
     classification head). prefilter ยังกำจัด most-of-frame ไม่ใช่ tradeoff.
  3. real-game footage ยังจำเป็นเพื่อ **train + validate** ONNX (ไม่ใช่แค่
     measure NCC accuracy). ดู §4.1.
- ลด priority ของ template-matching default path ใน ADR-05 → ทำเป็น **fallback**
  เมื่อ ONNX ไม่พร้อม / load failure.


