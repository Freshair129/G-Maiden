# CR-004: Voice Command + Stealth Browser

**Status:** DESIGN  
**Author:** Boss  
**Date:** 2026-07-04  
**Predecessor:** None (additive feature)

---

## 1. Problem statement

ผู้เล่น Dota 2 ต้องออกจากเกม (Alt+Tab) เพื่อค้นข้อมูล, เปลี่ยนเพลง YouTube,
หรือหา counter-pick — ทำให้เสียโฟกัส, จอเกมเด้ง, และเสีย tempo การเล่น.

**Goal:** ให้ผู้เล่นสั่ง G-Maiden ด้วยเสียงหรือ hotkey ขณะอยู่ในเกม
โดยที่ Dota 2 **ไม่เสีย focus** และ **ไม่มี window เด้งขึ้นมา**.

---

## 2. Architecture decision

### Hybrid approach: sidecar + core modules

| Module | Placement | Rationale |
|--------|-----------|-----------|
| **G-Browser** | **Sidecar** (`browser-sidecar/`) | Chromium ~200MB, heavy process — ต้องแยก process เหมือน `gpu-feeder/`. สื่อสารผ่าน HTTP `POST /browser` บน GSI :3000 server |
| **G-Ear** | **Core** (`src-tauri/src/ear.rs`) | Lightweight mic capture ผ่าน `cpal` crate, ต้องเข้าถึง Tauri event bus โดยตรงสำหรับ push-to-talk state |
| **G-Intent** | **Core** (`src-tauri/src/intent.rs`) | Command parser + NLU, ต้อง dispatch ไป TTS/overlay/browser ทันที — latency-critical |

### Why NOT separate system?

- G-Ear ต้อง global hotkey infrastructure ของ Tauri (มีอยู่แล้วใน `main.rs`)
- G-Intent ต้อง emit Tauri events ตรงไป overlay + TTS — ถ้าแยก system ต้องเพิ่ม IPC layer โดยไม่จำเป็น
- G-Browser เท่านั้นที่ต้องแยก process เพราะ Chromium ทำ main process หนัก

### Why NOT all in core?

- Chromium headless ใน main process = RAM spike 300-500MB ทับ NFR budget (400MB total)
- ถ้า browser crash จะลาก main app ตาย — sidecar isolate failure domain

---

## 3. Module specifications

### 3.1 G-Ear (`src-tauri/src/ear.rs`)

**Responsibility:** Microphone capture + Voice Activity Detection (VAD)

```
Input:  Push-to-talk hotkey (Alt+V hold) → activate mic
Output: PCM audio buffer → G-Ear emits to Whisper STT
```

**Tech stack:**
- `cpal` crate — cross-platform audio input
- Push-to-talk: `tauri_plugin_global_shortcut` (existing infra)
- VAD: `silero-vad` ONNX model (1MB, runs on CPU) หรือ simple energy-based threshold

**Behavior:**
1. User holds Alt+V → G-Ear starts capturing mic audio
2. User releases Alt+V → G-Ear stops, sends PCM buffer to Whisper
3. Overlay shows "listening..." indicator ขณะกดค้าง
4. ถ้าไม่มี mic → skip silently, log warning

**Constraints:**
- Audio capture ต้อง **ไม่แย่ง** audio output ของ Dota 2
- Buffer max 10 seconds (ป้องกัน memory leak ถ้าลืมปล่อยปุ่ม)
- CREATE_NO_WINDOW on any spawned process (existing rule)

### 3.2 Whisper STT (embedded in G-Ear)

**Model:** `whisper-tiny` หรือ `whisper-base` ONNX (39MB / 74MB)
**Runtime:** `ort` crate (ONNX Runtime, มี DirectML backend บน Windows)

**Language:** Thai + English (auto-detect)

```
Input:  PCM audio buffer (16kHz mono)
Output: Transcribed text string
```

**Performance target:**
- Whisper-tiny: < 500ms for 5-second clip on RTX 3060
- ต้องไม่ใช้ VRAM เกิน 200MB (เหลือที่ให้ Dota 2)
- CPU fallback ถ้า GPU busy (1-2 seconds acceptable)

### 3.3 G-Intent (`src-tauri/src/intent.rs`)

**Responsibility:** Parse transcribed text → structured command → route to action

**Command taxonomy:**

| Intent | Example phrases | Action |
|--------|----------------|--------|
| `search` | "ค้นหา counter Anti-Mage", "search BKB timing" | G-Browser → Google |
| `music_next` | "เปลี่ยนเพลง", "next song", "skip" | G-Browser → YouTube |
| `music_pause` | "หยุดเพลง", "pause music" | G-Browser → YouTube |
| `music_play` | "เปิดเพลง", "play", "resume" | G-Browser → YouTube |
| `volume` | "เสียงดังขึ้น", "louder", "quieter" | System volume |
| `game_advice` | "counter pick อะไรดี", "ซื้ออะไรดี" | G-Master LLM |
| `overlay_toggle` | "ซ่อน overlay", "show overlay" | Existing Ctrl+Alt+S |

**Phase 1 (regex/pattern matching):**
```rust
match text.to_lowercase() {
    t if t.contains("เปลี่ยนเพลง") || t.contains("next song") => Intent::MusicNext,
    t if t.contains("ค้นหา") || t.contains("search") => Intent::Search(extract_query(t)),
    t if t.contains("counter") || t.contains("ซื้ออะไร") => Intent::GameAdvice(t),
    _ => Intent::Unknown(t),
}
```

**Phase 2 (LLM upgrade):** ส่ง text ไป Claude/local-SLM เพื่อ extract intent + entities
ยืดหยุ่นกว่า regex แต่เพิ่ม latency 200-500ms

**Unknown command handling:** TTS ตอบ "ไม่เข้าใจคำสั่งค่ะ" + แสดง transcribed text บน overlay

### 3.4 G-Browser (`browser-sidecar/`)

**Responsibility:** Headless Chromium automation — search, YouTube control, scrape results

**Tech stack:**
- Fork of `stealth-browser-mcp` (MIT license)
- **Rewrite from Python → Rust** (`chromiumoxide` crate) เพื่อ:
  - ลด dependency footprint (ไม่ต้อง Python runtime)
  - ใช้ pattern เดียวกับ `gpu-feeder/` (zero-dep Rust sidecar)
  - Startup เร็วกว่า (cold start < 2s vs Python ~5s)
- ใช้ system Chrome/Edge ที่มีอยู่แล้ว (ไม่ download Chromium 200MB)
- CDP (Chrome DevTools Protocol) สำหรับ stealth automation

**Alternative (simpler Phase 1):** ใช้ `headless_chrome` crate โดยตรงแทน fork
— ง่ายกว่า, ไม่ต้อง port Python code, เพียงพอสำหรับ Google search + YouTube control

**Communication:**
```
G-Intent ──POST /browser──→ browser-sidecar (:3000/browser endpoint)
                                    │
                                    ├── action: "search" + query
                                    ├── action: "youtube_next"
                                    ├── action: "youtube_pause"
                                    └── action: "youtube_play"
                                    │
browser-sidecar ──POST /browser-result──→ GSI server
                                              │
                                              └── emit Tauri event → overlay + TTS
```

**YouTube control specifics:**
- On first `music_play`: launch headless Chrome → navigate to YouTube → play
- Subsequent commands: reuse existing browser session
- Audio routing: Chrome headless with `--autoplay-policy=no-user-gesture-required`
  + `--use-fake-ui-for-media-stream` — audio goes through system mixer
- **Focus safety:** headless = no window = no focus steal

**Google search specifics:**
- Navigate to Google → type query → scrape top 3 results (title + snippet)
- Return structured data → G-Intent formats → TTS reads top result + overlay shows all 3
- Timeout: 5 seconds max per search

**Lifecycle:**
- Sidecar starts on first voice/hotkey command (lazy init)
- Keeps browser session alive (reuse tabs)
- Auto-shutdown after 10 minutes idle
- Main app ไม่ crash ถ้า sidecar ตาย — fallback to "browser offline" TTS

---

## 4. Hotkey mapping (Phase 1 — no voice needed)

| Hotkey | Action | Needs G-Browser |
|--------|--------|:---:|
| **Alt+V** (hold) | Push-to-talk → voice command | No (G-Ear) |
| **Alt+G** | Quick search (opens overlay input) | Yes |
| **Alt+N** | YouTube next track | Yes |
| **Alt+P** | YouTube play/pause toggle | Yes |
| **Alt+↑/↓** | Volume (existing) | No |
| **Alt+M** | Mute (existing) | No |
| **Ctrl+Alt+S** | Overlay toggle (existing) | No |

---

## 5. Dataflow

```
┌─────────────────────────────────────────────────────────┐
│                    G-Maiden (Tauri)                       │
│                                                          │
│  ┌──────────┐    ┌────────────┐    ┌──────────────────┐  │
│  │  G-Ear   │───→│ Whisper STT│───→│    G-Intent      │  │
│  │ (mic/PTT)│    │ (ONNX CPU) │    │ (regex → action) │  │
│  └──────────┘    └────────────┘    └────────┬─────────┘  │
│                                             │            │
│       ┌─────────────────┬───────────────────┤            │
│       ▼                 ▼                   ▼            │
│  ┌─────────┐    ┌──────────────┐    ┌────────────┐      │
│  │ G-Master│    │  TTS + Overlay│    │ HTTP POST  │      │
│  │ (LLM)   │    │  (feedback)  │    │ /browser   │      │
│  └─────────┘    └──────────────┘    └─────┬──────┘      │
│                                           │              │
└───────────────────────────────────────────┼──────────────┘
                                            │
                              ┌─────────────▼─────────────┐
                              │    browser-sidecar         │
                              │  (headless Chrome/Edge)    │
                              │                            │
                              │  ┌────────┐  ┌──────────┐ │
                              │  │ Google │  │ YouTube  │ │
                              │  │ search │  │ control  │ │
                              │  └────────┘  └──────────┘ │
                              └────────────────────────────┘
```

### Hotkey path (Phase 1, no voice)

```
Alt+N pressed → main.rs hotkey handler
             → emit "browser-command" event { action: "youtube_next" }
             → gsi.rs POST /browser → browser-sidecar
             → sidecar clicks YouTube "next" button
             → POST /browser-result { ok: true, title: "Song Name" }
             → gsi.rs emit "browser-result" event
             → TTS: "เปลี่ยนเพลงแล้วค่ะ — Song Name"
```

### Voice path (Phase 2)

```
Alt+V held → G-Ear starts mic capture
           → overlay shows "listening..." pill
Alt+V released → G-Ear sends PCM → Whisper STT
              → text: "ค้นหา counter Anti-Mage"
              → G-Intent: Intent::Search("counter Anti-Mage")
              → POST /browser { action: "search", query: "counter Anti-Mage dota 2" }
              → sidecar Google search → scrape top 3
              → POST /browser-result { results: [...] }
              → TTS: "อันดับหนึ่ง — Phantom Assassin counter Anti-Mage ด้วย BKB timing"
              → overlay shows result card (3 items, auto-dismiss 8s)
```

---

## 6. User flow

```
1. ผู้เล่นเปิด Dota 2 + G-Maiden (ทำงานอยู่แล้ว)
2. ระหว่างเกม ต้องการเปลี่ยนเพลง:
   a. [Hotkey] กด Alt+N → เพลงเปลี่ยน → Maiden พูด "เปลี่ยนแล้วค่ะ"
   b. [Voice]  กด Alt+V ค้าง → พูด "เปลี่ยนเพลง" → ปล่อย → เพลงเปลี่ยน
3. ระหว่างเกม ต้องการค้นข้อมูล:
   a. [Hotkey] กด Alt+G → overlay แสดง search box → พิมพ์ → Enter → ผลลัพธ์แสดงบน overlay
   b. [Voice]  กด Alt+V ค้าง → "ค้นหา BKB timing Anti-Mage" → ผลลัพธ์อ่านให้ฟัง
4. ระหว่างเกม ต้องการ advice:
   a. [Voice]  "counter pick อะไรดี" → G-Master วิเคราะห์ enemy lineup → TTS ตอบ
5. ทุกกรณี:
   - Dota 2 ไม่เสีย focus
   - ไม่มี window เด้ง
   - เสียง Maiden ตอบผ่าน TTS
   - ผลลัพธ์แสดงบน overlay (auto-dismiss)
```

---

## 7. File structure

```
G-Maiden/
├── src-tauri/src/
│   ├── ear.rs            # NEW: G-Ear — mic capture + PTT
│   ├── intent.rs         # NEW: G-Intent — command parser
│   ├── main.rs           # MODIFY: add Alt+V/G/N/P hotkeys
│   ├── gsi.rs            # MODIFY: add /browser + /browser-result endpoints
│   ├── tts.rs            # existing
│   ├── audio.rs          # existing
│   ├── master.rs         # existing (G-Master LLM)
│   └── ...
├── browser-sidecar/      # NEW: headless Chrome sidecar
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs       # HTTP server + Chrome lifecycle
│       ├── search.rs     # Google search automation
│       └── youtube.rs    # YouTube playback control
├── models/
│   ├── whisper-tiny.onnx # NEW: STT model (~39MB)
│   └── silero-vad.onnx   # NEW: VAD model (~1MB)
└── src/src/
    ├── App.tsx           # MODIFY: add "listening" overlay indicator
    └── CommandDeck.tsx   # MODIFY: add voice settings UI
```

---

## 8. Dependencies (new)

### Rust (src-tauri/Cargo.toml)

```toml
# G-Ear: audio capture
cpal = "0.15"

# Whisper STT: ONNX inference
ort = { version = "2", features = ["directml"] }

# G-Intent: (no new deps — pure Rust pattern matching)
```

### Rust (browser-sidecar/Cargo.toml)

```toml
# Headless Chrome
headless_chrome = "1"
# or chromiumoxide = "0.7"

# HTTP server (receive commands from main app)
axum = "0.7"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

---

## 9. NFR compliance

| Constraint | Budget | This feature |
|-----------|--------|-------------|
| RAM | 400MB total | G-Ear ~5MB, Whisper ~80MB (load on demand), browser-sidecar ~120MB (separate process, ไม่นับใน main) |
| CPU | 2.5% background | G-Ear idle 0%, active ~1% (10s max). Whisper burst 100% for <500ms then idle |
| Latency | G-Signal 250ms | Voice path ~800ms (capture 200ms + STT 400ms + action 200ms) — acceptable, ไม่ใช่ critical-path |
| Focus | No Dota FPS drop | Headless Chrome = no window = no focus steal. Sidecar separate process |
| Privacy | Local-only | Audio NEVER leaves device. Whisper runs local ONNX. Google search = public queries only |
| VRAM | Shared with Dota | Whisper-tiny DirectML ~100MB. ถ้า VRAM tight → CPU fallback |

---

## 10. Phased rollout

### Phase 1: Hotkey + Browser (no voice)
- [ ] Create `browser-sidecar/` (Rust, `headless_chrome`)
- [ ] Add `/browser` + `/browser-result` endpoints to `gsi.rs`
- [ ] Register Alt+G, Alt+N, Alt+P hotkeys in `main.rs`
- [ ] YouTube control: play/pause/next via CDP
- [ ] Google search: navigate + scrape top 3
- [ ] TTS feedback for each action
- [ ] Overlay result card (auto-dismiss 8s)
- **Est:** 4-5 days

### Phase 2: Voice input
- [ ] Add `cpal` mic capture in `ear.rs`
- [ ] Alt+V push-to-talk in `main.rs`
- [ ] "Listening..." overlay indicator
- [ ] Integrate `whisper-tiny.onnx` via `ort`
- [ ] Wire STT output → G-Intent
- **Est:** 4-5 days

### Phase 3: Smart intent
- [ ] Regex-based G-Intent (`intent.rs`)
- [ ] Thai + English command patterns
- [ ] Unknown command fallback (TTS + overlay)
- [ ] Settings UI: enable/disable voice, choose STT model
- **Est:** 2-3 days

### Phase 4: LLM upgrade (optional)
- [ ] Replace regex parser with Claude/local-SLM intent extraction
- [ ] Context-aware commands ("ซื้ออะไรดี" uses current game state)
- [ ] Multi-turn: "ค้นหา BKB timing" → "อันไหน?" → clarify
- **Est:** 3-5 days

---

## 11. Risk register

| Risk | Impact | Mitigation |
|------|--------|------------|
| YouTube blocks headless Chrome | Music control fails | Use stealth flags + user-agent spoofing; fallback to direct API if available |
| Whisper VRAM contention with Dota | FPS drop | CPU fallback mode; lazy-load model only when Alt+V pressed |
| Mic captures game audio (speaker feedback) | Wrong transcription | Use directional mic / push-to-talk prevents ambient capture |
| Google CAPTCHA blocks automated search | Search fails | Stealth mode + rate limit (max 1 search/10s); fallback to DuckDuckGo |
| Thai speech recognition accuracy | Wrong commands | Phase 1 regex is forgiving; Phase 4 LLM handles fuzzy input |
| Browser sidecar crash | No search/music | Main app continues fine (G-Signal, G-Master unaffected); auto-restart sidecar |

---

## 12. Open questions

1. **Chrome vs Edge:** ใช้ browser ตัวไหนที่มีอยู่ในเครื่อง? Edge มาใน Windows ทุกเครื่อง
2. **YouTube auth:** ถ้า user login YouTube ใน headless browser จะ persist session ได้ไหม? (playlist access)
3. **Whisper model size:** tiny (39MB, เร็วแต่ accuracy ต่ำ) vs base (74MB, ดีกว่า) vs small (244MB, best Thai)
4. **Overlay search UX:** แสดงผลแบบไหน? card 3 items? หรือ minimal 1-line TTS only?
5. **forked repo or clean impl?** stealth-browser-mcp เป็น Python/nodriver — port เป็น Rust หรือ fork แล้วรันเป็น Python sidecar?
