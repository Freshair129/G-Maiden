//! Spike S-1 — Minimap CV feasibility (detect enemy hero icons).
//!
//! Question this spike answers (per TDD §5 / Risk R-02, Engineering-Spec §1 step 2):
//!   Can a *template-matching* minimap detector hit
//!     (a) capture+detect loop  <= 80 ms,
//!     (b) added background CPU  <= 2.5 % at ~6 Hz,
//!     (c) identity match-rate   >= 80 % on realistic (degraded) icons?
//!
//! Strategy (mirrors what the Rust core will do, TDD §5):
//!   1. capture  : grab the minimap bounding box only (here: a region memcpy, the
//!                 cheap part of DXGI duplication — AcquireNextFrame cost is budgeted
//!                 separately at ~30 ms in Spec §1 and is screen-refresh-bound, not CPU).
//!   2. prefilter: O(W*H) "heroness" score (saturation*brightness of the team-ring) +
//!                 grid non-max suppression -> a short candidate list. This is the key
//!                 to staying in budget: we do NOT brute-force NCC over the whole region.
//!   3. match    : grayscale normalized cross-correlation (NCC) of each candidate patch
//!                 against the 10 KNOWN-draft hero templates; best score over threshold wins.
//!
//! Everything is synthetic + deterministic (seeded LCG, no rand crate). The icons are
//! degraded per-frame (fog dimming, additive noise, sub-pixel jitter, partial occlusion)
//! so the >=80% bar is a genuine robustness test of NCC, not a tautology.
//!
//! HONEST SCOPE: synthetic accuracy is *feasibility evidence*, not the real-game gate.
//! Confirming >=80% on real Dota 2 footage needs real frames + real portrait crops
//! (see the printed VERDICT). Latency + CPU numbers, however, are measured on the real
//! production hot-loop and are directly meaningful.

use std::time::Instant;

// ---- minimap / icon geometry (representative of 1080p Dota 2 minimap) ----
const MAP: usize = 256; // minimap bounding box side (px). ~280 at 1080p; 256 = conservative.
const ICON: usize = 20; // hero blip side (px)
const N_HEROES: usize = 10; // a full enemy draft is 5; we template all 10 known heroes.
const TEAM_RING: (f32, f32, f32) = (0.86, 0.16, 0.16); // Dire-red enemy ring (normalized RGB)

// ---- run config ----
const FRAMES: usize = 300; // ~50 s of play at 6 Hz
const HZ: f32 = 6.0;
const MATCH_TOL_PX: i32 = 4; // a detection counts as correct within this radius + correct id
const NCC_THRESHOLD: f32 = 0.55; // accept a candidate->template assignment above this

// ============================ tiny deterministic RNG ============================
struct Lcg(u64);
impl Lcg {
    fn new(seed: u64) -> Self {
        Lcg(seed.wrapping_mul(0x9E3779B97F4A7C15) | 1)
    }
    fn next_u32(&mut self) -> u32 {
        // xorshift* — good enough, fully deterministic, no std rng / no Math.random ban issues
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        ((x.wrapping_mul(0x2545F4914F6CDD1D)) >> 32) as u32
    }
    fn f32(&mut self) -> f32 {
        (self.next_u32() as f32) / (u32::MAX as f32)
    }
    fn range(&mut self, lo: i32, hi: i32) -> i32 {
        lo + (self.next_u32() % ((hi - lo).max(1) as u32)) as i32
    }
    // approx normal via sum of uniforms (central limit), mean 0
    fn gauss(&mut self, sigma: f32) -> f32 {
        let s: f32 = (0..4).map(|_| self.f32()).sum();
        (s - 2.0) * sigma
    }
}

// ============================ image type (RGB f32, 0..1) ============================
#[derive(Clone)]
struct Img {
    w: usize,
    h: usize,
    px: Vec<[f32; 3]>,
}
impl Img {
    fn new(w: usize, h: usize) -> Self {
        Img { w, h, px: vec![[0.0; 3]; w * h] }
    }
    #[inline]
    fn at(&self, x: usize, y: usize) -> [f32; 3] {
        self.px[y * self.w + x]
    }
    #[inline]
    fn set(&mut self, x: usize, y: usize, c: [f32; 3]) {
        self.px[y * self.w + x] = c;
    }
    #[inline]
    fn gray(&self, x: usize, y: usize) -> f32 {
        let c = self.at(x, y);
        0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    }
}

// ============================ hero templates (the known draft) ============================
/// Build N distinct hero icons. Each = team-red ring + unique interior (hue + 2-spot pattern).
/// These double as both the on-screen icons (degraded per frame) and the match templates (clean).
fn build_templates() -> Vec<Img> {
    let mut out = Vec::with_capacity(N_HEROES);
    for h in 0..N_HEROES {
        let mut img = Img::new(ICON, ICON);
        // unique interior hue per hero, spread around the wheel
        let hue = h as f32 / N_HEROES as f32;
        let interior = hsv(hue, 0.75, 0.95);
        let cx = (ICON as f32 - 1.0) / 2.0;
        let cy = cx;
        let r_out = ICON as f32 / 2.0;
        let r_in = r_out - 2.6; // ring thickness ~2.6px
        // two interior accent spots, position keyed to hero index -> distinct silhouettes
        let s1 = ((h * 3) % ICON, (h * 5 + 4) % ICON);
        let s2 = ((h * 7 + 2) % ICON, (h * 2 + 9) % ICON);
        for y in 0..ICON {
            for x in 0..ICON {
                let dx = x as f32 - cx;
                let dy = y as f32 - cy;
                let d = (dx * dx + dy * dy).sqrt();
                if d > r_out {
                    img.set(x, y, [0.05, 0.06, 0.07]); // outside disc = near-bg
                } else if d > r_in {
                    img.set(x, y, [TEAM_RING.0, TEAM_RING.1, TEAM_RING.2]); // enemy ring
                } else {
                    let mut c = interior;
                    let near = |s: (usize, usize)| {
                        let ddx = x as f32 - s.0 as f32;
                        let ddy = y as f32 - s.1 as f32;
                        (ddx * ddx + ddy * ddy).sqrt() < 2.2
                    };
                    if near(s1) || near(s2) {
                        c = [c[0] * 0.35, c[1] * 0.35, c[2] * 0.35]; // dark accent spot
                    }
                    img.set(x, y, c);
                }
            }
        }
        out.push(img);
    }
    out
}

fn hsv(h: f32, s: f32, v: f32) -> [f32; 3] {
    let i = (h * 6.0).floor() as i32 % 6;
    let f = h * 6.0 - (h * 6.0).floor();
    let p = v * (1.0 - s);
    let q = v * (1.0 - f * s);
    let t = v * (1.0 - (1.0 - f) * s);
    match i {
        0 => [v, t, p],
        1 => [q, v, p],
        2 => [p, v, t],
        3 => [p, q, v],
        4 => [t, p, v],
        _ => [v, p, q],
    }
}

// ============================ synthetic minimap frame ============================
struct Placed {
    hero: usize,
    x: i32, // top-left of icon
    y: i32,
}

/// Render one minimap frame: terrain-ish background + creep/ward distractors +
/// `k` enemy hero icons (degraded). Returns (frame, ground-truth placements).
fn render_frame(rng: &mut Lcg, templates: &[Img], k: usize) -> (Img, Vec<Placed>) {
    let mut img = Img::new(MAP, MAP);
    // 1. background: low-saturation green/brown value-noise + faint lane diagonal
    for y in 0..MAP {
        for x in 0..MAP {
            let n = 0.10 + 0.06 * rng.f32();
            let lane = if ((x as i32 - y as i32).abs() % 64) < 5 { 0.04 } else { 0.0 };
            img.set(x, y, [n * 0.5 + lane, n + lane, n * 0.4]);
        }
    }
    // 2. distractors: creep blips (tiny, team-colored but NOT hero-sized), wards, courier
    let n_distract = rng.range(20, 45) as usize;
    for _ in 0..n_distract {
        let x = rng.range(0, MAP as i32 - 3);
        let y = rng.range(0, MAP as i32 - 3);
        let red = rng.f32() > 0.5;
        let c = if red { [0.7, 0.18, 0.18] } else { [0.2, 0.7, 0.3] };
        let sz = rng.range(2, 4) as usize; // 2-3 px: smaller than ICON
        for dy in 0..sz {
            for dx in 0..sz {
                img.set((x as usize + dx).min(MAP - 1), (y as usize + dy).min(MAP - 1), c);
            }
        }
    }
    // 3. enemy hero icons, degraded for realism
    let mut placed = Vec::new();
    let mut attempts = 0;
    while placed.len() < k && attempts < k * 8 {
        attempts += 1;
        let hero = rng.range(0, N_HEROES as i32) as usize;
        let x = rng.range(0, MAP as i32 - ICON as i32);
        let y = rng.range(0, MAP as i32 - ICON as i32);
        // avoid spawning two heroes on the exact same spot (some overlap allowed = occlusion)
        if placed.iter().any(|p: &Placed| (p.x - x).abs() < 6 && (p.y - y).abs() < 6) {
            continue;
        }
        // per-icon degradation
        let dim = 0.55 + 0.45 * rng.f32(); // fog/visibility dimming 0.55..1.0
        let jitter_x = rng.gauss(0.6); // sub-pixel placement -> rounding error
        let jitter_y = rng.gauss(0.6);
        let occlude = rng.f32() < 0.18; // 18% partially covered by an icon-sized shadow
        let tmpl = &templates[hero];
        for ty in 0..ICON {
            for tx in 0..ICON {
                let sx = x + tx as i32 + jitter_x.round() as i32;
                let sy = y + ty as i32 + jitter_y.round() as i32;
                if sx < 0 || sy < 0 || sx >= MAP as i32 || sy >= MAP as i32 {
                    continue;
                }
                if occlude && tx > ICON / 2 {
                    continue; // right half hidden
                }
                let mut c = tmpl.at(tx, ty);
                // additive sensor/compression noise + dim
                for ch in 0..3 {
                    c[ch] = (c[ch] * dim + rng.gauss(0.035)).clamp(0.0, 1.0);
                }
                img.set(sx as usize, sy as usize, c);
            }
        }
        placed.push(Placed { hero, x, y });
    }
    (img, placed)
}

// ============================ template normalization (precomputed once) ============================
struct NormTmpl {
    /// zero-mean grayscale template values
    centered: Vec<f32>,
    /// 1 / sqrt(sum of squares) — precomputed denominator factor
    inv_norm: f32,
}
fn normalize_templates(templates: &[Img]) -> Vec<NormTmpl> {
    templates
        .iter()
        .map(|t| {
            let mut g: Vec<f32> = Vec::with_capacity(ICON * ICON);
            for y in 0..ICON {
                for x in 0..ICON {
                    g.push(t.gray(x, y));
                }
            }
            let mean = g.iter().sum::<f32>() / g.len() as f32;
            let centered: Vec<f32> = g.iter().map(|v| v - mean).collect();
            let ss: f32 = centered.iter().map(|v| v * v).sum();
            NormTmpl { centered, inv_norm: 1.0 / ss.sqrt().max(1e-6) }
        })
        .collect()
}

// ============================ detector ============================
#[derive(Clone, Copy)]
struct Det {
    hero: usize,
    x: i32,
    y: i32,
    score: f32,
}

/// Step 2: prefilter -> candidate top-left coords likely to hold a hero icon.
fn candidates(img: &Img) -> Vec<(i32, i32)> {
    // "heroness" score map: reward the saturated enemy ring color.
    // score = ring-color closeness * brightness, summed in a coarse grid; NMS picks peaks.
    let cell = ICON; // grid cell ~ icon size
    let gw = MAP / cell;
    let gh = MAP / cell;
    let mut grid = vec![0.0f32; gw * gh];
    for y in 0..MAP {
        for x in 0..MAP {
            let c = img.at(x, y);
            // closeness to team-red ring
            let dr = c[0] - TEAM_RING.0;
            let dg = c[1] - TEAM_RING.1;
            let db = c[2] - TEAM_RING.2;
            let ring = (1.0 - (dr * dr + dg * dg + db * db).sqrt()).max(0.0);
            let bright = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
            // MAP isn't always divisible by cell — clamp to last grid cell instead of
            // resizing the grid (off-by-one fix; original hit `grid[len]` when y≥gh*cell).
            let gy = (y / cell).min(gh - 1);
            let gx = (x / cell).min(gw - 1);
            grid[gy * gw + gx] += ring * ring * bright;
        }
    }
    // take cells above a fraction of the max as candidate centers; emit a small 3x3 of
    // top-left offsets around each so a hero straddling a cell boundary is still covered.
    let maxv = grid.iter().cloned().fold(0.0f32, f32::max).max(1e-6);
    let mut out = Vec::new();
    for gy in 0..gh {
        for gx in 0..gw {
            if grid[gy * gw + gx] > 0.18 * maxv {
                let bx = (gx * cell) as i32;
                let by = (gy * cell) as i32;
                for oy in [-(ICON as i32) / 2, 0, (ICON as i32) / 2] {
                    for ox in [-(ICON as i32) / 2, 0, (ICON as i32) / 2] {
                        let x = (bx + ox).clamp(0, (MAP - ICON) as i32);
                        let y = (by + oy).clamp(0, (MAP - ICON) as i32);
                        out.push((x, y));
                    }
                }
            }
        }
    }
    out.sort_unstable();
    out.dedup();
    out
}

/// Step 3: NCC each candidate patch vs every template; keep best assignment > threshold.
/// Then suppress overlapping detections (keep highest score).
fn detect(img: &Img, ntmpls: &[NormTmpl]) -> Vec<Det> {
    let cands = candidates(img);
    let mut raw: Vec<Det> = Vec::new();
    let mut patch = vec![0.0f32; ICON * ICON];
    for (px, py) in cands {
        // extract grayscale patch + its centered/normalized stats (once per candidate)
        let mut sum = 0.0;
        for ty in 0..ICON {
            for tx in 0..ICON {
                let g = img.gray(px as usize + tx, py as usize + ty);
                patch[ty * ICON + tx] = g;
                sum += g;
            }
        }
        let mean = sum / (ICON * ICON) as f32;
        let mut ss = 0.0;
        for v in patch.iter_mut() {
            *v -= mean;
            ss += *v * *v;
        }
        let inv = 1.0 / ss.sqrt().max(1e-6);
        // best template
        let mut best = (-2.0f32, 0usize);
        for (hi, nt) in ntmpls.iter().enumerate() {
            let mut dot = 0.0;
            for i in 0..ICON * ICON {
                dot += patch[i] * nt.centered[i];
            }
            let ncc = dot * inv * nt.inv_norm;
            if ncc > best.0 {
                best = (ncc, hi);
            }
        }
        if best.0 >= NCC_THRESHOLD {
            raw.push(Det { hero: best.1, x: px, y: py, score: best.0 });
        }
    }
    // greedy NMS by score
    raw.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap());
    let mut kept: Vec<Det> = Vec::new();
    for d in raw {
        if kept
            .iter()
            .any(|k| (k.x - d.x).abs() < ICON as i32 / 2 && (k.y - d.y).abs() < ICON as i32 / 2)
        {
            continue;
        }
        kept.push(d);
    }
    kept
}

/// Reference: naive full-region brute-force NCC of ONE template (no prefilter).
/// Measured only to justify *why* the prefilter is required — not the production path.
fn brute_one_template(img: &Img, nt: &NormTmpl) -> f32 {
    let mut best = -2.0f32;
    for py in 0..=(MAP - ICON) {
        for px in 0..=(MAP - ICON) {
            let mut sum = 0.0;
            for ty in 0..ICON {
                for tx in 0..ICON {
                    sum += img.gray(px + tx, py + ty);
                }
            }
            let mean = sum / (ICON * ICON) as f32;
            let mut dot = 0.0;
            let mut ss = 0.0;
            for ty in 0..ICON {
                for tx in 0..ICON {
                    let v = img.gray(px + tx, py + ty) - mean;
                    ss += v * v;
                    dot += v * nt.centered[ty * ICON + tx];
                }
            }
            let ncc = dot * (1.0 / ss.sqrt().max(1e-6)) * nt.inv_norm;
            if ncc > best {
                best = ncc;
            }
        }
    }
    best
}

// ============================ scoring ============================
fn score_frame(dets: &[Det], truth: &[Placed]) -> (usize, usize, usize) {
    // returns (true_positives, false_positives, n_truth)
    let mut used = vec![false; truth.len()];
    let mut tp = 0;
    let mut fp = 0;
    for d in dets {
        let mut hit = None;
        for (i, t) in truth.iter().enumerate() {
            if used[i] {
                continue;
            }
            if t.hero == d.hero
                && (t.x - d.x).abs() <= MATCH_TOL_PX
                && (t.y - d.y).abs() <= MATCH_TOL_PX
            {
                hit = Some(i);
                break;
            }
        }
        match hit {
            Some(i) => {
                used[i] = true;
                tp += 1;
            }
            None => fp += 1,
        }
    }
    (tp, fp, truth.len())
}

fn percentile(sorted_us: &[f32], p: f32) -> f32 {
    if sorted_us.is_empty() {
        return 0.0;
    }
    let idx = ((p / 100.0) * (sorted_us.len() - 1) as f32).round() as usize;
    sorted_us[idx]
}

fn main() {
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    let templates = build_templates();
    let ntmpls = normalize_templates(&templates);

    println!("=== Spike S-1: Minimap CV feasibility (template matching) ===");
    println!(
        "config: minimap {MAP}x{MAP}px, icon {ICON}x{ICON}px, {N_HEROES} known templates, \
         {FRAMES} frames @ {HZ} Hz, NCC thr {NCC_THRESHOLD}, tol {MATCH_TOL_PX}px"
    );
    println!("host cores (available_parallelism): {cores}\n");

    let mut rng = Lcg::new(0xD074_2026);

    // ---- warmup (avoid first-frame alloc/cache effects skewing p50) ----
    for _ in 0..10 {
        let (f, _) = render_frame(&mut rng, &templates, 5);
        let _ = detect(&f, &ntmpls);
    }

    let mut lat_us: Vec<f32> = Vec::with_capacity(FRAMES);
    let mut cap_us: Vec<f32> = Vec::with_capacity(FRAMES);
    let mut tot_tp = 0;
    let mut tot_fp = 0;
    let mut tot_truth = 0;
    let mut total_detect_secs = 0.0f64;

    for _ in 0..FRAMES {
        let k = rng.range(3, 6) as usize; // 3-5 enemies currently on minimap
        let (frame, truth) = render_frame(&mut rng, &templates, k);

        // step 1: representative capture cost = region copy out of the duplicated surface
        let t_cap = Instant::now();
        let _copied = frame.px.clone(); // BGRA region memcpy analogue
        cap_us.push(t_cap.elapsed().as_secs_f64() as f32 * 1e6);

        // steps 2+3: prefilter + NCC match
        let t0 = Instant::now();
        let dets = detect(&frame, &ntmpls);
        let dt = t0.elapsed().as_secs_f64();
        total_detect_secs += dt;
        lat_us.push(dt as f32 * 1e6);

        let (tp, fp, n) = score_frame(&dets, &truth);
        tot_tp += tp;
        tot_fp += fp;
        tot_truth += n;
    }

    lat_us.sort_by(|a, b| a.partial_cmp(b).unwrap());
    cap_us.sort_by(|a, b| a.partial_cmp(b).unwrap());

    let p50 = percentile(&lat_us, 50.0);
    let p95 = percentile(&lat_us, 95.0);
    let pmax = *lat_us.last().unwrap();
    let cap_p50 = percentile(&cap_us, 50.0);
    let loop_p50_ms = (p50 + cap_p50) / 1000.0;
    let loop_p95_ms = (p95 + percentile(&cap_us, 95.0)) / 1000.0;

    let recall = tot_tp as f32 / tot_truth.max(1) as f32; // identity match-rate (the >=80% metric)
    let precision = tot_tp as f32 / (tot_tp + tot_fp).max(1) as f32;

    // CPU @ HZ: single-thread occupancy = avg detect time / frame period.
    let avg_detect_s = total_detect_secs / FRAMES as f64;
    let period_s = 1.0 / HZ as f64;
    let occ_1core = avg_detect_s / period_s; // fraction of ONE core
    let cpu_system = occ_1core / cores as f64 * 100.0; // % of total machine CPU

    // ---- reference brute force (one template, no prefilter) ----
    let (bf_frame, _) = render_frame(&mut rng, &templates, 5);
    let t = Instant::now();
    let _ = brute_one_template(&bf_frame, &ntmpls[0]);
    let bf_ms = t.elapsed().as_secs_f64() * 1000.0;
    let bf_all_ms = bf_ms * N_HEROES as f64; // all 10 templates, still no prefilter

    println!("--- LATENCY (capture region-copy + detect) ---");
    println!("  capture copy   p50 : {:.3} ms", cap_p50 / 1000.0);
    println!("  detect         p50 : {:.3} ms", p50 / 1000.0);
    println!("  detect         p95 : {:.3} ms", p95 / 1000.0);
    println!("  detect         max : {:.3} ms", pmax / 1000.0);
    println!("  LOOP (cap+detect) p50: {:.3} ms   p95: {:.3} ms   [GATE <= 80 ms]", loop_p50_ms, loop_p95_ms);
    println!();
    println!("--- ACCURACY (synthetic, degraded icons) ---");
    println!("  enemies placed     : {tot_truth}");
    println!("  correct id+pos (TP): {tot_tp}");
    println!("  false positives    : {tot_fp}");
    println!("  identity match-rate: {:.1} %   [GATE >= 80 %]", recall * 100.0);
    println!("  precision          : {:.1} %", precision * 100.0);
    println!();
    println!("--- CPU @ {HZ} Hz ---");
    println!("  avg detect / frame : {:.3} ms", avg_detect_s * 1000.0);
    println!("  single-core occ    : {:.3} %", occ_1core * 100.0);
    println!("  system CPU ({cores} cores): {:.3} %   [GATE <= 2.5 %]", cpu_system);
    println!();
    println!("--- REFERENCE: naive full-region NCC (why prefilter is required) ---");
    println!("  brute 1 template   : {:.1} ms", bf_ms);
    println!("  brute 10 templates : {:.1} ms  (would blow the 80 ms gate)", bf_all_ms);
    println!();

    let pass_lat = loop_p95_ms <= 80.0;
    let pass_acc = recall >= 0.80;
    let pass_cpu = cpu_system <= 2.5;
    println!("--- GATES ---");
    println!("  [{}] capture+detect loop <= 80 ms", chk(pass_lat));
    println!("  [{}] identity match-rate >= 80 % (SYNTHETIC proxy)", chk(pass_acc));
    println!("  [{}] system CPU @ ~6 Hz <= 2.5 %", chk(pass_cpu));
    println!();
    println!("VERDICT: template matching is {} for the latency + CPU gates.", if pass_lat && pass_cpu { "FEASIBLE" } else { "AT RISK" });
    println!("         Accuracy here is a SYNTHETIC proxy ({:.1}%). The real-game >=80%% gate", recall * 100.0);
    println!("         still needs: (1) real Dota 2 minimap captures, (2) real hero portrait");
    println!("         crops as templates, (3) re-run accuracy on that set. Latency headroom");
    println!("         means escalating to a small ONNX detector (TDD §5) is affordable if");
    println!("         real-footage accuracy falls short.");

    // non-zero exit if a *measurable* (non-synthetic-accuracy) gate fails, for CI use.
    if !(pass_lat && pass_cpu) {
        std::process::exit(1);
    }
}

fn chk(b: bool) -> &'static str {
    if b {
        "PASS"
    } else {
        "FAIL"
    }
}
