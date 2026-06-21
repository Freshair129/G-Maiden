# Session — 2026-06-21 (turn 14) · Spike S-1 minimap CV รันจริง

User ทำ Spike S-1 ค้างไว้ (`docs/SPIKE--S-1-MINIMAP-CV.md` + harness ที่
`spikes/s1-minimap-cv/`) แต่ worker เดิมรันไม่ได้ (sandbox + harness มี bugs)
จึงให้ analytical estimate. turn นี้ผมรันจริง — empirical ตัวเลข **หักล้าง
estimate** ในประเด็นสำคัญ (accuracy).

## สิ่งที่ทำ (commit `b5b34da`)

### Bugs ใน harness (สาเหตุที่ worker เดิมรันไม่ได้)

| Bug | ที่ไหน | แก้ |
|-----|--------|-----|
| compile: `f32 / usize` | `main.rs:493` (precision calc) | cast `as f32` |
| runtime panic: index OOB `len 144 idx 144` | `main.rs:282` (prefilter grid) | MAP/cell ไม่หารพอดี (256/20=12; y=240 ทำให้ y/cell=12 ทะลุ gw-1=11). clamp `(y/cell).min(gh-1)` |

worker เดิมเขียน "cargo+node ถูก gate" ใน §3.1 — จริงในแง่ sandbox; แต่
**แม้รันได้ก็จะพังที่ bug แรก** ที่ compile. confirm หลังแก้: compile +
runtime ผ่าน, ตัวเลขออกสมบูรณ์.

### Empirical numbers (300 frames @ 6 Hz, MAP 256×256, ICON 20×20, 10 templates)

#### G-LAT — **PASS** (Rust 0.852 ms p50 / Node 3.322 ms p50, gate 80 ms)

estimate เดิม ~0.7 ms (Rust) ใกล้เคียง empirical 0.792 ms (detect only).
headroom ~100x.

#### G-CPU — **PASS** (Rust 0.053% system / Node 0.243%, gate 2.5%)

estimate ~0.10% เดิมก็ใกล้เคียง 0.053%. 12-core machine ก็มี margin มากกว่า
spec original ที่อ้างถึง 4 cores.

#### G-ACC — **FAIL บน synthetic เอง** ⚠️

| Metric | Rust | Node |
|--------|------|------|
| identity match-rate | **10.2%** | 9.9% |
| precision | 28.5% | 28.1% |
| TP / placed | 123 / 1208 | 120 / 1208 |
| FP | 309 | 307 |

Estimate เดิม "น่าจะ > 80%" **ผิด**. ตัวเลข Rust + Node ตรงกัน (~0.3% drift =
ไม่ใช่ noise การวัด, อัลกอริทึมจริง ๆ ไม่ทน). NCC ไม่ทน degradation
profile (fog 0.55–1.0 + noise σ=0.035 + jitter σ=0.6px + occlusion 18% +
distractors).

### Reference (brute-force NCC)

brute 10 templates: Rust 305.3 ms / Node 3,739 ms → > 80ms gate ทันที →
**prefilter จำเป็น 100%** (pipeline design ถูก).

## บทเรียน / Implications

1. **Estimate ของ NCC accuracy ภายใต้ noise + occlusion สามารถผิดได้
   มหาศาล** (80% predicted vs 10% actual). NCC normalize brightness ก็จริง
   แต่ similarity score ภายใต้ noise/occlusion ตกลงต่ำกว่า threshold 0.55
   บ่อยมาก. TP หาย FP ขึ้น.
2. **ONNX detector ยกระดับ เป็น "mandatory" ไม่ใช่ "optional escalation"**.
   spec เดิม (TDD §5) วาง ONNX เป็น fallback ถ้า NCC ไม่ผ่าน — empirical
   บอกว่า NCC ไม่ผ่านตั้งแต่ synthetic. ปรับ ADR-05: ONNX = default,
   template matching = fallback (load failure).
3. **Real-game footage ยังจำเป็น** ไม่ใช่เพื่อวัด NCC แต่เพื่อ **train +
   validate ONNX**. scope shift จาก "เก็บ accuracy" → "เก็บ training set".
4. **Latency headroom 100x ทำให้เลือก ONNX ได้กว้าง** — small CNN
   classification head (MobileNetV3-class) ใน Rust พร้อมยังเข้า budget เยอะ.
5. **บั๊กใน harness ที่เขียนแต่ไม่ได้รัน** = common pitfall. ผม commit
   workflow ปกติคือ "เขียน → cargo check → run". ใน sandbox ที่รันไม่ได้
   ก็ยังควรอย่างน้อย `cargo check` ก่อนส่ง.

## State ปลาย turn

- Branch `main` ahead of origin by 27 commits.
- Working tree: orchestration files ของ user + S-2 spike doc ของ user (ไม่แตะ).
- งานต่อ: เก็บ minimap footage จริง + train ONNX detector เล็ก ๆ →
  validate accuracy บน footage. Control GUI polish + CLAUDE.md update
  (รอ confirm).
