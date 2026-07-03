# FEAT-G-MASTER — Strategic & Financial Advisor

> **Module:** G-Master · **Priority:** Core · **Phase:** 5
> **SRS:** §3.4 · **Eng Spec:** §2.4

---

## 1. Purpose

ให้คำแนะนำ skill build / item build ตามสถานการณ์เงิน (Net Worth) และไอเทมศัตรูที่มองเห็น.
ใช้ Claude (CLI Plan quota หรือ Anthropic API, `claude-haiku-4-5`) หรือ local SLM (ollama)
สำหรับ reasoning — **non-critical path** (ไม่มี latency budget เข้มงวด).

## 2. Input

| Source | Data |
| --- | --- |
| GSI tick | `player.net_worth`, `player.gold`, `hero.abilities`, `hero.items` |
| GSI (visible enemies) | `enemy.items` (เท่าที่ GSI เปิดเผย) |
| Meta dataset | Hero matchup data, item winrates, popular builds |

## 3. Logic

```
on advise(tick) request:
  ถ้าอยู่ในหน้าต่าง throttle (30s) → คืน last response (cached=true)
  prompt = build_prompt(tick)   // hero, KDA, net worth, gold, HP/mana, score, phase
                                 //   + counter_advice_text(enemies)
  backend = runtime::master_backend()   // Auto | Claude | Ollama
    Auto   → ลอง Claude ก่อน, ล้มเหลวค่อย fallback local SLM (ollama)
    Claude → Claude เท่านั้น
    Ollama → local SLM เท่านั้น
  emit Advice { text, cached }
```

- **Throttle:** flat 30s ต่อ request พร้อม cache คำตอบล่าสุด (`THROTTLE = 30s`, `master.rs`).
  *(planned: trigger ตาม gold change ±500 และ cap ≤2/min ยังไม่ได้ทำ)*
- **Cloud backend:** `claude` CLI (Plan quota) หรือ Anthropic Messages API (`claude-haiku-4-5`)
  เมื่อผู้ใช้ตั้ง API key; ไม่มี Gemini และไม่มี "Template" tier.
- **Meta dataset:** static dataset ของ counter-item builds (`counter_advice.rs`).
- **Counter-item logic:** `counter_advice.rs` มีจริง แต่ตอนนี้ถูกป้อน enemies เป็น list ว่าง
  (`counter_advice_text(&[])`) — จะได้ enemies จริงเมื่อ G-Sentry ต่อสายเข้ามา.

## 4. Output

โค้ดจริง (`master.rs`) — struct แบบเรียบ:

```rust
Advice {
    text: String,   // คำแนะนำที่ voiced แล้ว (ไทย, 1-2 ประโยค)
    cached: bool,   // true = คืนจาก throttle cache (UI ใช้บอกความ stale)
}
```

*(planned: struct ที่ละเอียดกว่า `Advice { topic, rationale, persona_text }` ยังไม่ได้ทำ —
ตอนนี้รวมเหตุผล + persona ไว้ใน `text` เดียว)*

→ ส่งเข้า **G-Sensory** (overlay display) + **Audio Engine** (narration queue, preemptible)

## 5. Persona Behavior

- อ่อนโยน + ฉลาด: *"ถ้าจะเอาชนะตัวนั้น ฉันแนะนำ MKB นะ"*
- Nerf CM self-deprecation: *"แต่ถ้าฉันมีเงินน้อยแบบทุกวันนี้ ฉันคงซื้อแค่ Ward แหละ..."*
- ไม่ aggressive / ไม่ judge ผู้เล่น: ให้ข้อมูล + แนะนำ ไม่บังคับ

## 6. Constraints

- **Non-critical:** ไม่มี hard latency budget; cloud timeout **30s** (`--max-time 30`); fallback local SLM (ollama)
- **Redaction:** prompt สร้างจาก GSI state (hero/KDA/net worth/gold) เท่านั้น — **ไม่มี G-Log/PII by construction**. *(planned: ยังไม่มี explicit redaction gate)*
- **Frequency:** throttle 30s ต่อ request. *(planned: cap ≤2 advice/min ยังไม่ได้ทำ)*
- **Preemptible:** G-Signal interrupt ได้เสมอ (advice ถูกตัดเมื่อ critical alert มา)

## 7. Dependencies

| ต้องการจาก | Module |
| --- | --- |
| Game state | GSI Server |
| LLM inference | Claude (CLI / Anthropic API `claude-haiku-4-5`) → local SLM (ollama) fallback |
| Meta data | Static dataset (per-patch) |
| → แสดงผล | **G-Sensory** (overlay) |
| → เสียง | Audio Engine (narration queue) |

## 8. Acceptance Criteria

- [ ] แนะนำ counter-item ได้ถูกต้องเทียบกับ meta (≥70% match rate) *(counter_advice.rs พร้อม แต่ยังป้อน enemies ว่าง)*
- [x] throttle: 30s ต่อ request + cache *(planned: cap 2/min)*
- [x] Claude fail → fallback local SLM (ไม่ crash)
- [x] G-Signal interrupt ตัด advice narration ได้ทันที
- [x] persona text สอดคล้องกับ Maiden character
- [x] prompt ไม่มี G-Log/PII by construction *(planned: explicit redaction gate)*
