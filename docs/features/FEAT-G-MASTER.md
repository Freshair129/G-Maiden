# FEAT-G-MASTER — Strategic & Financial Advisor

> **Module:** G-Master · **Priority:** Core · **Phase:** 5
> **SRS:** §3.4 · **Eng Spec:** §2.4

---

## 1. Purpose

ให้คำแนะนำ skill build / item build ตามสถานการณ์เงิน (Net Worth) และไอเทมศัตรูที่มองเห็น.
ใช้ cloud LLM หรือ local SLM สำหรับ reasoning — **non-critical path** (ไม่มี latency budget เข้มงวด).

## 2. Input

| Source | Data |
| --- | --- |
| GSI tick | `player.net_worth`, `player.gold`, `hero.abilities`, `hero.items` |
| GSI (visible enemies) | `enemy.items` (เท่าที่ GSI เปิดเผย) |
| Meta dataset | Hero matchup data, item winrates, popular builds |

## 3. Logic

```
on GSI tick (throttled every 30s or on significant gold change):
  context = {
    our_hero, our_items, our_net_worth, our_abilities,
    visible_enemy_items, game_time, team_net_worth_diff
  }
  recommendation = brain_router.query(
    prompt: build_advice_prompt(context, meta_dataset),
    source: Cloud | LocalSLM | Template
  )
  emit Advice { topic, recommendation, rationale, persona_text }
```

- **Throttle:** ไม่ query ทุก tick — เฉพาะเมื่อ gold เปลี่ยนมาก (±500) หรือทุก 30s
- **Meta dataset:** static JSON/CSV ของ hero matchups + item builds (อัปเดตต่อ patch)
- **Counter-item logic:** ถ้าศัตรูมี BKB → แนะนำ items ที่ pierce immunity

## 4. Output

```rust
Advice {
    topic: Topic,           // item_build | skill_build | counter_item | general
    recommendation: String, // "ซื้อ MKB เพื่อแก้ Butterfly ของ PA"
    rationale: String,      // "PA มี evasion 35% จาก Butterfly"
    persona_text: String,   // Maiden-voiced version
}
```

→ ส่งเข้า **G-Sensory** (overlay display) + **Audio Engine** (narration queue, preemptible)

## 5. Persona Behavior

- อ่อนโยน + ฉลาด: *"ถ้าจะเอาชนะตัวนั้น ฉันแนะนำ MKB นะ"*
- Nerf CM self-deprecation: *"แต่ถ้าฉันมีเงินน้อยแบบทุกวันนี้ ฉันคงซื้อแค่ Ward แหละ..."*
- ไม่ aggressive / ไม่ judge ผู้เล่น: ให้ข้อมูล + แนะนำ ไม่บังคับ

## 6. Constraints

- **Non-critical:** ไม่มี hard latency budget; cloud timeout 1500ms; fallback SLM/templates
- **Redaction:** ก่อนส่ง cloud ต้องตัด PII/G-Log ดิบ (TDD §6)
- **Frequency:** ≤2 advice per minute (ไม่ spam ผู้เล่น)
- **Preemptible:** G-Signal interrupt ได้เสมอ (advice ถูกตัดเมื่อ critical alert มา)

## 7. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Game state | GSI Server |
| LLM inference | Brain Router (Cloud/SLM/Template) |
| Meta data | Static dataset (per-patch) |
| → แสดงผล | **G-Sensory** (overlay) |
| → เสียง | Audio Engine (narration queue) |

## 8. Acceptance Criteria

- [ ] แนะนำ counter-item ได้ถูกต้องเทียบกับ meta (≥70% match rate)
- [ ] throttle: ไม่ query เกิน 2/min
- [ ] cloud fail → fallback SLM → fallback template (ไม่ crash)
- [ ] G-Signal interrupt ตัด advice narration ได้ทันที
- [ ] persona text สอดคล้องกับ Maiden character
- [ ] redaction: ไม่ส่ง PII/raw G-Log ขึ้น cloud
