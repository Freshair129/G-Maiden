# Competitive Research: BrightGir/dota-ai-coach + OpenDota API Assessment

> **วันที่:** 2026-06-24  
> **เป้าหมาย:** ศึกษา open-source GSI+RAG overlay คู่แข่ง + ประเมิน OpenDota positional schema สำหรับ G-Motion

---

## ส่วนที่ 1 — BrightGir/dota-ai-coach: Technical Teardown

### 1.1 Overview

| Attribute | ค่า |
|---|---|
| Repo | github.com/BrightGir/dota-ai-coach |
| Language | **Go 100%** (module: `game-ai-helper`) |
| สร้างเมื่อ | 2026-01-10 (push ล่าสุด 2026-02-04) |
| Stars / Forks | 24 / 7 |
| License | MIT |
| Platform | **Windows-only** (WinAPI hard dependency) |
| ผู้เขียน | Victoria (BrightGir), Yandex Fintech / ITMO |

---

### 1.2 Tech Stack (verified from `go.mod`)

| ส่วน | Library |
|---|---|
| Overlay renderer | `github.com/gen2brain/raylib-go` v0.55.1 (C game lib) |
| Vector store | `github.com/philippgille/chromem-go` v0.7.0 (in-process ChromaDB) |
| BERT embeddings | `github.com/nlpodyssey/cybertron` v0.2.1 |
| Windows hotkeys | `github.com/moutend/go-hook` v0.1.0 |
| .env loading | `github.com/joho/godotenv` v1.5.1 |

ไม่มี Python, Rust, Node, Electron, Overwolf — pure Go + embedded assets

---

### 1.3 GSI Integration

**File:** `internal/transport/http_gsi.go` + `gamestate_integration_aicoach.cfg`

- **Port:** `6000` (config ได้ผ่าน `config.json`)
- **Protocol:** HTTP POST, `io.ReadAll` → `json.Unmarshal` → `state.Store`
- **GSI fields ที่ subscribe:** `provider`, `map`, `player`, `hero`, `abilities`, `items`
- **ไม่มี:** `minimap`, `buildings`, `wearables`, `draft`, `events`
- **Throttle:** 0.1s buffer + 0.1s throttle, 30s heartbeat

**State model (`types.go`):**
```
Map:    name, matchid, game_time, clock_time, game_state, daytime
Player: team_name, name, gold, kills, deaths, assists, last_hits, gpm, xpm
Hero:   name, level, health, max_health, mana, max_mana, xpos, ypos, alive, stunned, silenced
Items:  {name, can_cast, charges}
Abilities: {name, level, can_cast, cooldown, ultimate}
```

---

### 1.4 GSI → LLM Preprocessing (`internal/prompt/builder.go`)

ฟังก์ชัน `buildGameContext()` แปลง GameState เป็น human-readable string เดียว:

```
Match Time: 12:34 | State: DOTA_GAMERULES_STATE_GAME_IN_PROGRESS
Hero: crystal_maiden (Lvl 6) | HP: 480/800 | Mana: 300/600 | Alive: true
Stats: K/D/A 1/2/5 | Gold: 1200 | LastHits: 22
Inventory: [item_arcane_boots (CD), item_mekansm x1]
Abilities: [crystal_nova(Lvl2)[Rdy] | frostbite(Lvl1)[CD:8s] | brilliance_aura[Rdy] | freezing_field[ULTIMATE-READY]]
User Situation Notes: Enemy team has strong burst damage
```

Key patterns:
- Strip `npc_dota_hero_` prefix
- Item on cooldown → `(CD)` suffix, charges → `x{n}`
- Ability state → `Rdy` / `CD:{n}s` / `NoMana/Silenced` / `ULTIMATE-READY`
- User notes appended verbatim

---

### 1.5 RAG Pipeline (`internal/prompt/pipeline.go`) — สามขั้นตอน

```
Stage 1 — Query Generation
  └─ LLM + query-generator template
  └─ Return JSON: {"queries": ["q1", "q2", ...]}
  └─ Retry 3 ครั้ง, 2s delay, fallback = raw question

Stage 2 — Knowledge Retrieval
  └─ Parallel goroutines (1 per query, sync.WaitGroup)
  └─ Retriever.Search(ctx, query, top=10)
  └─ Dedup by document ID → filter minSimilarity=0.7
  └─ Join results with \n---\n

Stage 3 — Final Prompt Assembly
  └─ Template: final-prompt.txt
  └─ Fields: {{.Knowledge}}, {{.GameState}}, {{.Question}}
  └─ Chain-of-thought block (internal analysis, player ไม่เห็น)
  └─ SOLUTION HIERARCHY: abilities → wait CDs → purchases
```

**FORBIDDEN rule ใน prompt (สำคัญ):**
> ห้าม recommend item purchase โดยไม่ check ability cooldowns ก่อน — แก้ปัญหา LLM coach failure mode โดยตรง

---

### 1.6 Vector Store + Knowledge Base

- **Vector store:** `chromem-go` — in-process, persistent ที่ `storage/chroma`
- **Embedding model:** `bert-base-uncased` (Cybertron/spago Go port)
- **Knowledge file:** `assets/rag/knowledge.json` — 20MB+ pre-embedded documents
- **Sources:** dotaconstants + Stratz API (heroes, items, abilities, Aghanim upgrades)
- **Chunking:** LLM-assisted (DeepSeek) segmentation ก่อน vectorize

**KB Build Toolchain (แยกจาก runtime — clean separation):**
```
cmd/rag/base-knowledge-loader   → fetch from dotaconstants/Stratz
cmd/rag/knowledge-vectorizer    → chunk → BERT vectors → knowledge.json
cmd/rag/prompt-debug            → test prompts against scenarios
```

---

### 1.7 Overlay Rendering

- **Renderer:** Raylib (`raylib-go`) — C game lib, not Electron/Tauri
- **Window flags:** `FlagWindowUndecorated | FlagWindowTransparent | FlagWindowTopmost`
- **Click-through:** WinAPI toggle, ผ่านคลิกเมื่อ not focused
- **FPS:** 60 target
- **Layout:** 3 panels — AI Advice, Question Input, Context Notes
- **Hotkeys:** F9 toggle / F10 focus (WinAPI low-level keyboard hook)
- **ข้อจำกัด:** Dota 2 ต้องรันใน Borderless/Windowed (ไม่ใช่ Fullscreen)

---

### 1.8 Latency

**ไม่มี latency budget** ในโค้ดหรือ docs ทั้งหมด

Pipeline ที่ช้าที่สุด: timer ทุก 60s → LLM query gen → vector search → LLM final → display  
**Minimum latency: 2–15 วินาที** ต่อ advice cycle — ไม่สามารถเตือน gank real-time ได้เลย

---

## ส่วนที่ 2 — เปรียบเทียบ BrightGir vs G-Maiden

### 2.1 จุดที่ BrightGir ทำได้ดีกว่า (เรียนรู้ได้)

| สิ่ง | รายละเอียด |
|---|---|
| **RAG pipeline** | Three-stage (query gen → parallel retrieval → structured prompt) well-engineered มาก |
| **KB Toolchain** | CLI แยก: fetch → vectorize → debug ทำให้ runtime binary clean |
| **FORBIDDEN prompt rule** | ห้าม recommend purchase ก่อน check cooldowns — แก้ failure mode จริงของ LLM coach |
| **In-game text input** | F10 focus mode พิมพ์คำถาม mid-game ไม่ต้อง alt-tab |
| **User context notes** | Persistent field append ทุก prompt ("playing support, enemy has Silencer") |
| **Silence window** | `silence_duration_seconds` suppress auto-advice หลัง user ถามเอง — ป้องกัน spam |
| **Single binary** | Pure Go + `//go:embed` → 1 `.exe` ไม่มี dependency |

### 2.2 จุดที่ G-Maiden เหนือกว่าชัดเจน

| สิ่ง | BrightGir | G-Maiden |
|---|---|---|
| **Latency** | 2–15s (cloud LLM only) | <300ms G-Signal + local SLM |
| **Real-time gank warning** | ❌ ไม่มีเลย | ✅ G-Signal core feature |
| **Local SLM fallback** | ❌ ตายถ้าเน็ตหลุด | ✅ G-Sentry + G-Signal ทำงานต่อ |
| **Voice / TTS** | ❌ text overlay อย่างเดียว | ✅ Crystal Maiden voice persona |
| **Enemy tracking** | ❌ ไม่ subscribe minimap | ✅ G-Sentry fog-of-war + G-Motion path pred |
| **Persona** | Generic "professional tone" | Named Maiden, belief revision, meme-aware |
| **Post-match loop** | ❌ ไม่มี | ✅ G-Log ปรับ params match ถัดไป |
| **Cross-platform** | ❌ Windows-only (WinAPI) | ✅ Tauri targets Win/Mac/Linux |
| **UI quality** | Utilitarian Raylib | Glassmorphism premium-dark |

### 2.3 สิ่งที่ G-Maiden ควร borrow ทันที

**1. Three-stage RAG pattern (priority สูงสุด)**
```
G-Master pipeline:
  generateSearchQueries(gameContext) → LLM
  parallelRetrieve(queries[], vectorStore) → top-10 per query, dedup
  assembleFinalPrompt(knowledge, gameState, question) → LLM
```
สาเหตุ: embedding raw game state string เข้า vector store โดยตรงให้ retrieval คุณภาพต่ำ การให้ LLM แปลง context เป็น search queries ก่อนดีกว่ามาก

**2. SOLUTION HIERARCHY constraint ใน G-Master prompt**
```
FORBIDDEN: recommend item purchases before checking:
  1. All abilities on cooldown/ready status
  2. Current inventory for upgrades
  3. Current gold vs. item cost
```

**3. `extractJSONObject()` utility**
Strip markdown fences + extract `{...}` จาก LLM response — defensive parsing สำหรับ non-reasoning models

**4. `minSimilarity` threshold เป็น config**
เปิดให้ tune ที่ `config.json` ไม่ hardcode

**5. Silence window หลัง manual question**
G-Maiden's auto-summary timer ควรมี cooldown window หลัง `Alt+M` ถูกกด

---

## ส่วนที่ 3 — OpenDota API: Schema Assessment สำหรับ G-Motion

### 3.1 Match ที่ใช้ทดสอบ

- **Match ID:** `8864282619` (TI 2026 EU Regional Qualifier, 2971 วินาที, fully parsed)
- **Endpoint:** `GET /api/matches/8864282619` — 303 KB JSON

---

### 3.2 Positional Fields ที่พบ

#### `players[].lane_pos` — cumulative heatmap (ไม่มี timestamp)

```json
{
  "76": {"76": 1},
  "77": {"78": 1},
  "190": {"112": 3}
}
```

Schema: `{x_bucket: {y_bucket: visit_count}}`  
- 1 bucket = 64 Valve game units
- Map spans ~bucket 64–193 ทั้งสองแกน
- **ไม่มี timestamp** — เป็น frequency heatmap ตลอดทั้ง match
- Player 0 → 354 unique cells, 690 total samples

#### `players[].times` / `gold_t` / `xp_t` — timeline arrays

```json
"times":  [0, 60, 120, 180, ...],   // 50 snapshots ทุก 60 วินาที
"gold_t": [0, 309, 594, 914, ...],
"xp_t":   [0, 154, 442, 755, ...]
```

Economy data เท่านั้น — ไม่มี position

#### `players[].obs_log` / `sen_log` — เป็นเพียง timestamped x/y ใน API

```json
{
  "time": -62,
  "type": "obs_log",
  "x": 140.6,
  "y": 90.1,
  "z": 130,
  "ehandle": 9356244
}
```

Ward placements เท่านั้น — sparse (1–30 events ต่อ player ต่อ match)

#### `teamfights[].players[].deaths_pos`

```json
"deaths_pos": {"88": {"161": 1}}
```

Same bucketed format — approximate death location ภายใน teamfight window (`start`/`end` timestamps, precision ~10–60 วินาที)

---

### 3.3 Coordinate System

```
opendota_bucket ≈ floor((valve_coord + 8192) / 64)
```

GSI ส่ง raw Valve coords (e.g. `xpos: -2048, ypos: 4096`) ซึ่ง convert เป็น OpenDota buckets ได้ Obs/sen logs ใช้ normalized float บน grid เดียวกัน (e.g. `x: 140.6`)

---

### 3.4 สรุป: OpenDota vs GSI สำหรับ G-Motion

| Property | GSI (real-time) | OpenDota API (historical) |
|---|---|---|
| Hero position | Raw Valve x/y ทุก hero ที่เห็น | Bucketed heatmap, **ไม่มี time axis** |
| Update rate | 100–250 ms | Economy: ทุก 60s / Position: ไม่มี |
| Enemy ใน fog | last known (ออกจาก visible → track เอง) | ไม่ model เลย |
| Vision state | Implicit (unit appear/disappear) | ไม่มี |
| Ward positions | ไม่ได้จาก GSI | ✅ Timestamped float x/y/z |
| Death locations | ไม่มี | Bucketed, ภายใน teamfight window |

**คำตอบ:** OpenDota API **ไม่มี per-second positional data** สำหรับ hero ทั้ง 10 ตัว ข้อมูล position เดียวที่มีคือ `lane_pos` ซึ่งเป็น aggregate heatmap ตลอดทั้ง match — ใช้ train G-Motion โดยตรงไม่ได้

---

### 3.5 แผนฝึก G-Motion ที่ถูกต้อง

```
ระดับ 1 — Map Prior (OpenDota API เพียงพอ)
  ดึง lane_pos จาก 50,000+ matches
  → aggregate เป็น P(position | hero_role, game_minute)
  → ใช้เป็น Bayesian prior ของ gank route probability

ระดับ 2 — Vision Boundary Model (OpenDota obs_log)
  extract obs/sen ward placements patterns
  → model "observable zone boundary"
  → predict ตำแหน่งที่ enemy จะหายจาก fog

ระดับ 3 — Trajectory Sequences (ต้องการ replay parser)
  ดาวน์โหลด .dem จาก replay_url
  parse ด้วย Clarity (Go) หรือ Manta (Go)
  → ได้ (tick, hero_id, x, y) ที่ ~30 Hz
  → นี่คือ training data ที่ถูกต้องสำหรับ path prediction model
  → 500 replays เพียงพอสำหรับ initial model

ระดับ 4 — Real-time inference (GSI เท่านั้น)
  OpenDota API ช้าเกินไปสำหรับ real-time
  G-Motion inference ใช้ live GSI stream เท่านั้น
```

---

## ส่วนที่ 4 — Action Items สรุปรวม

### สำหรับ G-Master (RAG layer)

- [ ] Implement three-stage RAG pipeline ตาม pattern ของ BrightGir: `pipeline.go`
- [ ] เพิ่ม SOLUTION HIERARCHY + FORBIDDEN rule ใน G-Master system prompt
- [ ] เพิ่ม `extractJSONObject()` utility สำหรับ defensive LLM response parsing
- [ ] สร้าง KB toolchain CLI แยก: fetch → vectorize → debug (ไม่ bundled กับ runtime)
- [ ] เปิด `minSimilarity` threshold เป็น config value

### สำหรับ G-Sensory / UX

- [ ] เพิ่ม "context notes" text field ใน overlay — user พิมพ์ situation เพิ่มเติมได้
- [ ] Implement silence window หลัง `Alt+M` manual trigger

### สำหรับ G-Motion (Training Data)

- [ ] ดึง `lane_pos` จาก OpenDota bulk matches → build map prior heatmaps by role
- [ ] Extract `obs_log`/`sen_log` → vision boundary model
- [ ] Build `.dem` replay parser pipeline (Clarity/Go) → trajectory training data
- [ ] เริ่มจาก `MakiAi/dota2-sample-dem` (HuggingFace) สำหรับ test parser

### สำหรับ G-Signal (Latency)

- ✅ ไม่มีอะไรต้อง borrow จาก BrightGir — G-Maiden's design เหนือกว่าในทุกมิติ

---

## References

- BrightGir/dota-ai-coach: https://github.com/BrightGir/dota-ai-coach
- OpenDota API: https://api.opendota.com/api/matches/8864282619
- OpenDota Pro Matches: https://api.opendota.com/api/proMatches
- Clarity replay parser (Go): https://github.com/skadistats/clarity
- Manta replay parser (Go): https://github.com/dotabuff/manta
- betty-dota2 dataset (related): https://huggingface.co/datasets/wolframko/betty-dota2

---

*Generated: 2026-06-24 | Research agent — verified from live HTTP fetches and GitHub source inspection*
