---
title: "FEAT-G-MEMORY — Persistent Player Memory"
doc_id: "FEAT-G-MEMORY"
status: "active"
version: "0.1.0"
updated: "2026-10-05"
owner: "Boss"
source_of_truth: true
complexity: "C-3"
risk: "HIGH"
---

# FEAT-G-MEMORY — Persistent Player Memory

> **สถานะ (2026-07): ยังไม่ได้ทำ (spec ล่วงหน้า) — ยังไม่มีโมดูลนี้ในโค้ด (`src-tauri/src/`)**

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

- **Backend (planned):** SQLite (separate tables). **หมายเหตุ — สแตกปัจจุบันต่างจากนี้:** G-Log ที่ ship จริงเขียนเป็น **JSONL** (`match-*.jsonl` ใน `%LOCALAPPDATA%\G-Maiden\logs\`) ไม่มี SQLite database. ตอน implement ต้องเลือกว่าจะ (ก) เพิ่ม SQLite ใหม่สำหรับ memory หรือ (ข) derive memory จากไฟล์ JSONL ที่มีอยู่.
- **Location:** local disk only — อยู่ข้างข้อมูล G-Log
- **Retention:** indefinite (player data grows slowly)
- **Size:** ≤5 MB per 1000 matches of memory

## 4. Logic

```
post match (after G-Log writes):
  update favorite_heroes (increment play_count, recalculate winrate)
  update death_hotspots (aggregate new deaths)
  update mmr_trend (estimate from win/loss streak)
  update play_style scores (rolling average)

during match:
  G-Voice/G-Master can query memory for context:
    "ผู้เล่นมักตายที่ไหน?" → death_hotspots
    "ฮีโร่ถนัดคืออะไร?" → favorite_heroes
    "เล่น aggressive ไหม?" → aggression_score
```

## 5. Output

- `MemoryContext` → fed into G-Voice prompts, G-Master analysis
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

- [ ] จำ favorite heroes + winrate ถูกต้องข้ามแมตช์
- [ ] death hotspots aggregate ถูก position
- [ ] MMR trend tracks win/loss pattern
- [ ] memory query ≤5ms (SQLite indexed — หรือเทียบเท่าถ้า derive จาก JSONL)
- [ ] **no-egress:** memory data ไม่ถูกส่งขึ้น cloud (ส่งได้เฉพาะ summary)
- [ ] player สามารถ delete all memory ได้
- [ ] storage ≤5 MB per 1000 matches

## 10. DL-006 Lineage Contract (approved design; runtime not implemented)

### 10.1 Source and storage boundary

| Source | Transport | Fields/contract | Current status |
| --- | --- | --- | --- |
| G-Log | Local file read of `%LOCALAPPDATA%\G-Maiden\logs\match-*.jsonl` | `tick`, `gank_signal`, `gank_revision`, `enemy_missing`, and explicit outcome records only | Implemented writer; memory reader planned |
| GSI snapshot | In-process `GameTick` already recorded by G-Log | Hero, final GPM/XPM, K/D/A and match clock where present | Implemented upstream |
| External services | None | No OpenDota, Steam, cloud GET, sync, or telemetry route | Forbidden by this contract |

The first implementation uses a schema-versioned local derived snapshot (`memory.json`)
rebuilt from finalized JSONL and atomically replaced. It does not add SQLite until a
separate storage decision is approved. The loaded snapshot is indexed in memory so the
query budget is measured against the read path, not repeated JSONL parsing.

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

`MemoryContext` is a bounded local aggregate for G-Voice, G-Master, and G-Coach. A cloud
prompt may receive only an allowlisted qualitative summary; raw JSONL, exact death
locations, exact MMR values, Steam identifiers, and match history are never included.
If the snapshot is missing, corrupt, or incomplete, return an empty context plus explicit
`UNKNOWN` fields. Delete-all removes the derived snapshot without silently deleting the
separately governed G-Log archive.

Acceptance requires hand-calculated aggregation fixtures, query timing after snapshot
load, delete-all verification, and a no-egress receipt showing no network request from
the memory reader.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-05 | Added the DL-006 source, local storage, deterministic derivation, unknown-data, privacy, fallback, and evidence contract. |
