// Spike S-1 — Node.js equivalent of src/main.rs (identical algorithm + same deterministic
// seed) so the spike is EXECUTABLE in this environment (cargo is gated here).
//
// Why this is valid evidence:
//   * ACCURACY is algorithm-determined and language-independent -> the match-rate here is
//     exactly what the Rust path produces on the same synthetic data.
//   * LATENCY in JS is a CONSERVATIVE UPPER BOUND. The production path is Rust
//     (imageproc NCC); Rust is materially faster. If JS clears 80 ms, Rust clears it
//     comfortably. Treat the Rust crate (src/main.rs) as the authoritative latency artifact.
//
// Run:  node node-equiv.mjs

const MAP = 256, ICON = 20, N_HEROES = 10;
const TEAM_RING = [0.86, 0.16, 0.16];
const FRAMES = 300, HZ = 6.0, MATCH_TOL_PX = 4, NCC_THRESHOLD = 0.55;

// ---- deterministic xorshift* (mirrors Rust Lcg) ----
class Lcg {
  constructor(seed) { this.s = (BigInt(seed) * 0x9E3779B97F4A7C15n | 1n) & 0xFFFFFFFFFFFFFFFFn; }
  nextU32() {
    let x = this.s;
    x ^= x >> 12n; x &= 0xFFFFFFFFFFFFFFFFn;
    x ^= (x << 25n) & 0xFFFFFFFFFFFFFFFFn;
    x ^= x >> 27n;
    this.s = x;
    return Number((x * 0x2545F4914F6CDD1Dn >> 32n) & 0xFFFFFFFFn);
  }
  f32() { return this.nextU32() / 0xFFFFFFFF; }
  range(lo, hi) { return lo + (this.nextU32() % Math.max(1, hi - lo)); }
  gauss(sigma) { let s = 0; for (let i = 0; i < 4; i++) s += this.f32(); return (s - 2.0) * sigma; }
}

function hsv(h, s, v) {
  const i = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6);
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i];
}

// image: Float32Array length w*h*3
function gray(img, w, x, y) {
  const o = (y * w + x) * 3;
  return 0.299 * img[o] + 0.587 * img[o+1] + 0.114 * img[o+2];
}

function buildTemplates() {
  const out = [];
  for (let h = 0; h < N_HEROES; h++) {
    const img = new Float32Array(ICON * ICON * 3);
    const hue = h / N_HEROES, interior = hsv(hue, 0.75, 0.95);
    const c = (ICON - 1) / 2, rOut = ICON / 2, rIn = rOut - 2.6;
    const s1 = [(h*3)%ICON, (h*5+4)%ICON], s2 = [(h*7+2)%ICON, (h*2+9)%ICON];
    for (let y = 0; y < ICON; y++) for (let x = 0; x < ICON; x++) {
      const dx = x - c, dy = y - c, d = Math.sqrt(dx*dx+dy*dy), o = (y*ICON+x)*3;
      let col;
      if (d > rOut) col = [0.05,0.06,0.07];
      else if (d > rIn) col = TEAM_RING.slice();
      else {
        col = interior.slice();
        const near = s => Math.sqrt((x-s[0])**2 + (y-s[1])**2) < 2.2;
        if (near(s1) || near(s2)) col = [col[0]*0.35, col[1]*0.35, col[2]*0.35];
      }
      img[o]=col[0]; img[o+1]=col[1]; img[o+2]=col[2];
    }
    out.push(img);
  }
  return out;
}

function renderFrame(rng, templates, k) {
  const img = new Float32Array(MAP * MAP * 3);
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const n = 0.10 + 0.06 * rng.f32();
    const lane = (Math.abs(x - y) % 64) < 5 ? 0.04 : 0.0;
    const o = (y*MAP+x)*3;
    img[o]=n*0.5+lane; img[o+1]=n+lane; img[o+2]=n*0.4;
  }
  const nDistract = rng.range(20, 45);
  for (let i = 0; i < nDistract; i++) {
    const x = rng.range(0, MAP-3), y = rng.range(0, MAP-3);
    const red = rng.f32() > 0.5, col = red ? [0.7,0.18,0.18] : [0.2,0.7,0.3];
    const sz = rng.range(2, 4);
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) {
      const o = (Math.min(y+dy,MAP-1)*MAP + Math.min(x+dx,MAP-1))*3;
      img[o]=col[0]; img[o+1]=col[1]; img[o+2]=col[2];
    }
  }
  const placed = [];
  let attempts = 0;
  while (placed.length < k && attempts < k*8) {
    attempts++;
    const hero = rng.range(0, N_HEROES);
    const x = rng.range(0, MAP-ICON), y = rng.range(0, MAP-ICON);
    if (placed.some(p => Math.abs(p.x-x)<6 && Math.abs(p.y-y)<6)) continue;
    const dim = 0.55 + 0.45*rng.f32();
    const jx = Math.round(rng.gauss(0.6)), jy = Math.round(rng.gauss(0.6));
    const occlude = rng.f32() < 0.18;
    const t = templates[hero];
    for (let ty = 0; ty < ICON; ty++) for (let tx = 0; tx < ICON; tx++) {
      const sx = x+tx+jx, sy = y+ty+jy;
      if (sx<0||sy<0||sx>=MAP||sy>=MAP) continue;
      if (occlude && tx > ICON/2) continue;
      const to = (ty*ICON+tx)*3, oo = (sy*MAP+sx)*3;
      for (let ch = 0; ch < 3; ch++)
        img[oo+ch] = Math.min(1, Math.max(0, t[to+ch]*dim + rng.gauss(0.035)));
    }
    placed.push({hero, x, y});
  }
  return {img, placed};
}

function normalizeTemplates(templates) {
  return templates.map(t => {
    const g = new Float32Array(ICON*ICON);
    let sum = 0;
    for (let y = 0; y < ICON; y++) for (let x = 0; x < ICON; x++) {
      const v = gray(t, ICON, x, y); g[y*ICON+x] = v; sum += v;
    }
    const mean = sum / g.length;
    let ss = 0;
    for (let i = 0; i < g.length; i++) { g[i] -= mean; ss += g[i]*g[i]; }
    return {centered: g, invNorm: 1/Math.max(1e-6, Math.sqrt(ss))};
  });
}

function candidates(img) {
  const cell = ICON, gw = (MAP/cell|0), gh = (MAP/cell|0);
  const grid = new Float32Array(gw*gh);
  for (let y = 0; y < MAP; y++) for (let x = 0; x < MAP; x++) {
    const o = (y*MAP+x)*3;
    const dr = img[o]-TEAM_RING[0], dg = img[o+1]-TEAM_RING[1], db = img[o+2]-TEAM_RING[2];
    const ring = Math.max(0, 1 - Math.sqrt(dr*dr+dg*dg+db*db));
    const bright = 0.299*img[o]+0.587*img[o+1]+0.114*img[o+2];
    grid[((y/cell|0))*gw + (x/cell|0)] += ring*ring*bright;
  }
  let maxv = 1e-6; for (const v of grid) if (v > maxv) maxv = v;
  const out = new Set();
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    if (grid[gy*gw+gx] > 0.18*maxv) {
      const bx = gx*cell, by = gy*cell;
      for (const oy of [-(ICON>>1),0,(ICON>>1)]) for (const ox of [-(ICON>>1),0,(ICON>>1)]) {
        const x = Math.min(Math.max(0, bx+ox), MAP-ICON);
        const y = Math.min(Math.max(0, by+oy), MAP-ICON);
        out.add(y*MAP+x);
      }
    }
  }
  return [...out].map(k => [k%MAP, (k/MAP|0)]);
}

function detect(img, ntmpls) {
  const cands = candidates(img);
  const raw = [];
  const patch = new Float32Array(ICON*ICON);
  for (const [px, py] of cands) {
    let sum = 0;
    for (let ty = 0; ty < ICON; ty++) for (let tx = 0; tx < ICON; tx++) {
      const v = gray(img, MAP, px+tx, py+ty); patch[ty*ICON+tx] = v; sum += v;
    }
    const mean = sum/(ICON*ICON);
    let ss = 0;
    for (let i = 0; i < patch.length; i++) { patch[i] -= mean; ss += patch[i]*patch[i]; }
    const inv = 1/Math.max(1e-6, Math.sqrt(ss));
    let bestScore = -2, bestHero = 0;
    for (let hi = 0; hi < ntmpls.length; hi++) {
      const c = ntmpls[hi].centered; let dot = 0;
      for (let i = 0; i < patch.length; i++) dot += patch[i]*c[i];
      const ncc = dot*inv*ntmpls[hi].invNorm;
      if (ncc > bestScore) { bestScore = ncc; bestHero = hi; }
    }
    if (bestScore >= NCC_THRESHOLD) raw.push({hero:bestHero, x:px, y:py, score:bestScore});
  }
  raw.sort((a,b)=>b.score-a.score);
  const kept = [];
  for (const d of raw)
    if (!kept.some(k => Math.abs(k.x-d.x)<ICON/2 && Math.abs(k.y-d.y)<ICON/2)) kept.push(d);
  return kept;
}

function bruteOne(img, nt) {
  let best = -2;
  for (let py = 0; py <= MAP-ICON; py++) for (let px = 0; px <= MAP-ICON; px++) {
    let sum = 0;
    for (let ty = 0; ty < ICON; ty++) for (let tx = 0; tx < ICON; tx++) sum += gray(img,MAP,px+tx,py+ty);
    const mean = sum/(ICON*ICON);
    let dot = 0, ss = 0;
    for (let ty = 0; ty < ICON; ty++) for (let tx = 0; tx < ICON; tx++) {
      const v = gray(img,MAP,px+tx,py+ty)-mean; ss += v*v; dot += v*nt.centered[ty*ICON+tx];
    }
    const ncc = dot*(1/Math.max(1e-6,Math.sqrt(ss)))*nt.invNorm;
    if (ncc > best) best = ncc;
  }
  return best;
}

function scoreFrame(dets, truth) {
  const used = new Array(truth.length).fill(false);
  let tp = 0, fp = 0;
  for (const d of dets) {
    let hit = -1;
    for (let i = 0; i < truth.length; i++) {
      if (used[i]) continue;
      const t = truth[i];
      if (t.hero===d.hero && Math.abs(t.x-d.x)<=MATCH_TOL_PX && Math.abs(t.y-d.y)<=MATCH_TOL_PX) { hit=i; break; }
    }
    if (hit>=0) { used[hit]=true; tp++; } else fp++;
  }
  return [tp, fp, truth.length];
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.round((p/100)*(sorted.length-1))];
}

// ---- main ----
const cores = (await import('node:os')).cpus().length;
const templates = buildTemplates();
const ntmpls = normalizeTemplates(templates);
const rng = new Lcg(0xD0742026);

console.log('=== Spike S-1: Minimap CV feasibility (template matching) — Node equivalent ===');
console.log(`config: minimap ${MAP}x${MAP}px, icon ${ICON}x${ICON}px, ${N_HEROES} templates, ${FRAMES} frames @ ${HZ} Hz, NCC thr ${NCC_THRESHOLD}, tol ${MATCH_TOL_PX}px`);
console.log(`host cores: ${cores}`);
console.log('NOTE: JS latency is a CONSERVATIVE UPPER BOUND; Rust production path is faster.\n');

for (let i = 0; i < 10; i++) { const {img} = renderFrame(rng, templates, 5); detect(img, ntmpls); }

const lat = [], cap = [];
let tp=0, fp=0, truth=0, totalDetect=0;
for (let f = 0; f < FRAMES; f++) {
  const k = rng.range(3, 6);
  const {img, placed} = renderFrame(rng, templates, k);
  const tcap = process.hrtime.bigint();
  const copied = img.slice();
  cap.push(Number(process.hrtime.bigint()-tcap)/1000);
  const t0 = process.hrtime.bigint();
  const dets = detect(img, ntmpls);
  const dt = Number(process.hrtime.bigint()-t0)/1e9;
  totalDetect += dt; lat.push(dt*1e6);
  const [a,b,n] = scoreFrame(dets, placed); tp+=a; fp+=b; truth+=n;
}
lat.sort((a,b)=>a-b); cap.sort((a,b)=>a-b);
const p50=pct(lat,50), p95=pct(lat,95), pmax=lat[lat.length-1];
const capP50=pct(cap,50);
const loopP50=(p50+capP50)/1000, loopP95=(p95+pct(cap,95))/1000;
const recall=tp/Math.max(1,truth), precision=tp/Math.max(1,tp+fp);
const avgDetect=totalDetect/FRAMES, occ=avgDetect/(1/HZ), cpuSys=occ/cores*100;

const {img:bf} = renderFrame(rng, templates, 5);
const tb=process.hrtime.bigint(); bruteOne(bf, ntmpls[0]);
const bfMs=Number(process.hrtime.bigint()-tb)/1e6, bfAll=bfMs*N_HEROES;

const chk = b => b ? 'PASS' : 'FAIL';
console.log('--- LATENCY (capture region-copy + detect) ---');
console.log(`  capture copy   p50 : ${(capP50/1000).toFixed(3)} ms`);
console.log(`  detect         p50 : ${(p50/1000).toFixed(3)} ms`);
console.log(`  detect         p95 : ${(p95/1000).toFixed(3)} ms`);
console.log(`  detect         max : ${(pmax/1000).toFixed(3)} ms`);
console.log(`  LOOP (cap+detect) p50: ${loopP50.toFixed(3)} ms   p95: ${loopP95.toFixed(3)} ms   [GATE <= 80 ms]\n`);
console.log('--- ACCURACY (synthetic, degraded icons) ---');
console.log(`  enemies placed     : ${truth}`);
console.log(`  correct id+pos (TP): ${tp}`);
console.log(`  false positives    : ${fp}`);
console.log(`  identity match-rate: ${(recall*100).toFixed(1)} %   [GATE >= 80 %]`);
console.log(`  precision          : ${(precision*100).toFixed(1)} %\n`);
console.log(`--- CPU @ ${HZ} Hz ---`);
console.log(`  avg detect / frame : ${(avgDetect*1000).toFixed(3)} ms`);
console.log(`  single-core occ    : ${(occ*100).toFixed(3)} %`);
console.log(`  system CPU (${cores} cores): ${cpuSys.toFixed(3)} %   [GATE <= 2.5 %]\n`);
console.log('--- REFERENCE: naive full-region NCC (why prefilter is required) ---');
console.log(`  brute 1 template   : ${bfMs.toFixed(1)} ms`);
console.log(`  brute 10 templates : ${bfAll.toFixed(1)} ms  (no prefilter)\n`);
console.log('--- GATES ---');
console.log(`  [${chk(loopP95<=80)}] capture+detect loop <= 80 ms`);
console.log(`  [${chk(recall>=0.80)}] identity match-rate >= 80 % (SYNTHETIC proxy)`);
console.log(`  [${chk(cpuSys<=2.5)}] system CPU @ ~6 Hz <= 2.5 %`);
