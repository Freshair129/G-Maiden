---
title: "FEAT-G-COACH — Post-Match Deep Review"
doc_id: "FEAT-G-COACH"
status: "active"
version: "0.2.0"
updated: "2026-10-10"
owner: "Boss"
source_of_truth: true
complexity: "C-3"
risk: "HIGH"
related_docs: ["mvp-decisions", "FEAT-G-MEMORY", "FEAT-G-LOG"]
---

# FEAT-G-COACH — Post-Match Deep Review

> **สถานะ (2026-10-10): `DEFERRED` — G-Coach เป็น P1 นอก MVP และยังไม่มีโมดูลในโค้ด. ข้อเสนอ cloud/Memory เดิมในเอกสารนี้ไม่อนุญาต egress ภายใต้ MVP; ห้ามใช้ opt-in ของ G-Master เป็นสิทธิ์ส่ง Memory/Log ให้ Coach.**

> **Module:** G-Coach · **Priority:** P1; outside MVP · **Phase:** 6–7
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

  # Post-MVP proposal only: local deterministic analysis / local model.
  # No cloud route is authorized; any later proposal requires a new scope/privacy decision.
  analysis = local_coach_analysis(
    prompt: deep_review_prompt(compact_facts, source_backed_local_memory),
    source: local_rules_or_local_model
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
- **MVP boundary:** G-Coach is P1 and outside MVP. This feature has no approved cloud path.
- **Post-MVP proposal:** use local deterministic analysis/local model. A future network route needs a
  separate scope/privacy decision; G-Master's opt-in never authorizes Coach input or G-Memory egress.
- **Privacy:** G-Log, G-Memory and their aggregates stay local under the accepted MVP contract.

## 7. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Full match log | **G-Log** |
| Player context | **G-Memory** |
| Analysis | Local deterministic rules/local model proposal only; no cloud route is approved |
| → Display | **G-Sensory** (post-match screen) |
| → Narration | Audio Engine |

## 8. Acceptance Criteria

- [ ] identify ≥3 key moments per match (with timestamps)
- [ ] top 3 recommendations ที่ actionable
- [ ] praise points ≥1 (always find something positive)
- [ ] persona narrative สอดคล้อง Maiden character
- [ ] local model unavailable → deterministic local summary or explicit unavailable state
- [ ] no-egress: no G-Log, G-Memory, aggregate, or Coach prompt leaves the device
- [ ] completes within 30s of match end

## 9. Proposed Post-MVP Lineage Contract (not runtime approval)

### 9.1 Source and transport

| Source | Transport | Fields/contract | Current status |
| --- | --- | --- | --- |
| G-Log | Local read after match finalization | Tick stream plus `gank_signal`, `gank_revision`, explicit outcome records | Implemented writer; analyzer planned |
| G-Memory | In-process local `MemoryContext` | Source-backed bounded aggregates only; missing values remain `UNKNOWN`; never cloud input | Planned dependency |
| GSI | Final `GameTick` snapshot already present in G-Log | Match clock, final stats, hero, duration/result when explicitly available | Implemented upstream |
| Analysis | In-process deterministic rules or local model | Compact source-backed facts only; no network transport | Not implemented |

The raw match file is parsed and compacted locally before local analysis. No Coach cloud route,
GET endpoint, or network upload of `match-*.jsonl`, `MemoryContext`, or derived aggregates is
authorized by the MVP contract. Reconsideration requires a new explicit scope/privacy decision.

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

- Local model failure → local template based on deterministic facts; no cloud fallback.
- Missing or malformed logs → an explicit incomplete review; no fabricated moments.
- Future acceptance requires hand-calculated scorer fixtures, top-three ordering, source/unknown
  labeling, local prompt inspection, no-egress evidence, and completion within 30 seconds.

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-10-05 | Added the DL-006 source, compact-input, deterministic scoring, fallback, privacy, and evidence contract. |
| 0.2.0 | 2026-10-10 | Marked Coach P1/outside MVP; removed implied cloud authorization and Memory egress, and separated future local-analysis proposal from accepted MVP scope. |
