# Spike S-1 â€” Minimap CV feasibility (detect enemy hero icons)

> à¸›à¸£à¸°à¹€à¸ à¸—: spike | phase: spike | model: opus
> Source-of-truth à¸—à¸µà¹ˆà¸­à¹ˆà¸²à¸™ (scope à¸—à¸µà¹ˆ parent à¸­à¸™à¸¸à¸à¸²à¸•): `docs/architecture/engineering-spec.md` Â§1, `docs/architecture/technical-design-document.md` Â§5 + Risk R-02.
> Artifact à¸—à¸µà¹ˆà¸£à¸±à¸™à¹„à¸”à¹‰: `spikes/s1-minimap-cv/` (Rust = production-representative; `node-equiv.mjs` = executable equivalent).

## 1. à¸„à¸³à¸–à¸²à¸¡à¸‚à¸­à¸‡ spike (acceptance gates)

| Gate | à¹€à¸à¸“à¸‘à¹Œ | à¸—à¸µà¹ˆà¸¡à¸² |
| --- | --- | --- |
| **G-LAT** | capture+detect loop â‰¤ **80 ms** | task acceptance / Spec Â§1 (detect budget 50ms, capture 30ms) |
| **G-CPU** | background CPU à¹€à¸žà¸´à¹ˆà¸¡ â‰¤ **2.5 %** à¸—à¸µà¹ˆ ~**6 Hz** | task / SRS NFR / TDD R-02 |
| **G-ACC** | template match à¹à¸¡à¹ˆà¸™ â‰¥ **80 %** à¸šà¸™ **à¹€à¸à¸¡à¸ˆà¸£à¸´à¸‡** | task acceptance |

à¸§à¸´à¸˜à¸µà¸‚à¸­à¸‡ spike à¸ªà¸°à¸—à¹‰à¸­à¸™ TDD Â§5: à¹ƒà¸Šà¹‰ **template matching** à¸à¹ˆà¸­à¸™ (imageproc NCC), à¸¢à¸à¹€à¸›à¹‡à¸™ ONNX detector à¸ à¸²à¸¢à¸«à¸¥à¸±à¸‡à¸–à¹‰à¸²à¹à¸¡à¹ˆà¸™à¹„à¸¡à¹ˆà¸žà¸­.

## 2. à¸à¸²à¸£à¸­à¸­à¸à¹à¸šà¸š PoC (production-shaped)

à¸—à¸³à¸•à¸²à¸¡ pipeline à¸—à¸µà¹ˆ Rust core à¸ˆà¸°à¹ƒà¸Šà¹‰à¸ˆà¸£à¸´à¸‡ (TDD Â§5), **à¹„à¸¡à¹ˆ** brute-force NCC à¸—à¸±à¹‰à¸‡ region:

1. **capture** â€” à¸„à¸±à¸”à¹€à¸‰à¸žà¸²à¸° bounding box à¸‚à¸­à¸‡ minimap (PoC: region memcpy = à¸ªà¹ˆà¸§à¸™à¸–à¸¹à¸à¸‚à¸­à¸‡ DXGI duplication; à¸„à¹ˆà¸² `AcquireNextFrame` à¸–à¸¹à¸ budget à¹à¸¢à¸ ~30ms à¹ƒà¸™ Spec Â§1 à¹à¸¥à¸°à¹€à¸›à¹‡à¸™ refresh-bound à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ CPU).
2. **prefilter** â€” à¸ªà¹à¸à¸™ O(WÂ·H) à¸„à¸´à¸”à¸„à¸°à¹à¸™à¸™ "heroness" à¸ˆà¸²à¸à¸ªà¸µà¸§à¸‡ **team-ring (Dire-red)** Ã— à¸„à¸§à¸²à¸¡à¸ªà¸§à¹ˆà¸²à¸‡ à¹à¸¥à¹‰à¸§à¸—à¸³ grid non-max suppression â†’ à¹„à¸”à¹‰ candidate list à¸ªà¸±à¹‰à¸™ à¹† (~30â€“80 à¸ˆà¸¸à¸”). à¸™à¸µà¹ˆà¸„à¸·à¸­à¸à¸¸à¸à¹à¸ˆà¸—à¸µà¹ˆà¸—à¸³à¹ƒà¸«à¹‰à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™ budget.
3. **match** â€” grayscale **NCC** (normalized cross-correlation) à¸‚à¸­à¸‡à¹à¸•à¹ˆà¸¥à¸° candidate patch à¹€à¸—à¸µà¸¢à¸š template à¸®à¸µà¹‚à¸£à¹ˆà¸—à¸µà¹ˆà¸£à¸¹à¹‰à¸ˆà¸²à¸ draft à¸—à¸±à¹‰à¸‡ 10 à¸•à¸±à¸§; à¸„à¸°à¹à¸™à¸™à¸ªà¸¹à¸‡à¸ªà¸¸à¸”à¹€à¸à¸´à¸™ threshold (0.55) = à¹€à¸ˆà¸­; à¹à¸¥à¹‰à¸§ NMS à¸—à¸±à¸šà¸‹à¹‰à¸­à¸™.

à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸—à¸”à¸ªà¸­à¸šà¹€à¸›à¹‡à¸™ **synthetic + deterministic** (seeded xorshift\*, à¹„à¸¡à¹ˆà¸¡à¸µ rng crate): minimap 256Ã—256, icon 20Ã—20, à¸§à¸²à¸‡à¸¨à¸±à¸•à¸£à¸¹ 3â€“5 à¸•à¸±à¸§/à¹€à¸Ÿà¸£à¸¡ à¸žà¸£à¹‰à¸­à¸¡ **degradation à¸ˆà¸£à¸´à¸‡** â€” fog dimming (0.55â€“1.0), additive noise (Ïƒ=0.035), sub-pixel jitter (Ïƒ=0.6px), partial occlusion 18% â€” à¸šà¸§à¸ distractor (creep/ward blips) à¹€à¸žà¸·à¹ˆà¸­à¸§à¸±à¸” false-positive. à¸”à¸±à¸‡à¸™à¸±à¹‰à¸™à¸šà¸²à¸£à¹Œ 80% à¹€à¸›à¹‡à¸™à¸à¸²à¸£à¸—à¸”à¸ªà¸­à¸šà¸„à¸§à¸²à¸¡à¸—à¸™à¸‚à¸­à¸‡ NCC à¸ˆà¸£à¸´à¸‡ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸‚à¸­à¸‡à¸•à¸²à¸¢.

## 3. à¸œà¸¥à¸¥à¸±à¸žà¸˜à¹Œ

### 3.1 à¸ªà¸–à¸²à¸™à¸°à¸à¸²à¸£à¸£à¸±à¸™à¹ƒà¸™à¸ªà¸ à¸²à¸žà¹à¸§à¸”à¸¥à¹‰à¸­à¸¡à¸™à¸µà¹‰

**à¸­à¸±à¸›à¹€à¸”à¸• 2026-06-21 (turn 14)**: à¸£à¸±à¸™ harness à¹€à¸Šà¸´à¸‡à¸›à¸£à¸°à¸ˆà¸±à¸à¸©à¹Œà¸—à¸±à¹‰à¸‡ Rust + Node à¹à¸¥à¹‰à¸§
à¸šà¸™à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡ dev (12 cores). à¸•à¸±à¸§à¹€à¸¥à¸‚à¸‚à¹‰à¸²à¸‡à¸¥à¹ˆà¸²à¸‡ = **empirical** (replace
analytical estimate à¹€à¸”à¸´à¸¡). à¸žà¸š + à¹à¸à¹‰ **bug 2 à¸•à¸±à¸§** à¸—à¸µà¹ˆà¸—à¸³à¹ƒà¸«à¹‰ harness à¹„à¸¡à¹ˆ
compile/runtime panic à¸à¹ˆà¸­à¸™ â€” à¸ªà¸²à¹€à¸«à¸•à¸¸à¸—à¸µà¹ˆ worker à¹€à¸”à¸´à¸¡à¸£à¸±à¸™à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¹à¸„à¹ˆ sandbox
gate.

| Bug | à¸—à¸µà¹ˆà¹„à¸«à¸™ | à¹à¸à¹‰ |
|-----|--------|-----|
| `f32 / usize` compile error | main.rs:493 | cast `as f32` |
| index OOB à¸—à¸µà¹ˆ grid prefilter | main.rs:282 | clamp `y/cell` â‰¤ `gh-1` (MAP/cell à¹„à¸¡à¹ˆà¸«à¸²à¸£ à¸žà¸­à¸”à¸µ) |

### 3.2 G-LAT (latency) â€” **PASS (empirical), headroom à¹€à¸«à¸¥à¸·à¸­à¹€à¸Ÿà¸·à¸­**

à¸§à¸±à¸”à¸ˆà¸²à¸ 300 frames @ 6 Hz, MAP=256, ICON=20, 10 templates:

| Metric | Rust release | Node (upper bound) |
|--------|--------------|---------------------|
| capture region-copy p50 | 0.060 ms | (same â€” region memcpy) |
| **detect p50** | **0.792 ms** | 2.533 ms |
| detect p95 | 2.086 ms | 7.797 ms |
| **LOOP (cap+detect) p50** | **0.852 ms** | 3.322 ms |
| LOOP p95 | 2.291 ms | 9.428 ms |

Estimate à¹€à¸”à¸´à¸¡ ~0.7 ms (Rust) à¹ƒà¸à¸¥à¹‰à¹€à¸„à¸µà¸¢à¸‡à¸ˆà¸£à¸´à¸‡ ~0.79 ms. **gate 80 ms à¸œà¹ˆà¸²à¸™à¸ªà¸šà¸²à¸¢ ~100x headroom.**

### 3.3 G-CPU (CPU @ 6 Hz) â€” **PASS (empirical)**

| | Rust | Node |
|---|---|---|
| avg detect / frame | 1.067 ms | 4.859 ms |
| single-core occupancy | 0.640 % | 2.915 % |
| **system CPU (12 cores)** | **0.053 %** | 0.243 % |

gate â‰¤ 2.5 % system CPU â€” **à¸œà¹ˆà¸²à¸™ ~50x margin**. à¸ªà¸­à¸”à¸„à¸¥à¹‰à¸­à¸‡à¸à¸¥à¸¢à¸¸à¸—à¸˜à¹Œ R-02.

### 3.4 G-ACC (accuracy) â€” **FAIL à¸šà¸™ synthetic à¹€à¸­à¸‡ (10.2 %)** âš ï¸

**Estimate à¹€à¸”à¸´à¸¡ "à¸™à¹ˆà¸²à¸ˆà¸° > 80%" à¸–à¸¹à¸à¸«à¸±à¸à¸¥à¹‰à¸²à¸‡à¸”à¹‰à¸§à¸¢à¸•à¸±à¸§à¹€à¸¥à¸‚à¸ˆà¸£à¸´à¸‡:**

| Metric | Rust | Node |
|--------|------|------|
| enemies placed | 1,208 | 1,208 |
| correct id+pos (TP) | 123 | 120 |
| false positives | 309 | 307 |
| **identity match-rate** | **10.2 %** | 9.9 % |
| precision | 28.5 % | 28.1 % |

à¸•à¸±à¸§à¹€à¸¥à¸‚à¸ªà¸­à¸‡à¸£à¸±à¸™à¸ªà¸­à¸”à¸„à¸¥à¹‰à¸­à¸‡ (~0.3% drift) â†’ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ noise à¸à¸²à¸£à¸§à¸±à¸”, à¸­à¸±à¸¥à¸à¸­à¸£à¸´à¸—à¸¶à¸¡à¸ˆà¸£à¸´à¸‡ à¹†
à¹„à¸¡à¹ˆà¸—à¸™ degradation profile (fog 0.55â€“1.0 + noise Ïƒ=0.035 + jitter Ïƒ=0.6px +
occlusion 18% + distractors). NCC normalize à¸„à¸£à¸­à¸š brightness à¹„à¸”à¹‰ à¹à¸•à¹ˆ noise +
occlusion à¸—à¸³à¹ƒà¸«à¹‰ similarity score à¸•à¸à¸¥à¸‡à¸•à¹ˆà¸³à¸à¸§à¹ˆà¸² threshold 0.55 à¸šà¹ˆà¸­à¸¢à¸ˆà¸™ TP
à¸«à¸²à¸¢ à¹à¸¥à¸° distractors à¸—à¸³ FP à¸‚à¸¶à¹‰à¸™à¸ªà¸¹à¸‡.

**Implication**: ONNX detector à¸¢à¸à¸£à¸°à¸”à¸±à¸š (TDD Â§5) **à¸™à¹ˆà¸²à¸ˆà¸°à¹€à¸›à¹‡à¸™à¸‚à¹‰à¸­à¸šà¸±à¸‡à¸„à¸±à¸š à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ
optional** â€” à¹à¸¡à¹‰à¸à¸£à¸°à¸—à¸±à¹ˆà¸‡à¸šà¸™ synthetic à¸à¹‡à¹„à¸¡à¹ˆà¸œà¹ˆà¸²à¸™ 80%, real-game à¸ˆà¸°à¹à¸¢à¹ˆà¸à¸§à¹ˆà¸².
latency headroom ~100x à¸£à¸­à¸‡à¸£à¸±à¸š ONNX small à¹€à¸žà¸µà¸¢à¸š.

### 3.5 Reference â€” à¸—à¸³à¹„à¸¡ prefilter à¸ˆà¸³à¹€à¸›à¹‡à¸™

| | Rust | Node |
|---|---|---|
| brute 1 template (full NCC region scan) | 30.5 ms | 373.9 ms |
| brute 10 templates | **305.3 ms** | 3,739 ms |

305 ms > 80 ms gate â†’ **prefilter à¸ˆà¸³à¹€à¸›à¹‡à¸™ 100%**. à¸¢à¸·à¸™à¸¢à¸±à¸™à¸§à¹ˆà¸²à¸à¸²à¸£à¸­à¸­à¸à¹à¸šà¸š
candidate-list pipeline (TDD Â§5) à¹€à¸›à¹‡à¸™à¸–à¸¹à¸à¸—à¸²à¸‡.

## 4. BLOCKED / à¸•à¹‰à¸­à¸‡ escalate (à¸ªà¸´à¹ˆà¸‡à¸—à¸µà¹ˆà¸›à¸´à¸”à¹ƒà¸™à¸™à¸µà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰)

1. **G-ACC à¸šà¸™à¹€à¸à¸¡à¸ˆà¸£à¸´à¸‡à¸¢à¸±à¸‡à¸žà¸´à¸ªà¸¹à¸ˆà¸™à¹Œà¹„à¸¡à¹ˆà¹„à¸”à¹‰ â€” à¸‚à¸²à¸” resource:**
   - (a) à¹€à¸Ÿà¸£à¸¡ minimap à¸ˆà¸²à¸ Dota 2 à¸ˆà¸£à¸´à¸‡ (à¸«à¸¥à¸²à¸¢ resolution/HUD scale, à¸¡à¸µ/à¹„à¸¡à¹ˆà¸¡à¸µ fog) à¸žà¸£à¹‰à¸­à¸¡ ground-truth à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸¨à¸±à¸•à¸£à¸¹.
   - (b) à¸ à¸²à¸ž portrait à¸®à¸µà¹‚à¸£à¹ˆà¸ˆà¸£à¸´à¸‡ crop à¹€à¸›à¹‡à¸™ template (à¸£à¸²à¸¢à¸Šà¸·à¹ˆà¸­à¸ˆà¸²à¸ draft/GSI).
   - (c) à¸£à¸±à¸™ accuracy à¸šà¸™à¸Šà¸¸à¸”à¸™à¸±à¹‰à¸™ â†’ à¸¢à¸·à¸™à¸¢à¸±à¸™ â‰¥80% à¸«à¸£à¸·à¸­ trigger à¸¢à¸à¸£à¸°à¸”à¸±à¸šà¹€à¸›à¹‡à¸™ ONNX (TDD Â§5; latency headroom à¸£à¸­à¸‡à¸£à¸±à¸šà¹„à¸”à¹‰).
2. **à¸£à¸±à¸™ harness à¹€à¸Šà¸´à¸‡à¸›à¸£à¸°à¸ˆà¸±à¸à¸©à¹Œà¹ƒà¸™à¸™à¸µà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰** â€” `cargo`/`node` à¸–à¸¹à¸ gate. à¸•à¸±à¸§à¹€à¸¥à¸‚ Â§3 à¹€à¸›à¹‡à¸™ analytical estimate; à¸£à¸±à¸™à¸•à¸²à¸¡ Â§5 à¹€à¸žà¸·à¹ˆà¸­à¹à¸—à¸™à¸—à¸µà¹ˆà¸”à¹‰à¸§à¸¢à¸„à¹ˆà¸²à¸—à¸µà¹ˆà¸§à¸±à¸”à¸ˆà¸£à¸´à¸‡.

## 5. à¸§à¸´à¸˜à¸µà¸£à¸±à¸™ (à¸¢à¸·à¸™à¸¢à¸±à¸™à¸•à¸±à¸§à¹€à¸¥à¸‚ â€” à¸„à¸³à¸ªà¸±à¹ˆà¸‡à¹€à¸”à¸µà¸¢à¸§)

```bash
# production-representative (Rust): à¸žà¸´à¸¡à¸žà¹Œ GATES + exit code != 0 à¸–à¹‰à¸² latency/CPU à¸•à¸ (à¹ƒà¸Šà¹‰à¹ƒà¸™ CI)
cargo run --release --manifest-path spikes/s1-minimap-cv/Cargo.toml

# executable equivalent (Node): à¸­à¸±à¸¥à¸à¸­à¸£à¸´à¸—à¸¶à¸¡ + seed à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™; latency = upper bound
node spikes/s1-minimap-cv/node-equiv.mjs
```

à¸—à¸±à¹‰à¸‡à¸ªà¸­à¸‡à¸žà¸´à¸¡à¸žà¹Œ: latency p50/p95 (cap+detect), accuracy (TP/FP/match-rate/precision), CPU @6Hz, à¹à¸¥à¸° reference **brute-force NCC** (~à¸«à¸¥à¸²à¸¢à¸£à¹‰à¸­à¸¢ ms) à¸—à¸µà¹ˆà¸žà¸´à¸ªà¸¹à¸ˆà¸™à¹Œà¸§à¹ˆà¸² prefilter à¸ˆà¸³à¹€à¸›à¹‡à¸™.

## 6. à¸ªà¸£à¸¸à¸› (verdict â€” empirical, post turn-14)

- **G-LAT + G-CPU: PASS empirical** (Rust loop 0.85 ms p50 / 0.053% CPU @ 6 Hz)
  â€” template matching + color-prefilter à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¸„à¸­à¸‚à¸§à¸”à¹€à¸¥à¸¢, headroom ~100x.
- **G-ACC: FAIL à¸šà¸™ synthetic à¹€à¸­à¸‡ (10.2 %)** â€” estimate "à¸™à¹ˆà¸²à¸ˆà¸° > 80%" à¸–à¸¹à¸
  à¸•à¸±à¸§à¹€à¸¥à¸‚à¸ˆà¸£à¸´à¸‡à¸«à¸±à¸à¸¥à¹‰à¸²à¸‡. NCC à¹„à¸¡à¹ˆà¸—à¸™ noise + occlusion + distractors profile à¸—à¸µà¹ˆ
  à¹ƒà¸Šà¹‰à¸—à¸”à¸ªà¸­à¸š. real-game à¸ˆà¸°à¹„à¸¡à¹ˆà¸œà¹ˆà¸²à¸™à¸¢à¸´à¹ˆà¸‡à¸à¸§à¹ˆà¸².
- **à¹à¸™à¸°à¸™à¸³à¹ƒà¸«à¸¡à¹ˆ (update à¸ˆà¸²à¸ turn-14):**
  1. ONNX detector **à¸ˆà¸³à¹€à¸›à¹‡à¸™** à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ "à¸–à¹‰à¸²à¹„à¸¡à¹ˆà¸œà¹ˆà¸²à¸™à¸„à¹ˆà¸­à¸¢à¸¢à¸" â€” synthetic à¸à¹‡à¹„à¸¡à¹ˆà¸œà¹ˆà¸²à¸™à¹à¸¥à¹‰à¸§.
     latency headroom 100x à¹€à¸«à¸¥à¸·à¸­à¹€à¸Ÿà¸·à¸­.
  2. à¸„à¸‡à¹‚à¸„à¸£à¸‡à¸ªà¸£à¹‰à¸²à¸‡ pipeline à¹€à¸”à¸´à¸¡ (capture â†’ prefilter â†’ match) â€” à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¹à¸„à¹ˆà¸‚à¸±à¹‰à¸™
     match: NCC â†’ ONNX inference (small CNN backbone, e.g., MobileNetV3
     classification head). prefilter à¸¢à¸±à¸‡à¸à¸³à¸ˆà¸±à¸” most-of-frame à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ tradeoff.
  3. real-game footage à¸¢à¸±à¸‡à¸ˆà¸³à¹€à¸›à¹‡à¸™à¹€à¸žà¸·à¹ˆà¸­ **train + validate** ONNX (à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¹à¸„à¹ˆ
     measure NCC accuracy). à¸”à¸¹ Â§4.1.
- à¸¥à¸” priority à¸‚à¸­à¸‡ template-matching default path à¹ƒà¸™ ADR-05 â†’ à¸—à¸³à¹€à¸›à¹‡à¸™ **fallback**
  à¹€à¸¡à¸·à¹ˆà¸­ ONNX à¹„à¸¡à¹ˆà¸žà¸£à¹‰à¸­à¸¡ / load failure.


