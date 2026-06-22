# FEAT-G-COACH — Post-Match Deep Review

> **Module:** G-Coach · **Priority:** Companion P1 · **Phase:** 6–7
> **PRD:** §3A G-Coach · **SRS:** §3.9

---

## 1. Purpose

วิเคราะห์เชิงลึกหลังจบเกม — ชี้ key decision points, จุดที่ควรปรับปรุง,
และ 3 recommendations สำหรับเกมหน้า. ใช้ full match data จาก G-Log.
เหนือกว่า competitors (Questie) ที่ทำได้แค่ realtime — G-Coach ให้ retrospective analysis.

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
- **Cloud preferred:** deep analysis ต้อง long context → Gemini/Cloud LLM
- **Fallback:** local SLM → shorter analysis; template → basic stats only
- **Privacy:** ส่งเฉพาะ aggregated match stats ขึ้น cloud, ไม่ส่ง raw G-Log

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
