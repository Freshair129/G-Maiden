---
title: "G-Series Data Lineage and Computation Contract"
doc_id: "G-SERIES-DATA-LINEAGE"
status: "accepted"
version: "1.0.9"
updated: "2026-10-05"
owner: "Boss"
approved_by: "user"
approved_date: "2026-10-05"
source_of_truth: true
complexity: "C-3"
risk: "HIGH"
related_docs: ["features/README", "engineering-spec", "technical-design-document", "FEAT-G-SENTRY", "FEAT-G-MOTION", "FEAT-G-SIGNAL", "FEAT-G-DAMAGE", "FEAT-G-MASTER", "FEAT-G-SENSORY", "FEAT-G-LOG", "FEAT-G-REVIVE", "FEAT-G-VOICE", "FEAT-G-MEMORY", "FEAT-G-COACH", "FEAT-G-MIND", "FEAT-G-PERSONA", "FEAT-G-STREAM", "FEAT-G-SCORE"]
---

# G-Series Data Lineage and Computation Contract

เอกสารนี้เป็นสัญญากลางของ G-Series สำหรับตอบคำถามเดียวกันทุกโมดูล:

1. รับข้อมูลจากที่ใด
2. ใช้ transport หรือ endpoint ใด
3. อ่าน field ใดและอัตราเท่าใด
4. แปลงหรือคำนวณอย่างไร
5. ส่ง output ไปยังโมดูลใด
6. เมื่อข้อมูลหายหรืออยู่นอกขอบเขต จะ fallback อย่างไร

เอกสารนี้บันทึก **พฤติกรรมที่โค้ดทำจริง ณ วันที่อัปเดต** แยกจากพฤติกรรมที่ feature spec วางไว้แต่ยังไม่ต่อใช้งานจริง

## 1. Status vocabulary

| Status | ความหมาย |
| --- | --- |
| `IMPLEMENTED` | source, computation และ output มี code path ใช้งานจริง |
| `PARTIAL` | มี code หรือสูตรบางส่วน แต่ source/output/acceptance ยังไม่ครบ |
| `PLANNED` | มี design/spec แต่ยังไม่มี runtime path ที่ใช้งานจริง |
| `PROPOSED` | แนวคิด post-v1 หรือยังไม่มี contract ที่อนุมัติ |
| `UNVERIFIED` | มี code path แต่ยังไม่มีหลักฐาน runtime/performance ครบตาม acceptance |

Trust order เมื่อเอกสารขัดกับโค้ด: **code > engineering spec/ADR > feature spec > PRD/SRS**. ความขัดแย้งต้องบันทึกเป็น gap ไม่แก้เงียบ ๆ ในเอกสารนี้

## 2. System data flow

```text
Dota 2
  │ local HTTP POST /gsi
  ▼
GSI parser ───────────────► GameTick ──► G-Log / deck / G-Revive / G-Master
                                  │
DXGI Desktop Duplication ─► CV/ONNX Detection
                                  │
                                  ▼
                             G-Sentry
                                  │ EnemyMissing
                                  ▼
                             G-Motion
                                  │ GankRisk
                                  ▼
                             G-Signal ──► audio interrupt / overlay / G-Log

GameTick own hero + static DB ─► G-Damage ─► G-Master prompt
OpenDota public GETs ──────────► control-deck profile/insights only
GPU feeder POST /telemetry ────► G-Sensory resource footer
```

**Transport rule:** core G-Signal data does not use GET. Dota sends a local `POST /gsi`; CV is an in-process pipeline. GET is used by the non-critical OpenDota profile enrichment path.

## 3. Source catalogue

| Source ID | Source and transport | Payload/fields | Consumers | Fallback and boundary |
| --- | --- | --- | --- | --- |
| `SRC-GSI` | Dota → `POST http://127.0.0.1:3000/gsi` | `map.*`, `player.*`, `hero.*`, `items.*` | G-Sentry gate, G-Motion death discount, G-Log, G-Revive, G-Master, deck | Missing fields become zero/false/empty; GSI exposes the local player, not enemy stats or enemy positions. |
| `SRC-CV` | DXGI Desktop Duplication → minimap region → ONNX detector; no HTTP | `Detection { name, x, y, label }` | G-Sentry, G-Motion, G-Signal, future target-side G-Damage/G-Revive | Capture-init failure enters Lite mode; CV-dependent warnings are silent. |
| `SRC-HERO-DB` | Embedded `src-tauri/data/heroes.json` via `include_str!` | base stats and curated ability tables | G-Damage | Base stats cover the roster; ability tables are curated and incomplete; provenance is in `SRC-DATA-MANIFEST`. |
| `SRC-ITEM-DB` | Embedded `src-tauri/data/items.json` and `item-prices.json` | burst contribution and item cost | G-Damage, GSI net-worth fallback | Unknown items contribute zero; snapshot provenance is in `SRC-DATA-MANIFEST`. |
| `SRC-COUNTER-DB` | Embedded `src-tauri/data/item_counters.json` | hero key → recommended item keys | G-Master | Unknown hero/key returns no counter advice; curation status is in `SRC-DATA-MANIFEST`. |
| `SRC-DATA-MANIFEST` | Local `src-tauri/data/provenance.json` plus `tools/data-provenance/verify_manifest.py` | source kind/URL, patch/date fields, generation commit, SHA-256, evidence status | G-Damage, G-Master, GSI net-worth fallback, maintenance gates | Build-time/local only; checksum mismatch fails verification; missing historical provenance remains `PARTIAL`/`UNVERIFIED`; no runtime fetch. |
| `SRC-LOG` | Local JSONL append/flush | ticks, typed events, risk traces, utterances | G-Log, G-Memory, offline replay tools, future G-Coach | Replay and G-Memory read this source locally; only an explicit FULL-evidence fit may produce a tuning profile, and raw logs never leave the machine. |
| `SRC-TUNING` | Local JSON at `%LOCALAPPDATA%\G-Maiden\motion-tuning.json`, written only by `replay_fit --write-tuning` | versioned `TuningDelta` with FULL evidence, match count, baseline/candidate F1, and old/new `MotionParams` | G-Motion at next-match capture initialization | Invalid, missing, APPROX, non-improving, or corrupt primary profiles fall back to the previous valid `.json.bak`, then shipped defaults; no network transport. |
| `SRC-FPS-P7` | Local `PresentMon.exe` subprocess subscribing to Windows ETW for `dota2.exe`; no HTTP | `MsBetweenPresents`, `Dropped`, process identity, overlay phase, operator confirmation | G-Sensory P7 acceptance evidence | Missing PresentMon, Dota, elevation, confirmation, or valid receipt produces `SKIP`/exit `77`; the receipt contains no GSI, CV, G-Log, match, or player data. |
| `SRC-OPENDOTA` | Frontend `GET https://api.opendota.com/api/...` | public profile, win/loss, recent matches, hero stats | Control deck profile/weekly/insights | Public/private/offline/429 failures resolve to locked or fallback UI; not on G-Signal critical path. |
| `SRC-CLAUDE` | Claude CLI or Anthropic `POST /v1/messages` | prompt built from current GameTick and known CV enemies | G-Master | 30-second throttle/cache; Auto falls back to Ollama. |
| `SRC-OLLAMA` | Local `POST http://127.0.0.1:11434/api/chat` | prompt plus selected local model | G-Master, G-Revive narration | Local-only fallback; failure returns an error or cached result. |
| `SRC-GPU` | GPU feeder `POST /telemetry`, or local `telemetry-latest.json` | GPU load/temp/VRAM and optional CPU temp | G-Sensory | Feeder stale after 30s; bridge file stale after 5s; unavailable values are `-1`/`—`. |
| `SRC-RUNTIME` | Tauri settings/events and atomics | sensitivity, backend, persona, signal enabled | G-Signal, G-Master, G-Persona, overlay | Runtime state is local; settings do not change GSI source data. |

### 3.1 DL-005 — static data provenance manifest

Runtime static data is compiled into the Rust binary with `include_str!`; the application does
not fetch or refresh these files during a match. The machine-readable manifest at
[`src-tauri/data/provenance.json`](file:///g:/G-Maiden/src-tauri/data/provenance.json) records one
entry for every runtime snapshot and the curated hero-ability generator input.

Each entry must contain:

- the repository-relative file path, role, consumers, and SHA-256 of the exact checked-in bytes;
- source kind, URL when known, upstream revision, Dota patch, retrieval date, and dataset label;
- the generation/curation tool and the repository commit that introduced the snapshot; and
- an evidence status: `VERIFIED`, `PARTIAL`, or `UNVERIFIED`.

`VERIFIED` is reserved for entries with a recorded source revision and retrieval date plus a
generation tool and commit. Unknown historical fields are explicit `null` values and force
`PARTIAL` or `UNVERIFIED`; the verifier must never turn an unknown source into a current-patch
claim. [`verify_manifest.py`](file:///g:/G-Maiden/tools/data-provenance/verify_manifest.py) is a
local build/maintenance check only: it validates the manifest schema, JSON files, repository
boundaries, and checksums. It performs no network request and is not a runtime data source.

## 4. GSI field mapping

The parser is implemented in [`gsi.rs::parse_tick_from_value`](file:///g:/G-Maiden/src-tauri/src/gsi.rs#L193).

| GSI JSON path | `GameTick` field | Derived behavior |
| --- | --- | --- |
| `map.game_state` | `game_state`, `in_game` | `in_game=true` only for pre-game or game-in-progress states. |
| `map.clock_time` | `clock_time` | G-Master phase bucket: `<600` early, `<1800` mid, otherwise late. |
| `map.daytime` | `daytime` | Direct mapping. |
| `map.radiant_score` / `map.dire_score` | `radiant_score` / `dire_score` | Also used to infer enemy deaths from the local team score. |
| `player.gold` | `gold` | Used directly by G-Master and G-Revive. |
| `player.net_worth` | `net_worth` | Used when non-zero; otherwise `gold + Σ item_costs`. |
| `player.gpm` / `player.xpm` | `gpm` / `xpm` | Direct mapping for deck and logs. |
| `player.kills` / `deaths` / `assists` | `kills` / `deaths` / `assists` | Direct mapping for logs and G-Master prompt. |
| `player.team_name` | `team_name` | Determines whether Radiant or Dire score represents enemy deaths. |
| `player.last_hits` / `denies` | `last_hits` / `denies` | Direct mapping for deck and logs. |
| `player.steamid` | `steamid` | Resolves the public OpenDota account id for the control deck. |
| `hero.name` / `level` | `hero` / `level` | G-Damage hero lookup and G-Master prompt. |
| `hero.alive` | `alive` | Enters G-Revive death-window behavior. |
| `hero.health_percent` / `mana_percent` | `hp_percent` / `mana_percent` | Overlay and G-Master prompt. |
| `hero.health` / `max_health` | `hp` / `max_hp` | Groundwork for target/lethality contracts; local player only today. |
| `hero.buyback_cost` / `respawn_seconds` | `buyback_cost` / `respawn_seconds` | G-Revive live inputs. |
| `hero.kill_list` | `kill_list_len` / `last_victim_slot` | Derived count and latest victim slot. |
| `items.*` | `item_names` | Feeds G-Damage self-burst and item-cost net-worth fallback. |

## 5. Core G-series contracts

### 5.1 G-Sentry — missing enemy detection

**Source:** `SRC-CV`, not a GET and not enemy GSI data. `Sentry::update` receives per-frame `Detection` values and normalizes pixel positions into the minimap coordinate space.

**Current computation:**

```text
confirmed(hero) when sightings >= 4 within 4 seconds
drop unconfirmed track when not seen for > 6 seconds
missing(hero) when confirmed && now_ms - last_seen_ms >= 5000
emit EnemyMissing once per absence edge
re-arm when the hero is detected again
```

**Output:** `EnemyMissing { hero, missing_for_ms, last_pos }` and the current missing list for G-Motion.

**Status:** `IMPLEMENTED` core, `UNVERIFIED` for the documented CPU ≤0.3% and complete roster-filter acceptance. No role weighting is present. See [`sentry.rs`](file:///g:/G-Maiden/src-tauri/src/sentry.rs#L26).

### 5.2 G-Motion — gank probability heuristic

**Source:** current Sentry missing list plus the last five minutes of CV sightings. GSI supplies only the enemy-death count used for a conservative discount; it does not supply enemy positions.

**Default parameters:** `ramp_start=5s`, `peak=12s`, `peak_risk=0.70`, `decay=0.03/s`, `floor=0.10`, `multi_boost=1.15`, `heading_amp=0.22`.

**Next-match tuning:** `Motion::for_next_match` loads the validated `new_params` from `SRC-TUNING` when the capture pipeline is created or reset at a match boundary. A monitor switch clears observation history but preserves the profile already selected for the current match. The formula above is unchanged; tuning changes only these G-Motion parameters and never mutates a live match. A profile is accepted only when its schema is current, evidence is `FULL`, at least three FULL matches support it, the candidate Med-sensitivity F1 improves the shipped default by at least `0.01`, and every parameter passes finite/range/order checks. `APPROX` rows, invalid JSON, failed writes, and missing profiles resolve to the previous valid backup or the default parameters.

For each missing hero, with `s = missing_ms / 1000`:

```text
r_i(s) = 0                                      when s < 5
r_i(s) = ((s - 5) / (12 - 5)) * 0.70           when 5 <= s <= 12
r_i(s) = max(0.70 - (s - 12) * 0.03, 0.10)     when s > 12
```

The last two pre-vanish positions produce a heading multiplier:

```text
heading_multiplier = 1 + clamp(cos(heading, toward_map_center), -1, 1) * 0.22
r_i' = clamp(r_i * heading_multiplier, 0, 1)
```

The aggregate probability is:

```text
p_safe = product(1 - r_i')
probability = 1 - p_safe
if missing_heroes >= 2:
    probability = min(probability * 1.15, 1.0)
```

ETA is a heuristic, not a route model:

```text
eta_ms = max((12 - s), 1) * 1000
```

Known enemy deaths remove the lowest-risk contributors by count. The death-window estimate uses the local player's level and the shorter respawn table as a conservative floor because enemy level and mode are unknown.

**Output:** `GankRisk { probability, missing_heroes, eta_ms }`.

**Status:** `PARTIAL`. The formula is explicit and testable, and the local G-Log → next-match G-Motion tuning handoff is implemented. There is still no full heatmap, lane model, or through-fog path prediction. See [`motion.rs`](file:///g:/G-Maiden/src-tauri/src/motion.rs#L165) and [`tuning.rs`](file:///g:/G-Maiden/src-tauri/src/tuning.rs).

### 5.3 G-Signal — threshold and belief revision

**Source:** `GankRisk` from G-Motion plus local `Sensitivity` from `SRC-RUNTIME`.

| Sensitivity | Danger | Clear |
| --- | ---: | ---: |
| Low | 0.85 | 0.50 |
| Med | 0.65 | 0.40 |
| High | 0.50 | 0.30 |

```text
if !alerted && probability >= danger:
    Alert
if alerted && probability < clear:
    Revision
otherwise:
    None
```

`Alert` carries probability, missing heroes, and ETA. `Revision` clears the prior warning. The capture loop owns audio interrupt, overlay event, and G-Log recording; no LLM or network request is allowed in this path.

**Status:** `IMPLEMENTED` state machine, `UNVERIFIED` full capture-to-audio p50/p99 on real hardware. See [`signal.rs`](file:///g:/G-Maiden/src-tauri/src/signal.rs#L38).

### 5.4 G-Damage — burst and lethality

**Sources:** local `GameTick` hero/level/item names plus embedded hero/item JSON. The database generator documents base stats as originating from dotaconstants/OpenDota snapshots. Enemy current HP, armor, magic resistance, ability levels, and buffs are not available from current GSI and are not wired from CV/OCR.

**Implemented arithmetic:**

```text
armor_multiplier(a) = 1 - (0.06 * a) / (1 + 0.06 * abs(a))
magic_multiplier(mr_percent) = 1 - mr_percent / 100

attack_damage = average(base_damage_min, base_damage_max)
                + primary_attribute_gain * (level - 1)

effective_physical = raw_physical * armor_multiplier(target_armor)
effective_magical  = raw_magical  * magic_multiplier(target_mr_percent)
effective_pure     = raw_pure

total_burst = Σ effective_abilities
              + Σ effective_item_actives
              + 2 * effective_attack_damage
```

The two attacks are an explicit burst-window assumption. Missing ability levels use the standard-build estimator; `self_burst` deliberately estimates the local player's combo against a soft target instead of claiming a kill.

The target-side confidence model is implemented at the source-neutral snapshot boundary, but no
live enemy source currently populates it:

```text
true_ehp ~ Uniform(ehp * (1 - uncertainty), ehp * (1 + uncertainty))
confidence = P(burst >= true_ehp)
can_kill = confidence >= 0.70
```

`TargetCombatSnapshot` in `damage.rs` preserves the observed HP interval and validates the required
target id, level, armor, and percentage magic resistance. `TargetCombatSnapshot::merge(...)` can
combine compatible partial local observations within the 500 ms HP window; it widens overlapping
HP intervals and rejects target/HP/stat conflicts rather than silently preferring CV or OCR.
`to_kill_input(now_ms)` applies the 500 ms HP TTL, the 5 s stat TTL, completeness, and the 0.70
data-confidence floor. The safe wrapper `can_i_kill_from_snapshot(...)` returns `None` instead of
a `KillWindow` when the contract is not actionable. The lower-level `can_i_kill_with(...)` remains
the deterministic formula boundary and is not a live source adapter.

**Resolved data-contract findings (2026-10-04):** `magic_multiplier()` expects a percentage such as
`25.0`. `self_burst` now passes `25.0` for the documented 25% baseline resistance, and the
caller-to-formula regression test verifies that Dagon 5's 800 magical damage becomes 600 effective
damage. DL-002's normalization and fail-closed wrapper are now unit-tested, but the target-side
source and G-Signal path remain unwired because current GSI/CV/OCR evidence does not provide the
required enemy fields.

**Status:** `PARTIAL`. Self-burst is live in G-Master; target-side `KillWindow` is not connected to
G-Signal/Tauri, and no live local target source is approved. See
[`damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L22),
[`damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L136), and
[`damage.rs`](file:///g:/G-Maiden/src-tauri/src/damage.rs#L309).

### 5.5 G-Master — strategic advice

**Sources:** local `GameTick`, CV-recognized enemy hero names, `item_counters.json`, and G-Damage self-burst. The prompt contains the local hero, phase, clock, KDA, net worth, gold, HP/mana, score, counter text, and estimated combo damage.

**Deterministic computation before inference:**

```text
phase = early  when clock < 600
phase = mid    when 600 <= clock < 1800
phase = late   when clock >= 1800

counter_advice = lookup(normalize_cv_hero_name, item_counters.json)
self_burst = G-Damage(local_hero, local_level, local_items)
```

The natural-language answer is model inference, not a reproducible numeric formula. `Auto` tries Claude then Ollama; explicit backend selection bypasses the other provider. Requests are throttled for 30 seconds and the previous response is cached.

**Network:** Claude API is `POST`; the signed-in Claude CLI is a subprocess alternative. Ollama is local `POST /api/chat`. Neither is permitted on the G-Signal critical path.

**Status:** `PARTIAL`. Enemy Net Worth scoring, explicit redaction gate, structured advice schema, and measured item-advice accuracy are not complete. See [`master.rs`](file:///g:/G-Maiden/src-tauri/src/master.rs#L51).

### 5.6 G-Sensory — overlay and resource governor

**Sources:** Tauri events from G-Series, Windows process counters, GPU feeder or bridge file, and local user settings.

**Current resource calculations:**

```text
RAM_MB = WorkingSetSize / 1,048,576

CPU_percent = (process_cpu_delta_ms / (wall_delta_ms * logical_core_count)) * 100

over_budget = RAM_MB > 400 || CPU_percent > 2.5
```

The governor samples every 10 seconds and sets a capture throttle when over budget. GPU load, temperature, and VRAM are parsed values, not calculated estimates. The P7 harness measures FPS locally from PresentMon ETW receipts over a two-phase capture window (default 30 seconds per phase):

```text
fps = 1000 / mean(MsBetweenPresents)
fps_drop_pct = max(0, (baseline_fps - overlay_fps) / baseline_fps * 100)
pass when fps_drop_pct <= 3.0
```

Each baseline, overlay, and prerequisite failure emits the same versioned `gmaiden.p7-fps-receipt` envelope with source/transport/formula/fallback/privacy metadata. A missing prerequisite is `SKIP`/exit `77`, never a PASS. The receipt is local evidence only; it does not prove a live acceptance result until a real overlay-on run returns `verdict=pass`.

**Status:** `PARTIAL`, `UNVERIFIED` for sustained whole-app CPU/RAM and real FPS acceptance. The FPS computation and receipt contract are implemented/tested; no live receipt is currently committed. See [`governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs#L86), [`governor.rs`](file:///g:/G-Maiden/src-tauri/src/governor.rs#L318), and [`perf_p7.rs`](file:///g:/G-Maiden/tests/perf/src/bin/perf_p7.rs).

### 5.7 G-Log — local event record and future feedback loop

**Sources:** GSI ticks, Sentry missing events, Motion risk traces, Signal alerts/revisions, audio utterances, and resource events as each integration is enabled.

**Current computation:** no live decision formula. The writer emits a tick at approximately 1 Hz, appends typed JSONL records, flushes each record, and supports local deletion/disable behavior. `tests/perf/src/bin/replay_fit.rs` replays `risk_trace` rows through the real Motion/Signal code and keeps `FULL` and `APPROX` evidence separate.

With the explicit `--write-tuning` flag, replay-fit selects the best Med-sensitivity candidate from FULL logs only. It requires at least `3` FULL matches and `candidate_f1 >= baseline_f1 + 0.01`, then writes a complete schema-versioned `TuningDelta` through a temporary file to `SRC-TUNING`; the previous valid profile is retained as `.json.bak`. The next capture initialization loads that profile for G-Motion. Invalid/APPROX/non-improving/corrupt profiles fail closed to the backup or shipped defaults. G-Signal thresholds and the live match are not changed by this loop.

**Status:** `PARTIAL`; the local G-Log → G-Motion next-match loop is implemented and unit/producer-tested, while advice calibration, real-match accuracy, and no-egress runtime receipts remain open. See [`log.rs`](file:///g:/G-Maiden/src-tauri/src/log.rs#L151), [`tuning.rs`](file:///g:/G-Maiden/src-tauri/src/tuning.rs), and [`replay_fit.rs`](file:///g:/G-Maiden/tests/perf/src/bin/replay_fit.rs).

## 6. Companion G-series contracts

### 6.1 G-Revive — buyback advisor

**Sources:** GSI `hero.level`, `player.gold`, `hero.buyback_cost`, and `hero.respawn_seconds`; fallback table in `data/respawn.json`; future threat fields from CV.

```text
natural_respawn = live GSI respawn_seconds
                  or respawn_table(level, turbo) - elapsed_since_death

affordable = gold >= buyback_cost
too_late = seconds_to_base_fall < natural_respawn

recommend_buyback = base_under_threat
                    && affordable == true
                    && too_late == true

urgency = Strong   if recommend && allies_alive == 0
           Consider if recommend
           None     otherwise
```

Current `from_tick()` defaults `turbo=false`, `allies_alive=4`, `base_under_threat=false`, and `seconds_to_base_fall=None` because the CV threat source is not wired. The deterministic verdict is then narrated by the local SLM.

**Status:** `PARTIAL` / deterministic core `IMPLEMENTED`. See [`revive.rs`](file:///g:/G-Maiden/src-tauri/src/revive.rs#L20).

### 6.2 G-Voice — two-way voice

**Lineage contract:** PTT microphone data is transient and local; GSI context comes from
`POST /gsi` → `GameTick`; memory is an in-process bounded `MemoryContext`; model input is
redacted text sent through the existing Claude/Anthropic → Ollama boundary; output is a
transient `VoiceTurn` plus Audio Engine/TTS. `turn_latency = capture + STT + router + TTS`
has a non-critical target of ≤2,000 ms. G-Signal always preempts it. Cloud STT is not
authorized until a separate privacy decision.

The full source/field/fallback/evidence contract is in [`FEAT-G-VOICE` §10](FEAT-G-VOICE.md#10-dl-006-lineage-contract-approved-design-runtime-not-implemented).
No microphone input, PTT/STT route, or two-way computation exists today; existing SAPI/rodio
code is output-only.

**Status:** `PLANNED`.

### 6.3 G-Memory — persistent cross-match memory

**Lineage contract:** read only finalized local G-Log JSONL and explicit `GameTick` outcome
fields; no external GET, OpenDota, Steam, sync, or telemetry route is authorized. The first
storage design is a schema-versioned local `memory.json` snapshot rebuilt from a complete
temporary file and returned directly while source metadata is unchanged. Hero counts/win
rate and final GPM/XPM use explicit arithmetic formulas; missing player death coordinates
or rating data remain `UNKNOWN`, never inferred.

The full source/field/formula/delete/no-egress contract is in [`FEAT-G-MEMORY` §10](FEAT-G-MEMORY.md#10-dl-006-lineage-contract-approved-design-runtime-partial).

**Status:** `PARTIAL`. The local JSONL reader, derived snapshot cache, explicit UNKNOWN
fields, and privacy-scoped Tauri commands exist. No post-match outcome writer, consumer UI,
death/MMR/style derivation, or no-egress runtime receipt is claimed. No GET or cloud sync is
authorized by this contract.

### 6.4 G-Coach — post-match review

**Lineage contract:** parse G-Log locally after finalization, compact it into `CoachInput`,
then use G-Memory aggregates and the existing Claude/Anthropic → Ollama fallback. The
deterministic candidate score is `0.6*risk + 0.2*death_transition + 0.2*revision`; the
top three non-overlapping windows are selected before model narration. Raw JSONL and raw
memory never enter a cloud prompt.

The full source/field/scoring/fallback/evidence contract is in [`FEAT-G-COACH` §9](FEAT-G-COACH.md#9-dl-006-lineage-contract-approved-design-runtime-not-implemented).

**Status:** `PLANNED`.

### 6.5 G-Mind — cognitive router

**Current path:** `MasterBackend::Auto` → Claude → Ollama fallback; explicit `Claude` or `Ollama` selects one backend.

**Planned path:** provider registry, cloud/local/template tiers, timeout budget, circuit breaker, redaction, and provider health. These are not currently implemented as an independent router module.

**Status:** `PARTIAL`.

### 6.6 G-Persona — tone presets

**Source:** local runtime preset and control UI. Current behavior is a coarse preset mapping (`coach`, `silent`, `caster`, `meme`) plus fixed Maiden behavior such as gentle tone, Nerf-CM humor, and belief revision.

There is no numeric computation. Independent tone/verbosity axes and full hot-switch acceptance are not implemented.

**Status:** `PARTIAL`; the feature spec and ledger need alignment with the current four-preset code path.

### 6.7 G-Stream — streamer co-host

**Lineage contract:** project only an explicit public allowlist from local G-Sensory/GSI
events; remove sensitive fields and drop unknown/projection failures before overlay or TTS.
G-Memory is local input only, G-Log has no stream output, and this slice has no OBS socket
or other external transport. Stream mode is output-layer only and cannot gate G-Signal.

The full allowlist/redaction/fallback/evidence contract is in [`FEAT-G-STREAM` §9](FEAT-G-STREAM.md#9-dl-006-lineage-contract-approved-design-runtime-not-implemented).

**Status:** `PLANNED`.

### 6.8 G-Score — dynamic soundtrack

**Lineage contract:** consume local `GameTick`, G-Motion/G-Signal intensity, and local
verified music-pack metadata only. The proposed intensity is
`clamp(0.35*R + 0.25*E + 0.20*O + 0.10*C + 0.10*P, 0, 1)`; absent event sources remain
`UNKNOWN` and do not create inferred events. Output stays below G-Signal and game SFX;
there is no cloud or player-data egress.

The full source/formula/audio-priority/fallback/evidence contract is in [`FEAT-G-SCORE` §10](FEAT-G-SCORE.md#10-dl-006-lineage-contract-proposed-post-v1-runtime-not-implemented).

**Status:** `PROPOSED` / post-v1.

## 7. Open lineage and computation gaps

| ID | Gap | Impact | Required next action |
| --- | --- | --- | --- |
| `DL-001` | G-Damage magic-resistance unit mismatch (`25` percent versus `0.25` fraction) | Self-burst can overstate magical damage | RCA: [[2026-10-04-g-damage-magic-resistance-unit-mismatch]]; add a regression test, then make the smallest approved unit-normalization fix. |
| `DL-002` | Enemy HP/armor/magic resistance/level source is not available to target-side G-Damage | No truthful live enemy lethality warning | Contract, conservative observation reconciliation, and normalization/fail-closed wrapper are implemented in [[FEAT-G-DAMAGE]] §4.1; live source proofs and G-Damage/G-Signal wiring remain blocked until a local CV/OCR source is available and separately reviewed. |
| `DL-004` | G-Sensory FPS computation lacked a canonical receipt contract and live acceptance evidence | FPS ≤3% remains unverified | Receipt schema and strict baseline validation are implemented; execute the two-phase PresentMon/ETW run and retain a real `verdict=pass` receipt before closeout. |
| `DL-005` | Static hero/item/counter snapshots lack a single patch/version manifest | Advice and damage provenance can drift | Manifest and local checksum verifier are implemented; historical entries remain explicitly `PARTIAL`/`UNVERIFIED` where patch/date/source evidence was not recorded. |
| `DL-006` | G-Voice/G-Memory/G-Coach/G-Stream/G-Score have no runtime lineage | Planned features cannot be implemented reproducibly | **Structurally resolved:** five module contracts now define source, transport, computation, output, fallback, privacy, and evidence. G-Memory has a partial local reader/snapshot implementation; the remaining companion runtime slices remain `PLANNED`/`PROPOSED`. |

`DL-003` is resolved in version `1.0.6`: the runtime consumes only a validated, local, FULL-evidence `TuningDelta` at the next match boundary, with complete temp-file persistence, backup rollback, and default fallback. This closes the storage/injection gap; it does not claim that real-match accuracy or the broader G-Log acceptance gate has passed.

`DL-004` is partially resolved in version `1.0.7`: `perf_p7` now emits and validates a shared local P7 receipt envelope with the PresentMon/ETW source, formula, fallback, and privacy boundary. This closes the instrumentation/schema gap; it does not claim live FPS compliance because no real Dota/PresentMon receipt is present.

`DL-005` is structurally resolved in version `1.0.8`: the static hero, curated-ability, item,
item-price, and counter snapshots have one local provenance manifest and a checksum verifier.
The verifier proves repository bytes and schema integrity only; it does not retroactively create
missing upstream patch, revision, or retrieval-date evidence. Those entries remain `PARTIAL` or
`UNVERIFIED` until the source record is supplied.

`DL-006` is structurally resolved in version `1.0.9`: the five companion feature specs now
define source-to-output lineage and deterministic boundaries. The G-Memory local reader is
now `PARTIAL` in version `1.0.10`; this does not close its live acceptance evidence, and
G-Score remains proposed.

## 8. Acceptance evidence required

The following are documentation/verification requirements, not claims that the current tree passes them:

- Unit tests for every deterministic formula with hand-calculated fixtures.
- A field-level GSI fixture showing raw JSON → `GameTick` values.
- CV fixture showing pixels → `Detection` → Sentry → Motion → Signal.
- G-Damage fixture covering armor, magic resistance, pure damage, item active, and unknown data.
- G-Revive fixture covering live respawn, table fallback, affordability, threat unknown, and buyback penalty.
- Live G-Signal capture-to-audio latency receipt with p50 and p99.
- Sustained CPU/RAM receipt and FPS-impact receipt.
- P7 FPS receipt must be schema version `1`, measured, overlay-off baseline plus overlay-on comparison, and `verdict=pass`; `SKIP`/unit-test output is not acceptance proof.
- No-egress receipt for G-Log and any future G-Memory path.
- G-Voice: transient-audio, round-trip, interrupt, and local-STT evidence.
- G-Memory: hand-calculated aggregate fixtures, unknown-source behavior, delete-all, and no-egress receipt.
- G-Coach: moment-score/top-three fixtures, compact redacted prompt inspection, and fallback receipt.
- G-Stream: allowlist/denylist/unknown-field redaction fixtures and G-Signal non-interference receipt.
- G-Score: hand-calculated intensity/priority fixtures, pack validation, and CPU/RAM evidence before any post-v1 implementation claim.
- Provenance manifest for every static data snapshot and the external endpoint mapping that supplied
  it; the local verifier must pass, and a tampered artifact must fail checksum validation without
  making a network request.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0.0 | 2026-10-03 | Approved G-Series data lineage, endpoint mapping, computation formulas, fallbacks, and open gaps. |
| 1.0.1 | 2026-10-04 | Added the approved RCA reference and fix boundary for `DL-001`. |
| 1.0.2 | 2026-10-04 | Resolved `DL-001` in the self-burst caller and recorded regression evidence for the canonical percentage unit. |
| 1.0.3 | 2026-10-04 | Accepted the DL-002 target-side source, confidence, fallback, privacy, and evidence contract. |
| 1.0.4 | 2026-10-04 | Implemented the DL-002 target snapshot normalization and fail-closed lethality boundary; live enemy sources and G-Signal wiring remain open. |
| 1.0.5 | 2026-10-04 | Added conservative target-observation reconciliation and recorded conflict/out-of-window fail-closed evidence; live enemy sources remain open. |
| 1.0.6 | 2026-10-04 | Closed DL-003 with FULL-only local TuningDelta persistence, next-match G-Motion loading, backup rollback, and fail-closed defaults. |
| 1.0.7 | 2026-10-05 | Implemented the DL-004 P7 FPS receipt envelope, strict baseline validation, lineage formula, fallback, and privacy metadata; live acceptance remains unverified. |
| 1.0.8 | 2026-10-05 | Implemented DL-005 static-data provenance manifest, explicit historical evidence statuses, and local SHA-256 verification with no runtime network fetch. |
| 1.0.9 | 2026-10-05 | Closed DL-006 structurally with five companion source-to-output contracts; runtime implementation and live acceptance remain open. |
| 1.0.10 | 2026-10-05 | Implemented the first local G-Memory reader/snapshot slice and narrowed DL-006 runtime status to partial rather than shipped. |
