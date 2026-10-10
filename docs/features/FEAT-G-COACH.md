---
title: "FEAT-G-COACH — Post-Match Deep Review"
doc_id: "FEAT-G-COACH"
status: "active"
version: "0.1.0"
updated: "2026-10-05"
owner: "Boss"
source_of_truth: true
complexity: "C-3"
risk: "HIGH"
---

# FEAT-G-COACH — Post-Match Deep Review

> **สถานะ (2026-07): ยังไม่ได้ทำ (spec ล่วงหน้า) — ยังไม่มีโมดูลนี้ในโค้ด (`src-tauri/src/`)**

> **Module:** G-Coach · **Priority:** Companion P1 · **Phase:** 6–7
> **PRD:** [[product-requirements|PRD]] §3A G-Coach · **SRS:** [[software-requirements-specification|SRS]] §3.9

---

## 1. Purpose

จะวิเคราะห์เชิงลึกหลังจบเกม — ชี้ key decision points, จุดที่ควรปรับปรุง,
และ 3 recommendations สำหรับเกมหน้า. ใช้ full match data จาก G-Log.
เป้าหมายคือเหนือกว่า competitors (Questie) ที่ทำได้แค่ realtime — G-Coach จะให้ retrospective analysis.

## 2. Input

| Source | Data |
| --- | --- |
| G-Log | Full match: decisions, signals, outcomes |
| G-Memory | Player patterns (death hotspots, play style) |
| GSI | Match result, final stats, game duration |

## 3. Logic

```
post match (after G-Log finalize):
  match_log = load full match from G-Log
  
  analysis = brain_router.query(
    prompt: deep_review_prompt(match_log, player_memory),
    source: Cloud (preferred — needs long context for full match)
  )
  
  key_moments = identify_pivotal_decisions(match_log)
    // moments where outcome diverged significantly from expected
    // e.g., teamfight at min 24 where we engaged 4v5
  
  recommendations = extract_top_3(analysis)
  
  emit CoachReview {
    key_moments,
    recommendations,
    praise_points,       // things done well
    persona_narrative,   // Maiden-voiced summary
  }
```

## 4. Output

```rust
CoachReview {
    key_moments: Vec<KeyMoment>,      // timestamp + description + impact
    recommendations: Vec<String>,      // top 3 improvements
    praise_points: Vec<String>,        // things done right
    persona_narrative: String,         // Maiden full review text
}
```

→ **G-Sensory** (post-match overlay screen)
→ **Audio Engine** (narration, non-interruptible since game is over)

## 5. Persona Behavior

- อ่อนโยน + constructive: *"จุดที่น่าเสียดายที่สุดคือนาทีที่ 24 ที่เราเข้าไฟต์เร็วไป"*
- ชม + แนะ: *"แต่ ward game คุณดีมากเลยนะ! แมตช์หน้าลองโฟกัส positioning ตอน teamfight ดูค่ะ"*
- Nerf CM humor (light): *"ถ้าฉันเดินเร็วกว่านี้ ฉันคงมาช่วยทันนะ..."*

## 6. Constraints

- **Non-critical:** post-match, async — ไม่มี latency budget
- **Cloud preferred:** deep analysis ต้อง long context → Cloud LLM (สแตกที่ ship จริงคือ **Claude CLI / Anthropic API** — spec เดิมอ้าง Gemini แต่โค้ดปัจจุบันใช้ Claude)
- **Fallback:** local SLM (Ollama) → shorter analysis; template → basic stats only
- **Privacy:** ส่งเฉพาะ aggregated match stats ขึ้น cloud, ไม่ส่ง raw G-Log (JSONL `match-*.jsonl`)

## 7. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Full match log | **G-Log** |
| Player context | **G-Memory** |
| LLM analysis | Brain Router (Cloud preferred) |
| → Display | **G-Sensory** (post-match screen) |
| → Narration | Audio Engine |

## 8. Acceptance Criteria

- [ ] identify ≥3 key moments per match (with timestamps)
- [ ] top 3 recommendations ที่ actionable
- [ ] praise points ≥1 (always find something positive)
- [ ] persona narrative สอดคล้อง Maiden character
- [ ] cloud fail → fallback shorter analysis (ไม่ crash)
- [ ] privacy: ไม่ส่ง raw G-Log/G-Memory ขึ้น cloud
- [ ] completes within 30s of match end

## 9. DL-006 Lineage Contract (approved design; runtime not implemented)

### 9.1 Source and transport

| Source | Transport | Fields/contract | Current status |
| --- | --- | --- | --- |
| G-Log | Local read after match finalization | Tick stream plus `gank_signal`, `gank_revision`, explicit outcome records | Implemented writer; analyzer planned |
| G-Memory | In-process local `MemoryContext` | Bounded recurrence/style aggregates; missing values remain `UNKNOWN` | Planned dependency |
| GSI | Final `GameTick` snapshot already present in G-Log | Match clock, final stats, hero, duration/result when explicitly available | Implemented upstream |
| Brain | Redacted compact `CoachInput` to Claude/Anthropic or local Ollama | Only derived moments and aggregates; never raw JSONL | Partial upstream |

The raw match file is parsed and compacted locally before any model call. There is no
coach-specific GET endpoint and no cloud upload of `match-*.jsonl` or raw `MemoryContext`.

### 9.2 Deterministic moment and recommendation scoring

For each fixed event window, normalized to `[0, 1]`:

```text
risk       = max(gank_signal.probability in window)
death      = 1 when GameTick.alive changes true → false in window, else 0
revision   = 1 when gank_revision exists in window, else 0
moment_score = 0.6*risk + 0.2*death + 0.2*revision
```

Select the top three non-overlapping windows by `moment_score`, then timestamp for stable
ties. Recommendation priority is `0.6*moment_score + 0.4*memory_recurrence`; when
`memory_recurrence` is unavailable, use `0` and label the result as incomplete. The model
may narrate or explain these facts, but it cannot replace the deterministic selection.

### 9.3 Output, fallback, and evidence

`CoachReview` contains `key_moments`, `recommendations`, `praise_points`,
`persona_narrative`, and evidence/status metadata. The output is local post-match UI/audio
and never enters the G-Signal critical path.

- Claude/Anthropic failure → Ollama → local template based on deterministic facts.
- Missing or malformed logs → an explicit incomplete review; no fabricated moments.
- Acceptance requires hand-calculated scorer fixtures, top-three ordering tests, a redacted
  prompt inspection, cloud-failure fallback evidence, and completion within 30 seconds.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-05 | Added the DL-006 source, compact-input, deterministic scoring, fallback, privacy, and evidence contract. |
