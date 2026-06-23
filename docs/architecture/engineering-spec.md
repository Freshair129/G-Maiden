# G-Maiden â€” Engineering Spec

> à¹€à¸­à¸à¸ªà¸²à¸£à¸™à¸µà¹‰à¹à¸›à¸¥à¸‡ requirement à¸ˆà¸²à¸ PRD/SRS à¹ƒà¸«à¹‰à¹€à¸›à¹‡à¸™ **à¸ªà¸±à¸à¸à¸²à¸—à¸²à¸‡à¸§à¸´à¸¨à¸§à¸à¸£à¸£à¸¡ (contracts)** à¸—à¸µà¹ˆ implement à¹„à¸”à¹‰:
> input/output à¸‚à¸­à¸‡à¹à¸•à¹ˆà¸¥à¸°à¹‚à¸¡à¸”à¸¹à¸¥, schema à¹€à¸«à¸•à¸¸à¸à¸²à¸£à¸“à¹Œà¸ à¸²à¸¢à¹ƒà¸™, budget latency à¸£à¸²à¸¢à¸‚à¸±à¹‰à¸™, à¸ªà¸±à¸à¸à¸² API à¹à¸¥à¸°à¹‚à¸„à¸£à¸‡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥.
> à¹ƒà¸Šà¹‰à¸„à¸¹à¹ˆà¸à¸±à¸š `technical-design-document.md` (à¸ªà¸–à¸²à¸›à¸±à¸•à¸¢à¸à¸£à¸£à¸¡) à¹à¸¥à¸° `tech-stack.md`.

---

## 1. Latency Budget â€” G-Signal (SRS Â§5.1: target 250ms / max 300ms)

à¸§à¸±à¸”à¸ˆà¸²à¸ "à¹€à¸‡à¸·à¹ˆà¸­à¸™à¹„à¸‚à¸­à¸±à¸™à¸•à¸£à¸²à¸¢à¹€à¸›à¹‡à¸™à¸ˆà¸£à¸´à¸‡" â†’ "à¹„à¸”à¹‰à¸¢à¸´à¸™à¹€à¸ªà¸µà¸¢à¸‡à¹€à¸•à¸·à¸­à¸™". à¸—à¸¸à¸à¸‚à¸±à¹‰à¸™à¹€à¸›à¹‡à¸™ Rust, **à¹„à¸¡à¹ˆà¹à¸•à¸° cloud/webview**.

| à¸‚à¸±à¹‰à¸™ | à¸‡à¸²à¸™ | à¸‡à¸š (ms) | à¸«à¸¡à¸²à¸¢à¹€à¸«à¸•à¸¸ |
| --- | --- | --- | --- |
| 1 | Minimap capture frame à¸¥à¹ˆà¸²à¸ªà¸¸à¸”à¸žà¸£à¹‰à¸­à¸¡ | ~30 | DXGI duplication, capture loop à¸§à¸´à¹ˆà¸‡à¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§ |
| 2 | CV à¸•à¸£à¸§à¸ˆà¹„à¸­à¸„à¸­à¸™à¸¨à¸±à¸•à¸£à¸¹ + à¸­à¸±à¸›à¹€à¸”à¸•à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡ | ~50 | ONNX detector à¹€à¸¥à¹‡à¸ / template match à¸šà¸™à¸žà¸·à¹‰à¸™à¸—à¸µà¹ˆ minimap à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™ |
| 3 | G-Motion à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¸„à¸§à¸²à¸¡à¸™à¹ˆà¸²à¸ˆà¸°à¹€à¸›à¹‡à¸™ gank | ~20 | à¸„à¸³à¸™à¸§à¸“à¸šà¸™ ring buffer à¹ƒà¸™à¸«à¸™à¹ˆà¸§à¸¢à¸„à¸§à¸²à¸¡à¸ˆà¸³ |
| 4 | G-Signal à¹€à¸Šà¹‡à¸„ threshold (>85%) + à¹€à¸¥à¸·à¸­à¸à¸šà¸—à¸žà¸¹à¸” | ~10 | rule eval + à¹€à¸¥à¸·à¸­à¸ audio cache key |
| 5 | Interrupt à¹€à¸ªà¸µà¸¢à¸‡à¸—à¸µà¹ˆà¸à¸³à¸¥à¸±à¸‡à¹€à¸¥à¹ˆà¸™ + à¹€à¸£à¸´à¹ˆà¸¡à¹€à¸ªà¸µà¸¢à¸‡à¹ƒà¸«à¸¡à¹ˆ | ~30 | à¸ªà¹ˆà¸‡à¸ªà¸±à¸à¸à¸²à¸“à¸œà¹ˆà¸²à¸™ channel à¹„à¸› audio thread |
| 6 | Audio output buffer latency | ~40 | cpal/rodio output buffer |
| **à¸£à¸§à¸¡** | | **~180ms** | à¹€à¸«à¸¥à¸·à¸­ headroom ~70â€“120ms à¸à¹ˆà¸­à¸™à¸Šà¸™ 300 |

**à¸‚à¹‰à¸­à¸šà¸±à¸‡à¸„à¸±à¸šà¸­à¸­à¸à¹à¸šà¸š:** à¹€à¸ªà¸µà¸¢à¸‡à¹€à¸•à¸·à¸­à¸™à¸§à¸´à¸à¸¤à¸•à¸‚à¸­à¸‡ G-Signal **à¸•à¹‰à¸­à¸‡à¹€à¸›à¹‡à¸™ audio à¸—à¸µà¹ˆ render à¹„à¸§à¹‰à¸¥à¹ˆà¸§à¸‡à¸«à¸™à¹‰à¸²**
(à¸ªà¸±à¸‡à¹€à¸„à¸£à¸²à¸°à¸«à¹Œà¸ªà¸”à¸”à¹‰à¸§à¸¢ Piper ~80â€“150ms à¸­à¸²à¸ˆà¸—à¸³à¹ƒà¸«à¹‰à¹€à¸à¸´à¸™ budget). à¸šà¸—à¸žà¸¹à¸”à¸œà¸±à¸™à¹à¸›à¸£ (à¸Šà¸·à¹ˆà¸­à¹„à¸­à¹€à¸—à¸¡/à¸®à¸µà¹‚à¸£à¹ˆ) à¹ƒà¸Šà¹‰à¸§à¸´à¸˜à¸µ
**slot-splicing** â€” à¸•à¹ˆà¸­à¸„à¸¥à¸´à¸›à¸›à¸£à¸°à¹‚à¸¢à¸„à¸«à¸¥à¸±à¸ + à¸„à¸¥à¸´à¸›à¸„à¸³à¹€à¸‰à¸žà¸²à¸°à¸—à¸µà¹ˆ cache à¹„à¸§à¹‰.

---

## 2. à¹‚à¸¡à¸”à¸¹à¸¥ G-Series â€” à¸ªà¸±à¸à¸à¸² Input/Output

### 2.1 G-Sentry (Fog of War Monitor)
- **Input:** GSI tick (500ms poll à¸•à¸²à¸¡ SRS Â§3.1) + minimap enemy positions
- **State:** à¸•à¹ˆà¸­à¸®à¸µà¹‚à¸£à¹ˆà¸¨à¸±à¸•à¸£à¸¹ â€” `last_seen_at`, `last_seen_pos`, `is_visible`
- **Logic:** à¸–à¹‰à¸²à¸®à¸µà¹‚à¸£à¹ˆà¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¹à¸à¹Šà¸‡ (mid/pos4/pos5) `is_visible=false` à¸™à¸²à¸™à¹€à¸à¸´à¸™ **5s** â†’ à¸­à¸­à¸à¹€à¸«à¸•à¸¸à¸à¸²à¸£à¸“à¹Œ
- **Output event:** `EnemyMissing { hero, missing_for_ms, last_pos, role }`

### 2.2 G-Motion (Heatmap / Path Prediction)
- **Input:** stream à¸‚à¸­à¸‡ `EnemyMissing` + ring buffer à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸¢à¹‰à¸­à¸™à¸«à¸¥à¸±à¸‡ **5 à¸™à¸²à¸—à¸µ** (SRS Â§3.2)
- **Logic:** à¸›à¸£à¸°à¹€à¸¡à¸´à¸™à¹€à¸ªà¹‰à¸™à¸—à¸²à¸‡à¸«à¸¥à¸šà¸‹à¹ˆà¸­à¸™/à¹€à¸ªà¹‰à¸™ gank à¸—à¸µà¹ˆà¸™à¹ˆà¸²à¸ˆà¸°à¹€à¸›à¹‡à¸™ â†’ à¸„à¹ˆà¸²à¸„à¸§à¸²à¸¡à¸™à¹ˆà¸²à¸ˆà¸°à¹€à¸›à¹‡à¸™ 0â€“100%
- **Output event:** `GankRisk { lane, probability, predicted_paths[], eta_estimate }`

### 2.3 G-Signal (Real-time Gank Warning) â€” critical path
- **Input:** `GankRisk`
- **Logic:** à¸–à¹‰à¸² `probability > 85%` (Danger Threshold) â†’ **interrupt** à¹€à¸ªà¸µà¸¢à¸‡à¸—à¸µà¹ˆà¹€à¸¥à¹ˆà¸™à¸­à¸¢à¸¹à¹ˆà¸—à¸±à¸™à¸—à¸µ;
  à¸–à¹‰à¸²à¸¡à¸µ alert à¹€à¸à¹ˆà¸²à¸à¸³à¸¥à¸±à¸‡à¸žà¸¹à¸”à¹à¸¥à¸° confidence à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™ â†’ trigger **Belief Revision** (à¸”à¸¹ Â§3)
- **Output:** `SignalAlert { severity, voice_clip_key, interrupt: true }` â†’ audio engine
- **Constraint:** à¸•à¹‰à¸­à¸‡à¸ˆà¸šà¹ƒà¸™ budget Â§1

### 2.4 G-Master (Strategic & Financial Advisor) â€” non-critical
- **Input:** GSI (net worth, items, abilities à¸‚à¸­à¸‡à¹€à¸£à¸² + à¸—à¸µà¹ˆà¸¡à¸­à¸‡à¹€à¸«à¹‡à¸™à¸‚à¸­à¸‡à¸¨à¸±à¸•à¸£à¸¹) + meta dataset
- **Logic:** à¹€à¸—à¸µà¸¢à¸š net worth/à¹„à¸­à¹€à¸—à¸¡ â†’ à¹à¸™à¸°à¸™à¸³ skill/item à¹à¸à¹‰à¸—à¸²à¸‡ (à¸­à¹‰à¸²à¸‡ meta à¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™)
- **Output:** `AdvicePayload { topic, recommendation, rationale, persona_text }` (à¸œà¹ˆà¸²à¸™ cloud à¸«à¸£à¸·à¸­ SLM)

### 2.5 G-Sensory (Overlay & Hardware Optimization)
- **Input:** à¸—à¸¸à¸ event à¸‚à¹‰à¸²à¸‡à¸šà¸™ + resource telemetry
- **Logic:** à¹€à¸£à¸™à¹€à¸”à¸­à¸£à¹Œ glassmorphism HUD; **throttle à¸•à¸±à¸§à¹€à¸­à¸‡à¹€à¸¡à¸·à¹ˆà¸­ FPS à¹€à¸à¸¡ drop à¹€à¸‚à¹‰à¸²à¹ƒà¸à¸¥à¹‰ 3%**;
  à¸›à¸£à¸±à¸šà¹‚à¸—à¸™à¸ªà¸µ overlay à¸•à¸²à¸¡ element à¸®à¸µà¹‚à¸£à¹ˆà¸—à¸µà¹ˆà¹€à¸¥à¹ˆà¸™ (PRD)
- **Output:** UI state + render commands; à¹„à¸¡à¹ˆà¸šà¸±à¸‡ minimap/skill bar/stats panel

### 2.6 G-Log (Feedback Loop) â€” local only
- **Input:** decisions à¸—à¸µà¹ˆ Maiden à¸ªà¹ˆà¸‡ + à¸œà¸¥à¸¥à¸±à¸žà¸˜à¹Œ (death/teamfight/win)
- **Logic:** à¹€à¸—à¸µà¸¢à¸šà¸„à¸³à¹à¸™à¸°à¸™à¸³ vs à¸œà¸¥ â†’ à¸›à¸£à¸±à¸š tuning params à¸‚à¸­à¸‡ G-Sentry/G-Signal à¹€à¸à¸¡à¸«à¸™à¹‰à¸²
- **Output:** à¹€à¸‚à¸µà¸¢à¸™ SQLite local; à¸ªà¹ˆà¸‡ `TuningDelta` à¸à¸¥à¸±à¸šà¹€à¸‚à¹‰à¸² config (à¸”à¸¹ Â§6)

---

## 3. Belief Revision â€” à¸ªà¸±à¸à¸à¸²à¸žà¸¤à¸•à¸´à¸à¸£à¸£à¸¡ (SRS Â§3.3, à¸šà¸±à¸‡à¸„à¸±à¸š à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆ polish)

à¹€à¸¡à¸·à¹ˆà¸­ Maiden à¸à¸³à¸¥à¸±à¸‡à¸žà¸¹à¸”à¸šà¸—à¸«à¸™à¸¶à¹ˆà¸‡à¸­à¸¢à¸¹à¹ˆ à¹à¸¥à¹‰à¸§à¹€à¸‡à¸·à¹ˆà¸­à¸™à¹„à¸‚à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™ (à¹€à¸Šà¹ˆà¸™ threshold à¸žà¸¸à¹ˆà¸‡à¸‚à¹‰à¸²à¸¡ 85% à¸à¸¥à¸²à¸‡à¸›à¸£à¸°à¹‚à¸¢à¸„):

1. audio engine à¹„à¸”à¹‰à¸£à¸±à¸š `Interrupt(reason)` à¸œà¹ˆà¸²à¸™ channel à¸—à¸µà¹ˆ priority à¸ªà¸¹à¸‡à¸ªà¸¸à¸”
2. à¸«à¸¢à¸¸à¸”à¸„à¸¥à¸´à¸›à¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™à¸—à¸µà¹ˆà¸‚à¸­à¸šà¸„à¸³à¸–à¸±à¸”à¹„à¸› (word-boundary, à¹„à¸¡à¹ˆà¸•à¸±à¸”à¸”à¸´à¸š)
3. à¹€à¸¥à¹ˆà¸™à¸„à¸¥à¸´à¸›à¸ªà¸°à¸”à¸¸à¸” **"à¹€à¸­à¹Šà¸°! à¹€à¸”à¸µà¹‹à¸¢à¸§à¸à¹ˆà¸­à¸™!"** (cache) à¹à¸¥à¹‰à¸§à¸•à¹ˆà¸­à¸”à¹‰à¸§à¸¢à¸šà¸—à¹€à¸•à¸·à¸­à¸™à¹ƒà¸«à¸¡à¹ˆ
4. log à¸à¸²à¸£ revision à¸¥à¸‡ G-Log à¹€à¸žà¸·à¹ˆà¸­à¸§à¸±à¸”à¸§à¹ˆà¸²à¸à¸²à¸£à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™à¹ƒà¸ˆà¹€à¸£à¹‡à¸§/à¸Šà¹‰à¸²à¸ªà¹ˆà¸‡à¸œà¸¥à¸•à¹ˆà¸­à¸à¸²à¸£à¸£à¸­à¸”à¸­à¸¢à¹ˆà¸²à¸‡à¹„à¸£

**à¸ªà¸–à¸²à¸™à¸°à¸ à¸²à¸¢à¹ƒà¸™à¸•à¹‰à¸­à¸‡à¸£à¸­à¸‡à¸£à¸±à¸š:** `currently_speaking`, `interruptible`, `revision_in_flight`.

---

## 4. External Interface Contracts

### 4.1 Dota 2 GSI (SRS Â§4.2)
- à¸£à¸±à¸šà¸œà¹ˆà¸²à¸™ **HTTP POST â†’ `http://127.0.0.1:3000/gsi`**, body à¹€à¸›à¹‡à¸™ JSON à¸‚à¸­à¸‡ Valve
- à¸•à¸´à¸”à¸•à¸±à¹‰à¸‡à¹„à¸Ÿà¸¥à¹Œ `gamestate_integration_gmaiden.cfg` à¹ƒà¸™ `.../dota 2 beta/game/dota/cfg/gamestate_integration/`
- à¸•à¸±à¹‰à¸‡ `buffer 0.1`, `throttle 0.1`, `heartbeat 30.0` à¹€à¸žà¸·à¹ˆà¸­à¹ƒà¸«à¹‰ tick à¸–à¸µà¹ˆà¸žà¸­
- à¸Ÿà¸´à¸¥à¸”à¹Œà¸—à¸µà¹ˆà¸šà¸£à¸´à¹‚à¸ à¸„: `map` (clock_time, game_state), `player` (net worth, gold), `hero` (xpos/ypos/level/hp),
  `abilities`, `items`, `provider`
- **à¸‚à¹‰à¸­à¸ˆà¸³à¸à¸±à¸”à¸ªà¸³à¸„à¸±à¸:** GSI **à¹„à¸¡à¹ˆà¸ªà¹ˆà¸‡à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸®à¸µà¹‚à¸£à¹ˆà¸¨à¸±à¸•à¸£à¸¹** â†’ à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸¨à¸±à¸•à¸£à¸¹à¸¡à¸²à¸ˆà¸²à¸ minimap CV (à¸”à¸¹ TDD R-02)

### 4.2 Cloud Cognitive Engine â€” Gemini (SRS Â§4.2)
- `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent`
- streaming (SSE-style chunks) â†’ feed à¹€à¸‚à¹‰à¸² narration queue (preemptible)
- timeout 1500ms; à¸–à¹‰à¸² fail â†’ fallback local SLM/templates (resilience)
- à¸ªà¹ˆà¸‡à¹€à¸‰à¸žà¸²à¸° context à¸—à¸µà¹ˆà¸œà¹ˆà¸²à¸™ redaction â€” **à¹„à¸¡à¹ˆà¸ªà¹ˆà¸‡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸£à¸°à¸šà¸¸à¸•à¸±à¸§à¸•à¸™/à¹„à¸Ÿà¸¥à¹Œ G-Log à¸”à¸´à¸š**

### 4.3 TTS Module
- **Critical:** à¸­à¹ˆà¸²à¸™à¸ˆà¸²à¸ audio cache (key â†’ PCM/Ogg à¸—à¸µà¹ˆ render à¹„à¸§à¹‰)
- **Persona à¸—à¸±à¹ˆà¸§à¹„à¸›:** Piper (ONNX voice model) à¸ªà¸±à¸‡à¹€à¸„à¸£à¸²à¸°à¸«à¹Œà¸ªà¸”, à¸ªà¹„à¸•à¸¥à¹Œà¸™à¸±à¸à¸žà¸²à¸à¸¢à¹Œ
- **Fallback:** Windows SAPI
- à¸ªà¸±à¸à¸à¸²: `synthesize(text, voice_profile) -> AudioHandle` ; `play(handle, {interrupt})`

### 4.4 Global Hotkeys (SRS Â§4.1)
- `Alt + M` â†’ Maiden à¸ªà¸£à¸¸à¸›à¸ªà¸–à¸²à¸™à¸à¸²à¸£à¸“à¹Œ à¸“ à¸§à¸´à¸™à¸²à¸—à¸µà¸™à¸±à¹‰à¸™à¸—à¸±à¸™à¸—à¸µ (`request_situation_summary`)
- à¸¥à¸‡à¸—à¸°à¹€à¸šà¸µà¸¢à¸™à¸œà¹ˆà¸²à¸™ Tauri global-shortcut plugin
- (à¸‚à¸¢à¸²à¸¢à¸ à¸²à¸¢à¸«à¸¥à¸±à¸‡: toggle overlay, mute, sensitivity +/-)

---

## 5. Internal Event Schema (Rust core â†” UI à¸œà¹ˆà¸²à¸™ Tauri events)

```rust
// à¸—à¸¸à¸ event à¸¡à¸µ timestamp_ms (monotonic) à¹€à¸žà¸·à¹ˆà¸­à¸§à¸±à¸” latency à¸ˆà¸£à¸´à¸‡
enum CoreEvent {
    GameTick      { clock: i32, state: GameState },
    EnemyMissing  { hero: HeroId, missing_for_ms: u32, last_pos: Vec2, role: Role },
    GankRisk      { lane: Lane, probability: u8, paths: Vec<Path>, eta_ms: u32 },
    SignalAlert   { severity: Severity, clip_key: String, interrupt: bool },
    Advice        { topic: Topic, text: String, rationale: String },
    Narration     { text: String, source: BrainSource }, // Cloud | LocalSLM | Template
    ResourceStat  { cpu_pct: f32, ram_mb: u32, est_fps_impact_pct: f32 },
}
```

UI subscribe à¸œà¹ˆà¸²à¸™ `listen('core-event', ...)`; commands à¸à¸±à¹ˆà¸‡ UI à¹€à¸Šà¹ˆà¸™ `set_sensitivity`, `toggle_module`.

---

## 6. à¹‚à¸„à¸£à¸‡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥ G-Log (SQLite, local-only)

```sql
CREATE TABLE matches      (id, hero, started_at, ended_at, result);
CREATE TABLE decisions    (id, match_id, t_ms, module, payload, outcome);  -- à¹€à¸—à¸µà¸¢à¸šà¸„à¸³à¹à¸™à¸°à¸™à¸³ vs à¸œà¸¥
CREATE TABLE signals      (id, match_id, t_ms, probability, latency_ms, survived);
CREATE TABLE tuning_state (key, value, updated_at);  -- params à¸—à¸µà¹ˆ G-Log à¸ˆà¸¹à¸™à¸à¸¥à¸±à¸š
```

`tuning_state` à¸›à¹‰à¸­à¸™à¸à¸¥à¸±à¸šà¹€à¸‚à¹‰à¸² G-Sentry/G-Signal à¸•à¸­à¸™à¹€à¸£à¸´à¹ˆà¸¡à¹à¸¡à¸•à¸Šà¹Œà¸–à¸±à¸”à¹„à¸› (à¸›à¸´à¸” feedback loop, SRS Â§3.6).
**à¹„à¸¡à¹ˆà¸¡à¸µ network egress à¸ˆà¸²à¸à¸•à¸²à¸£à¸²à¸‡à¹€à¸«à¸¥à¹ˆà¸²à¸™à¸µà¹‰.**

---

## 7. Orchestrator â€” Role-based Multi-Platform Agent Dispatch

> ADR: [ADR-O-005](../orchestration/docs/ADR-O-005--provider-registry.md) Â·
> Spec: [SPEC--PROVIDER-REGISTRY](../orchestration/docs/SPEC--PROVIDER-REGISTRY.md) Â·
> Guide: [GUIDE--ADDING-PROVIDER](../orchestration/docs/GUIDE--ADDING-PROVIDER.md)

G-Maiden à¹ƒà¸Šà¹‰ **G-Orch** orchestrator à¸ªà¸³à¸«à¸£à¸±à¸šà¸ˆà¸±à¸”à¸à¸²à¸£ development agents (AI à¸—à¸µà¹ˆà¹€à¸‚à¸µà¸¢à¸™ code,
review, à¹à¸¥à¸° plan). G-Orch dispatch task à¸œà¹ˆà¸²à¸™ **role-based provider registry** â€”
à¹à¸¢à¸à¸Šà¸±à¸”à¹€à¸ˆà¸™à¸£à¸°à¸«à¸§à¹ˆà¸²à¸‡ "à¸•à¹‰à¸­à¸‡à¸—à¸³à¸­à¸°à¹„à¸£" (Role) à¸à¸±à¸š "à¹ƒà¸„à¸£à¸—à¸³" (Provider):

```
Task Type  â†’  Role  â†’  Provider (fallback chain + capability matching)
```

### 7.1 Roles (5 roles)

| Role | requires | à¹ƒà¸Šà¹‰à¸à¸±à¸š | fallback chain |
| --- | --- | --- | --- |
| architect | `long_context` | spike, plan, architecture | claude:opus â†’ openrouter â†’ ollama |
| coder | `file_edit` | code, test, integration | claude:sonnet â†’ codex â†’ antigravity â†’ ollama |
| worker | `text_gen` | scaffold, config, docs | claude:haiku â†’ ollama â†’ openrouter |
| reviewer | `code_review` | Verify Gate | claude:opus â†’ claude:sonnet |
| scout | `text_gen` | research, draft | ollama â†’ claude:haiku â†’ openrouter |

### 7.2 Providers (5 platforms)

| Provider | Transport | Capabilities | Resilience |
| --- | --- | --- | --- |
| claude | subprocess (CLI) | file_edit, shell_exec, code_review, streaming, long_context | Primary |
| ollama | HTTP (local) | text_gen | Offline-ready, $0 |
| codex | subprocess (CLI) | file_edit, shell_exec, sandbox | OpenAI fallback |
| openrouter | HTTP (API) | text_gen, streaming, vision, long_context | Multi-model gateway |
| antigravity | subprocess | text_gen, file_edit | IDE agent |

### 7.3 Capability tags

`file_edit` Â· `shell_exec` Â· `code_review` Â· `text_gen` Â· `streaming` Â· `vision` Â· `long_context` Â· `sandbox`

Role à¸›à¸£à¸°à¸à¸²à¸¨ `requires`; Provider à¸›à¸£à¸°à¸à¸²à¸¨ `capabilities`.
`resolveForRole()` à¹€à¸”à¸´à¸™ fallback chain â†’ skip provider à¸—à¸µà¹ˆà¹„à¸¡à¹ˆà¸„à¸£à¸š capability â†’ **first match wins**.

### 7.4 SRS resilience compliance

- Cloud provider à¸¥à¹ˆà¸¡ â†’ coder role automatic fallback à¹„à¸› codex â†’ ollama
- Reviewer à¹ƒà¸Šà¹‰ role-based resolution à¹à¸—à¸™ hardcoded tier map (ADR-O-001)
- Scout/worker à¹€à¸£à¸´à¹ˆà¸¡à¸ˆà¸²à¸ ollama (local) â†’ à¸—à¸³à¸‡à¸²à¸™à¹„à¸”à¹‰ offline
- à¹€à¸žà¸´à¹ˆà¸¡ provider à¹ƒà¸«à¸¡à¹ˆà¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¹à¸à¹‰ engine core (à¹à¸à¹‰ 2 à¹„à¸Ÿà¸¥à¹Œ: config.json + providers.mjs)

### 7.5 Prompt routing

| à¸à¸¥à¸¸à¹ˆà¸¡ | Providers | Prompt style |
| --- | --- | --- |
| Full-agent | claude, codex, antigravity | à¸Šà¸µà¹‰ doc paths à¹ƒà¸«à¹‰ agent à¸­à¹ˆà¸²à¸™à¹€à¸­à¸‡ |
| Text-only | ollama, openrouter | Inline scaffold + small-model rules |

**Implementation:** `orchestration/providers.mjs`, `orchestration/config.json`, `orchestration/engine.mjs`

---

## 8. Definition of Done (à¸§à¸±à¸” constraint à¸ˆà¸£à¸´à¸‡)

à¸—à¸¸à¸à¸Ÿà¸µà¹€à¸ˆà¸­à¸£à¹Œà¸•à¹‰à¸­à¸‡à¸œà¹ˆà¸²à¸™ gate à¸à¹ˆà¸­à¸™à¸–à¸·à¸­à¸§à¹ˆà¸²à¹€à¸ªà¸£à¹‡à¸ˆ:
- [ ] G-Signal p99 end-to-end â‰¤300ms, p50 â‰¤250ms (à¸§à¸±à¸”à¸ˆà¸²à¸ `timestamp_ms`)
- [ ] background CPU â‰¤2.5% à¸šà¸™à¸Šà¸´à¸›à¹€à¸‹à¹‡à¸•à¸£à¸°à¸”à¸±à¸šà¸à¸¥à¸²à¸‡ (à¸§à¸±à¸”à¸”à¹‰à¸§à¸¢ harness 10 à¸™à¸²à¸—à¸µ)
- [ ] RAM â‰¤400MB (à¸ªà¸–à¸²à¸™à¸° cloud-online, SLM à¹„à¸¡à¹ˆà¹‚à¸«à¸¥à¸”)
- [ ] FPS drop â‰¤3% (à¸§à¸±à¸”à¹€à¸—à¸µà¸¢à¸š baseline à¹€à¸à¸¡à¸ˆà¸£à¸´à¸‡)
- [ ] cloud-loss test: à¸›à¸´à¸”à¹€à¸™à¹‡à¸• â†’ G-Sentry/G-Signal à¸¢à¸±à¸‡à¸—à¸³à¸‡à¸²à¸™à¸„à¸£à¸š
- [ ] no-egress test: à¸•à¸£à¸§à¸ˆà¸§à¹ˆà¸²à¹„à¸¡à¹ˆà¸¡à¸µ request à¸žà¸² G-Log/à¸ªà¸–à¸´à¸•à¸´à¸­à¸­à¸à¸™à¸­à¸à¹€à¸„à¸£à¸·à¹ˆà¸­à¸‡
- [ ] orchestrator: `resolveForRole()` resolves à¸—à¸±à¹‰à¸‡ 5 roles (parseModel â†’ capability check â†’ return)
- [ ] orchestrator: cloud-loss â†’ coder/scout fallback chain à¸¥à¸‡à¸–à¸¶à¸‡ ollama
- [ ] orchestrator: à¹€à¸žà¸´à¹ˆà¸¡ provider à¹ƒà¸«à¸¡à¹ˆà¹à¸à¹‰ â‰¤2 à¹„à¸Ÿà¸¥à¹Œ (config.json + providers.mjs)


