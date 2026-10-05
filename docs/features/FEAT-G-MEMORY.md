---
title: "FEAT-G-MEMORY — Persistent Player Memory"
doc_id: "FEAT-G-MEMORY"
status: "active"
version: "0.2.2"
updated: "2026-10-05"
owner: "Boss"
source_of_truth: true
complexity: "C-3"
risk: "HIGH"
---

# FEAT-G-MEMORY — Persistent Player Memory

> **สถานะ (2026-10-05): `PARTIAL` — มี local JSONL reader/aggregator และ Tauri commands แล้ว; ยังไม่มี post-match hook, UI, death/MMR/style derivation หรือ no-egress receipt**

> **Module:** G-Memory · **Priority:** Companion P0 · **Phase:** 6
> **PRD:** [[product-requirements|PRD]] §3A G-Memory · **SRS:** [[software-requirements-specification|SRS]] §3.8

---

## 1. Purpose

จะทำให้ Maiden "จำผู้เล่นได้" ข้ามแมตช์ — เก็บฮีโร่ถนัด, จุดที่มักตาย, เทรนด์ MMR,
play style preferences. ข้อมูลจะอยู่ **local เท่านั้น** (Privacy-First).
ตั้งใจให้เป็น moat หลักของ persona — ทำให้ Maiden รู้สึกเป็น companion จริง ไม่ใช่ bot ใหม่ทุกแมตช์.

## 2. Data Model

```
PlayerMemory {
    // Hero preferences
    favorite_heroes: Vec<(HeroId, play_count, winrate)>,
    recent_heroes: Vec<HeroId>,          // last 20 matches
    
    // Death analysis
    death_hotspots: Vec<(MapPosition, frequency, avg_game_time)>,
    common_death_causes: Vec<(Cause, count)>,  // ganked, dove_tower, teamfight
    
    // Trends
    mmr_trend: Vec<(date, estimated_mmr)>,     // from win/loss pattern
    avg_gpm: f32,
    avg_xpm: f32,
    
    // Play style
    aggression_score: f32,     // 0 (passive) – 1 (aggressive)
    farming_preference: f32,   // 0 (fighting) – 1 (farming)
    ward_buy_rate: f32,        // support behavior metric
}
```

## 3. Storage

- **Backend (implemented slice):** derive from archived **JSONL** (`match-*.jsonl` in `%LOCALAPPDATA%\G-Maiden\logs\`) and persist a schema-versioned `memory.json` beside the G-Log directory. No SQLite or new network source is added.
- **Location:** local disk only — `memory.json` อยู่ข้างข้อมูล G-Log
- **Refresh:** `get_player_memory` reuses the snapshot while source filename/mtime/size metadata is unchanged; otherwise it reads and rebuilds the aggregate.
- **Retention:** the derived snapshot contains bounded aggregates; archived match-log retention remains governed by G-Log.
- **Size:** bounded by aggregate fields; the ≤5 MB per 1000 matches target is not yet measured as a runtime receipt.

## 4. Logic

Implemented local derivation (`src-tauri/src/memory.rs`):

```
valid archived log          = at least one JSONL record with a non-empty tick.hero
favorite_heroes(h)          = count(valid archived logs where hero == h)
hero_win_rate(h)            = explicit wins(h) / explicit outcomes(h), when present
recent_heroes               = newest valid archived logs by file modified time, max 20
avg_gpm                     = sum(last positive tick.gpm per source) / count(valid gpm)
avg_xpm                     = sum(last positive tick.xpm per source) / count(valid xpm)
```

`match_result` is accepted only when an explicit `{ "win": bool }` record exists. The
current G-Log writer does not emit that record yet, so win rate and
`complete_match_count` remain unknown/zero for current archives. Death coordinates, MMR,
and play-style inputs are not present in the approved source contract; they stay `None`
and are listed in `unknown_fields` rather than inferred.

The first runtime query is on demand through `get_player_memory`; no post-match hook or
G-Voice/G-Master/G-Coach consumer is wired yet.

The following are deliberate partial-state boundaries, not missing documentation:

| Runtime symbol | Current truth | Consequence |
| --- | --- | --- |
| [`parse_match`](../../src-tauri/src/memory.rs#L317) | consumes `match_result.win` only when the record is explicit | current archives without that record expose `win_rate: None`; no inferred win/loss is emitted |
| [`get_player_memory`](../../src-tauri/src/memory.rs#L269) | on-demand read/cache only | no automatic post-match refresh and no downstream companion consumer is claimed |
| [`write_snapshot`](../../src-tauri/src/memory.rs#L373) | writes a complete `memory.json.tmp` before replacement | the slice uses local JSON snapshot persistence; it does not add SQLite |

## 5. Output

- `get_player_memory` → local `MemoryContext` snapshot for a future G-Voice/G-Master/G-Coach consumer
- `delete_player_memory` → removes only the derived `memory.json`; it does not delete G-Log archives
- Persona references → *"จำได้ไหม สองแมตช์ก่อนคุณก็โดนแกงตรงนี้พอดี"*

## 6. Persona Behavior

- **Recall:** *"คุณเล่น Invoker บ่อยนะคะ winrate 62% เลย!"*
- **Warning from memory:** *"ตรงนี้คุณเคยโดน gank 3 ครั้งใน 5 เกมล่าสุด ระวังนะ"*
- **Encouragement:** *"MMR ขึ้นมา 3 เกมติดแล้วนะคะ สู้ๆ!"*
- ไม่ judge: ให้ข้อมูล ไม่ตำหนิ

## 7. Privacy (Critical)

- **LOCAL ONLY** — ห้ามส่งข้อมูล G-Memory ออกนอกเครื่องเด็ดขาด
- ไม่ include raw memory data ใน cloud LLM prompts
  - ส่งได้เฉพาะ **summary/aggregate** (เช่น "ผู้เล่นถนัด carry, aggressive style")
  - ห้ามส่ง death locations, MMR numbers, match history ดิบ
- Player สามารถ delete memory ได้ทุกเมื่อ (data sovereignty)
- Inherit no-egress gate จาก G-Log (GATE P6)

## 8. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Match data | **G-Log** (decisions, signals, match results) |
| → Context for | **G-Voice** (conversation context) |
| → Context for | **G-Master** (advice personalization) |
| → Context for | **G-Coach** (post-match review) |

## 9. Acceptance Criteria

- [x] aggregate favorite heroes + recent heroes from JSONL fixtures; explicit-outcome winrate is covered by unit tests
- [ ] death hotspots aggregate ถูก position
- [ ] MMR trend tracks win/loss pattern
- [ ] memory query ≤5ms (SQLite indexed — หรือเทียบเท่าถ้า derive จาก JSONL)
- [ ] **no-egress:** memory data ไม่ถูกส่งขึ้น cloud (ส่งได้เฉพาะ summary)
- [ ] player สามารถ delete all memory ได้
- [ ] storage ≤5 MB per 1000 matches

## 10. DL-006 Lineage Contract (approved design; runtime partial)

### 10.1 Source and storage boundary

| Source | Transport | Fields/contract | Current status |
| --- | --- | --- | --- |
| G-Log | Local file read of `%LOCALAPPDATA%\G-Maiden\logs\match-*.jsonl` | `tick`, `gank_signal`, `gank_revision`, `enemy_missing`, and explicit outcome records only | Implemented writer and local memory reader; outcome writer remains absent |
| GSI snapshot | In-process `GameTick` already recorded by G-Log | Hero, final GPM/XPM, K/D/A and match clock where present | Implemented upstream |
| External services | None | No OpenDota, Steam, cloud GET, sync, or telemetry route | Forbidden by this contract |

The first implementation uses a schema-versioned local derived snapshot (`memory.json`)
rebuilt from finalized JSONL after a complete temporary file is written and replaced. It
does not add SQLite until a separate storage decision is approved. The loaded snapshot is
returned directly when source metadata is unchanged; it does not repeatedly parse JSONL.

### 10.2 Deterministic derivation

```text
hero_play_count(h) = count(completed_matches where hero == h)
hero_win_rate(h)   = wins(h) / completed_matches(h), when outcome is explicit
recent_heroes      = last 20 completed matches ordered by match timestamp
avg_gpm            = sum(final_gpm for valid matches) / count(valid final_gpm)
avg_xpm            = sum(final_xpm for valid matches) / count(valid final_xpm)
```

The current G-Log does not provide player death coordinates or an MMR/rating source.
Therefore `death_hotspots` and `mmr_trend` must be `UNKNOWN` rather than inferred from
enemy `last_pos`, win/loss streaks, or an undocumented endpoint. The same rule applies
to any aggregate whose required source field is absent.

### 10.3 Output, privacy, and fallback

`MemoryContext` is a bounded local aggregate for a future G-Voice, G-Master, and G-Coach
consumer. The current reader has no cloud call. Raw JSONL, exact death locations, exact
MMR values, Steam identifiers, and match history are never added to the context. Missing
or incomplete fields remain `None` and are listed in `unknown_fields`; malformed source
lines are skipped without fabricating data. Delete removes the derived snapshot without
silently deleting the separately governed G-Log archive.

Acceptance requires hand-calculated aggregation fixtures, query timing after snapshot
load, delete-all verification, and a no-egress receipt showing no network request from
the memory reader.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-05 | Added the DL-006 source, local storage, deterministic derivation, unknown-data, privacy, fallback, and evidence contract. |
| 0.2.0 | 2026-10-05 | Implemented the first local G-Memory slice: JSONL aggregation, schema-versioned snapshot cache, explicit UNKNOWN fields, and privacy-scoped Tauri commands. |
| 0.2.1 | 2026-10-05 | Clarified the intentional partial boundaries reported by code-doc alignment: explicit outcome-only win rate, on-demand refresh, and `.json.tmp` snapshot replacement. |
| 0.2.2 | 2026-10-05 | Updated Symbol Graph line links after adding fail-closed source-boundary comments in `memory.rs`. |
