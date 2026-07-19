# G-Maiden â€” Technical Design Document (TDD)

> à¸ªà¸–à¸²à¸›à¸±à¸•à¸¢à¸à¸£à¸£à¸¡à¸£à¸°à¸”à¸±à¸š implementation: component, à¸à¸²à¸£à¹„à¸«à¸¥à¸‚à¸­à¸‡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥, à¹‚à¸¡à¹€à¸”à¸¥ concurrency, à¸à¸²à¸£à¸­à¸­à¸à¹à¸šà¸š
> à¹€à¸ªà¹‰à¸™à¸—à¸²à¸‡à¸§à¸´à¸à¸¤à¸•, resilience, à¸à¸²à¸£à¸à¸³à¸à¸±à¸šà¸—à¸£à¸±à¸žà¸¢à¸²à¸à¸£, ADR à¹à¸¥à¸° Risk register.
> Source of truth à¸‚à¸­à¸‡ "à¸ˆà¸°à¸ªà¸£à¹‰à¸²à¸‡à¸¢à¸±à¸‡à¹„à¸‡". à¸­à¹ˆà¸²à¸™à¸„à¸¹à¹ˆà¸à¸±à¸š [[engineering-spec]] (contracts).

---

## 1. à¸ à¸²à¸žà¸£à¸§à¸¡à¸ªà¸–à¸²à¸›à¸±à¸•à¸¢à¸à¸£à¸£à¸¡ (Two-tier, latency-split)

à¸•à¸²à¸¡ SRS Â§2.1 â€” à¹à¸¢à¸à¸•à¸²à¸¡ latency requirement:

- **Tier A â€” Local Gateway (G-Sensory):** Rust core à¹ƒà¸™ Tauri. à¸–à¸·à¸­ critical path à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”.
  à¸£à¸­à¸”à¹„à¸”à¹‰à¹à¸¡à¹‰ cloud à¸«à¸¥à¸¸à¸” (fallback local SLM/templates).
- **Tier B — Cloud Brain (Maiden Scribe):** Claude CLI / Anthropic Messages API (`claude-haiku-4-5`). persona narration + วิเคราะห์ลึก. non-critical, degrade gracefully. > **สถานะ (2026-07): Gemini = เป้า Phase-4 — ยังไม่ wired**

```
Dota 2  â”€â”€GSI POST :3000â”€â”€â–º  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ Rust Core (Tier A) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
                             â”‚ GSI Server (axum/tokio)                    â”‚
Screen ─DXGI capture──────►  │ Minimap CV (tract-onnx + image + pure-onnx-ocr-sync)     │
                             â”‚   â”‚                                        â”‚
                             â”‚   â–¼                                        â”‚
                             â”‚ G-Sentry â”€â–º G-Motion â”€â–º G-Signal â”€â”€â”       â”‚
                             â”‚                                    â–¼       â”‚
                             â”‚ Audio Engine (rodio) â—„â”€â”€ interrupt channel â”‚
                             │ G-Log (JSONL match-*.jsonl) ◄── decisions/outcomes        │
                             â”‚ Brain Router â”€â”€â–º Cloud | LocalSLM | Tmpl   â”‚
                             â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                                IPC â”‚ (Tauri events)      â”‚ async (non-critical)
                                    â–¼                     â–¼
                          React Overlay UI         Claude CLI / Anthropic API (Tier B)
```

---

## 2. Component breakdown (Rust core)

| Component | à¸«à¸™à¹‰à¸²à¸—à¸µà¹ˆ | Thread/Task |
| --- | --- | --- |
| `gsi_server` | à¸£à¸±à¸š GSI POST, parse, à¸­à¸­à¸ `GameTick` | tokio task |
| `capture` | DXGI duplication à¸‚à¸­à¸‡ region minimap | dedicated thread (throttled) |
| `vision` | à¸•à¸£à¸§à¸ˆà¹„à¸­à¸„à¸­à¸™à¸¨à¸±à¸•à¸£à¸¹ â†’ à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡ | thread pool (rayon) |
| `sentry` | à¸•à¸´à¸”à¸•à¸²à¸¡ missing >5s | tokio task |
| `motion` | ring buffer 5 à¸™à¸²à¸—à¸µ + à¸—à¸³à¸™à¸²à¸¢à¹€à¸ªà¹‰à¸™à¸—à¸²à¸‡ | tokio task |
| `signal` | threshold + interrupt (critical) | **high-priority** path |
| `audio` | playback + interrupt channel | dedicated thread (realtime-ish) |
| `brain_router` | à¹€à¸¥à¸·à¸­à¸ Cloud/SLM/Template + redaction | tokio task |
| `log` | เขียน G-Log **JSONL** (`match-*.jsonl`), ป้อน tuning กลับ | dedicated thread (append writes) |
| `governor` | วัด CPU/RAM/GPU, สั่ง throttle | dedicated thread (ทุก 10s) |

à¸à¸²à¸£à¸ªà¸·à¹ˆà¸­à¸ªà¸²à¸£à¸ à¸²à¸¢à¹ƒà¸™à¹ƒà¸Šà¹‰ **bounded channels** (crossbeam/tokio mpsc). à¸Šà¹ˆà¸­à¸‡ interrupt à¸‚à¸­à¸‡ audio à¹€à¸›à¹‡à¸™
**priority à¸ªà¸¹à¸‡à¸ªà¸¸à¸”** à¹à¸¥à¸° non-blocking.

---

## 3. Critical path â€” G-Signal sequence (â‰¤300ms)

```
capture(frame) â”€30msâ”€â–º vision(positions) â”€50msâ”€â–º motion(prob) â”€20msâ”€â–º
signal: prob>85%? â”€10msâ”€â–º [interrupt audio] â”€30msâ”€â–º [play cached clip] â”€40msâ”€â–º ðŸ”Š
                                                                   total â‰ˆ180ms
```

à¸«à¸¥à¸±à¸à¸à¸²à¸£à¸—à¸µà¹ˆà¸—à¸³à¹ƒà¸«à¹‰à¹„à¸¡à¹ˆà¸«à¸¥à¸¸à¸” budget:
1. **à¹„à¸¡à¹ˆà¸¡à¸µ LLM/network à¹ƒà¸™à¹€à¸ªà¹‰à¸™à¸—à¸²à¸‡à¸™à¸µà¹‰** â€” à¹€à¸ªà¸µà¸¢à¸‡à¸¡à¸²à¸ˆà¸²à¸ cache, à¸à¸²à¸£à¸•à¸±à¸”à¸ªà¸´à¸™à¹ƒà¸ˆà¹€à¸›à¹‡à¸™ rule-based
2. capture loop **à¸§à¸´à¹ˆà¸‡à¸¥à¹ˆà¸§à¸‡à¸«à¸™à¹‰à¸²à¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§** â€” à¸‚à¸±à¹‰à¸™ 1 à¸„à¸·à¸­ "à¸«à¸¢à¸´à¸š frame à¸¥à¹ˆà¸²à¸ªà¸¸à¸”" à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ "à¹€à¸£à¸´à¹ˆà¸¡ capture"
3. interrupt à¹€à¸›à¹‡à¸™ channel send à¹„à¸¡à¹ˆ block; audio thread à¸ˆà¸±à¸”à¸à¸²à¸£à¸ªà¸¥à¸±à¸šà¸„à¸¥à¸´à¸›à¹€à¸­à¸‡
4. à¸§à¸±à¸”à¸”à¹‰à¸§à¸¢ `timestamp_ms` à¸—à¸¸à¸ hop â†’ à¸­à¸­à¸ `ResourceStat`/trace à¹€à¸žà¸·à¹ˆà¸­à¸žà¸´à¸ªà¸¹à¸ˆà¸™à¹Œ p99

---

## 4. à¹‚à¸¡à¹€à¸”à¸¥ Concurrency & threading

- **async runtime:** tokio (multi-thread) สำหรับ I/O (GSI, cloud, JSONL log writes)
- **CPU-bound:** vision à¹ƒà¸Šà¹‰ rayon pool à¹à¸¢à¸ à¹„à¸¡à¹ˆà¹à¸¢à¹ˆà¸‡ tokio worker
- **realtime-ish:** audio thread à¹à¸¢à¸, OS priority à¸ªà¸¹à¸‡à¸à¸§à¹ˆà¸²à¸›à¸à¸•à¸´à¹€à¸¥à¹‡à¸à¸™à¹‰à¸­à¸¢
- **backpressure:** à¸—à¸¸à¸ channel bounded; à¸–à¹‰à¸²à¹€à¸•à¹‡à¸¡ drop frame à¹€à¸à¹ˆà¸² (capture) à¸”à¸µà¸à¸§à¹ˆà¸²à¸„à¹‰à¸²à¸‡
- **no shared mutable global:** state à¸•à¹ˆà¸­à¹‚à¸¡à¸”à¸¹à¸¥à¸–à¸·à¸­à¹ƒà¸™ task à¹€à¸”à¸µà¸¢à¸§, à¸ªà¸·à¹ˆà¸­à¸ªà¸²à¸£à¸”à¹‰à¸§à¸¢ message passing

---

## 5. Minimap Computer Vision (à¹€à¸«à¸•à¸¸à¸œà¸¥ + à¸”à¸µà¹„à¸‹à¸™à¹Œ â€” à¹à¸à¹‰à¸‚à¹‰à¸­à¸ˆà¸³à¸à¸±à¸” GSI)

GSI à¸‚à¸­à¸‡ Dota 2 **à¹„à¸¡à¹ˆà¹€à¸›à¸´à¸”à¹€à¸œà¸¢à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸®à¸µà¹‚à¸£à¹ˆà¸¨à¸±à¸•à¸£à¸¹** (à¹€à¸«à¹‡à¸™à¹€à¸‰à¸žà¸²à¸°à¸‚à¸­à¸‡à¹€à¸£à¸² + à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸ˆà¸³à¸à¸±à¸”). G-Sentry/G-Motion
à¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸¨à¸±à¸•à¸£à¸¹ â†’ à¸­à¹ˆà¸²à¸™à¸ˆà¸²à¸ minimap:

1. DXGI Desktop Duplication à¸”à¸¶à¸‡à¹€à¸‰à¸žà¸²à¸° **bounding box à¸‚à¸­à¸‡ minimap** (config à¹„à¸”à¹‰à¸•à¸²à¸¡ resolution/HUD scale)
2. ตรวจไอคอนฮีโร่ศัตรู: เริ่มด้วย **template matching** (`image` crate) ของ portrait 10 ฮีโร่ในเกมนั้น
   (รูปรายชื่อจาก draft/GSI) → ถ้าแม่นไม่พอ ยกระดับเป็น **ONNX detector เล็ก** (`tract-onnx`)
3. map à¸žà¸´à¸à¸±à¸” pixel â†’ à¸žà¸´à¸à¸±à¸”à¹€à¸à¸¡ â†’ à¸›à¹‰à¸­à¸™ `sentry`/`motion`
4. capture à¹à¸šà¸š **adaptive rate:** à¸›à¸à¸•à¸´ ~5â€“8Hz, à¹€à¸£à¹ˆà¸‡à¹€à¸›à¹‡à¸™ ~15Hz à¹€à¸¡à¸·à¹ˆà¸­ Sentry à¸ªà¸‡à¸ªà¸±à¸¢ (missing à¹€à¸£à¸´à¹ˆà¸¡à¸™à¸±à¸š)

**Trade-off:** CV à¹€à¸žà¸´à¹ˆà¸¡ CPU â€” à¸ˆà¸¶à¸‡à¸ˆà¸³à¸à¸±à¸” region à¹€à¸¥à¹‡à¸ + adaptive rate + GPU-assisted capture à¹€à¸žà¸·à¹ˆà¸­à¸­à¸¢à¸¹à¹ˆà¹ƒà¸™ 2.5%.
à¸™à¸µà¹ˆà¸„à¸·à¸­ Risk R-02.

---

## 6. Brain Router & Resilience (SRS Â§5.2)

```
                       ┌── online?  ──► Cloud (Claude CLI / Anthropic API)  ── persona ราย, วิเคราะห์ลึก
Brain Router â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
(non-critical text)    ├── cloud fail / offline ──► Local SLM (Ollama, ไม่ pin โมเดล)
                       â”‚
                       â””â”€â”€ SLM à¹„à¸¡à¹ˆà¸žà¸£à¹‰à¸­à¸¡ / latency à¸ªà¸¹à¸‡ â”€â”€â–º Template engine (à¹€à¸£à¹‡à¸§à¹€à¸ªà¸¡à¸­)
```

- critical alerts (G-Signal) **à¹„à¸¡à¹ˆà¸žà¸¶à¹ˆà¸‡ router à¹€à¸¥à¸¢** â€” à¹ƒà¸Šà¹‰ cached audio à¹€à¸ªà¸¡à¸­ â†’ à¸£à¸­à¸”à¸—à¸¸à¸à¸à¸£à¸“à¸µ
- router à¸—à¸³ **redaction** à¸à¹ˆà¸­à¸™à¸ªà¹ˆà¸‡à¸‚à¸¶à¹‰à¸™ cloud (à¸•à¸±à¸” PII/G-Log à¸”à¸´à¸š)
- timeout/circuit-breaker: cloud fail à¸•à¸´à¸”à¸à¸±à¸™ N à¸„à¸£à¸±à¹‰à¸‡ â†’ à¸ªà¸¥à¸±à¸š local à¸ˆà¸™à¸à¸§à¹ˆà¸²à¸ˆà¸° healthy

---

## 7. à¸à¸²à¸£à¸à¸³à¸à¸±à¸šà¸—à¸£à¸±à¸žà¸¢à¸²à¸à¸£ (Resource Governor)

`governor` วัดทุก 10s แล้วบังคับ budget:
- **CPU > 2.5%** â†’ à¸¥à¸” capture rate, à¸¥à¸” vision frequency, batch à¸‡à¸²à¸™
- **RAM à¹ƒà¸à¸¥à¹‰ 400MB** â†’ unload SLM, à¸¥à¸” cache, GC ring buffer à¸ªà¹ˆà¸§à¸™à¹€à¸à¸´à¸™
- **FPS impact > 3%** â†’ à¸¥à¸” overlay redraw, à¸›à¸´à¸” effect à¸«à¸™à¸±à¸ (blur), drop à¹„à¸› static HUD
- à¸ªà¹ˆà¸‡ `ResourceStat` à¹ƒà¸«à¹‰ UI à¹à¸ªà¸”à¸‡à¸ªà¸–à¸²à¸™à¸° à¹à¸¥à¸° log à¸¥à¸‡ G-Log à¹€à¸žà¸·à¹ˆà¸­à¸ˆà¸¹à¸™

Overlay: à¸«à¸™à¹‰à¸²à¸•à¹ˆà¸²à¸‡ transparent à¹à¸¢à¸, composited à¹‚à¸”à¸¢ DWM, **click-through** (WS_EX_TRANSPARENT) à¸¢à¸à¹€à¸§à¹‰à¸™
à¹à¸œà¸‡ control. à¸«à¹‰à¸²à¸¡à¸§à¸²à¸”à¸—à¸±à¸š region minimap/skill bar/stats (à¸­à¹ˆà¸²à¸™à¸žà¸´à¸à¸±à¸”à¸ˆà¸²à¸ config resolution).

---

## 8. à¹‚à¸„à¸£à¸‡à¸ªà¸£à¹‰à¸²à¸‡à¹‚à¸›à¸£à¹€à¸ˆà¸à¸•à¹Œ (à¹€à¸›à¹‰à¸²à¸«à¸¡à¸²à¸¢)

```
G-Maiden/
â”œâ”€ src-tauri/            # Rust core
â”‚  â”œâ”€ src/
│  │  ├─ main.rs  gsi.rs  capture.rs  dxgi.rs  capture_wgc.rs (--features wgc)  cv.rs  ocr.rs
│  │  ├─ sentry.rs  motion.rs  signal.rs  audio.rs  announcer.rs  governor.rs  log.rs
│  │  ├─ master.rs  slm.rs  runtime.rs  voice_api.rs  tts.rs  identity.rs  calibration.rs
│  │  ├─ items.rs  usage.rs  damage.rs  revive.rs  respawn.rs  counter_advice.rs  setup.rs
│  │  └─ (โครงจริงเป็น **ไฟล์ .rs แบน** ไม่ใช่โฟลเดอร์ย่อย — ดู `main.rs` mod)
â”‚  â””â”€ tauri.conf.json
â”œâ”€ src/                  # React (overlay + dashboard à¹ƒà¸Šà¹‰à¸£à¹ˆà¸§à¸¡)
â”‚  â”œâ”€ overlay/  dashboard/  components/  store/
â”‚  â”œâ”€ App.tsx            # overlay window + window routing; CommandDeck.tsx = control window
â”‚  â”œâ”€ src/live/           # live-wire builders (Tauri events â†’ UI state); src/gid.ts = GID codec
â”‚  â””â”€ (accounts/GID layer: identity.rs + Supabase gstore â€” see ADR-14, CR-002-Phase2)
├─ gpu-feeder/           # zero-dep telemetry sidecar (nvidia-smi → POST /telemetry); Tauri externalBin
â”œâ”€ assets/voice-cache/   # à¸„à¸¥à¸´à¸›à¹€à¸ªà¸µà¸¢à¸‡ critical à¸—à¸µà¹ˆ render à¸¥à¹ˆà¸§à¸‡à¸«à¸™à¹‰à¸²
├─ models/               # Piper voice (opt) + Ollama SLM external (โหลดแยก, ไม่ commit ไฟล์ใหญ่)
â”œâ”€ docs/                 # à¹€à¸­à¸à¸ªà¸²à¸£à¸Šà¸¸à¸”à¸™à¸µà¹‰
â””â”€ tests/perf/           # latency/CPU/RAM/FPS harness (Definition of Done)
```

---

## 9. Architecture Decision Records

| ADR | à¸à¸²à¸£à¸•à¸±à¸”à¸ªà¸´à¸™à¹ƒà¸ˆ | à¹€à¸«à¸•à¸¸à¸œà¸¥ |
| --- | --- | --- |
| **ADR-01** (à¸¡à¸µà¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§) | à¸—à¸¸à¸à¹‚à¸¡à¸”à¸¹à¸¥ prefix `G-` | brand unity / scalability |
| **ADR-02** | Tauri v2 (à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ Electron) | RAM/CPU budget; transparent overlay; WebView2 |
| **ADR-03** | critical path à¹€à¸›à¹‡à¸™ Rust à¸¥à¹‰à¸§à¸™, cloud/UI à¸«à¹‰à¸²à¸¡à¸­à¸¢à¸¹à¹ˆà¸šà¸™à¹€à¸ªà¹‰à¸™à¸—à¸²à¸‡ â‰¤300ms | latency + resilience |
| **ADR-04** | à¹€à¸ªà¸µà¸¢à¸‡ G-Signal à¹ƒà¸Šà¹‰ **audio cache + slot-splicing** à¹„à¸¡à¹ˆà¸ªà¸±à¸‡à¹€à¸„à¸£à¸²à¸°à¸«à¹Œà¸ªà¸” | budget latency |
| **ADR-05** | à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸¨à¸±à¸•à¸£à¸¹à¸ˆà¸²à¸ **minimap CV** (GSI à¹„à¸¡à¹ˆà¹ƒà¸«à¹‰) | functional necessity |
| **ADR-06** | G-Log = **JSONL match logs** (`match-*.jsonl`) local-only, no egress | privacy-first |
| **ADR-07** | Local SLM = **Ollama** (ไม่ pin โมเดล), เรียกเฉพาะ fallback; ปกติใช้ cloud/template | RAM budget |
| **[[ADR-14-gid-account-identity|ADR-14]]** | Accounts/GID — additive Google-OAuth identity on shared Supabase gstore; match/CV data stays local, account stores public data only | privacy-first + opt-in cross-G-series identity |

---

## 10. Risk Register

| ID | à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¹ˆà¸¢à¸‡ | à¸œà¸¥à¸à¸£à¸°à¸—à¸š | à¸à¸²à¸£à¸£à¸±à¸šà¸¡à¸·à¸­ |
| --- | --- | --- | --- |
| **R-01** | SLM à¸à¸´à¸™ RAM à¹€à¸à¸´à¸™ 400MB | à¸œà¸´à¸” NFR | lazy-load only; à¹ƒà¸Šà¹‰ 0.5B à¸«à¸£à¸·à¸­ template fallback; à¸™à¸´à¸¢à¸²à¸¡ budget à¹€à¸›à¹‡à¸™ background footprint |
| **R-02** | minimap CV à¸à¸´à¸™ CPU à¹€à¸à¸´à¸™ 2.5% / à¹à¸¡à¹ˆà¸™à¸¢à¸³à¸•à¹ˆà¸³ | à¸œà¸´à¸” NFR / à¹€à¸•à¸·à¸­à¸™à¸œà¸´à¸” | region à¹€à¸¥à¹‡à¸ + adaptive rate + GPU capture; à¹€à¸£à¸´à¹ˆà¸¡ template à¸„à¹ˆà¸­à¸¢à¸¢à¸ ONNX |
| **R-03** | GSI à¹„à¸¡à¹ˆà¸¡à¸µà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸¨à¸±à¸•à¸£à¸¹à¸žà¸­ | à¸Ÿà¸µà¹€à¸ˆà¸­à¸£à¹Œà¸«à¸¥à¸±à¸à¸­à¹ˆà¸­à¸™ | à¸žà¸¶à¹ˆà¸‡ CV à¹€à¸›à¹‡à¸™à¹à¸«à¸¥à¹ˆà¸‡à¸«à¸¥à¸±à¸à¸‚à¸­à¸‡à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸¨à¸±à¸•à¸£à¸¹; GSI à¹ƒà¸Šà¹‰à¸‚à¸­à¸‡à¹€à¸£à¸²/timing |
| **R-04** | Piper à¸ªà¸±à¸‡à¹€à¸„à¸£à¸²à¸°à¸«à¹Œà¸ªà¸”à¹€à¸à¸´à¸™ budget | G-Signal à¸«à¸¥à¸¸à¸” 300ms | critical à¹ƒà¸Šà¹‰ cache à¹€à¸ªà¸¡à¸­; à¸ªà¸”à¹€à¸‰à¸žà¸²à¸° non-critical |
| **R-05** | WebView2 à¹€à¸§à¸­à¸£à¹Œà¸Šà¸±à¸™à¸•à¹ˆà¸²à¸‡à¸à¸±à¸™à¹€à¸£à¸™à¹€à¸”à¸­à¸£à¹Œà¹€à¸žà¸µà¹‰à¸¢à¸™ | UI à¹„à¸¡à¹ˆà¸ªà¸¡à¹ˆà¸³à¹€à¸ªà¸¡à¸­ | pin runtime à¸•à¸­à¸™ bundle; à¸—à¸”à¸ªà¸­à¸š Win10/11 |
| **R-06** | overlay à¸šà¸±à¸‡ UI à¹€à¸à¸¡ / anti-cheat à¸à¸±à¸‡à¸§à¸¥ | UX/à¸šà¸±à¸à¸Šà¸µà¹€à¸ªà¸µà¹ˆà¸¢à¸‡ | read-only overlay, à¹„à¸¡à¹ˆ inject à¹€à¸à¸¡, à¹„à¸¡à¹ˆà¸­à¹ˆà¸²à¸™ memory; à¹ƒà¸Šà¹‰ GSI+screen capture à¸—à¸µà¹ˆà¸–à¸¹à¸à¸à¸•à¸´à¸à¸² |
| **R-07** | cloud latency à¸à¸£à¸°à¸•à¸¸à¸ narration | persona à¸ªà¸°à¸”à¸¸à¸” | queue preemptible + local fallback |

> **R-06 à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸:** à¸­à¸­à¸à¹à¸šà¸šà¹ƒà¸«à¹‰ **à¹„à¸¡à¹ˆà¸¢à¸¸à¹ˆà¸‡à¸à¸±à¸š process à¹€à¸à¸¡** à¹€à¸¥à¸¢ (à¹„à¸¡à¹ˆ inject, à¹„à¸¡à¹ˆà¸­à¹ˆà¸²à¸™ memory) â€” à¹ƒà¸Šà¹‰à¹€à¸‰à¸žà¸²à¸°
> GSI (à¸—à¸²à¸‡à¸à¸²à¸£à¸‚à¸­à¸‡ Valve) + screen capture à¸ à¸²à¸¢à¸™à¸­à¸ à¹€à¸žà¸·à¹ˆà¸­à¸„à¸§à¸²à¸¡à¸›à¸¥à¸­à¸”à¸ à¸±à¸¢à¸ˆà¸²à¸ VAC.

