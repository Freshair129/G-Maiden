---
title: "ADR: Community AI Marketplace"
doc_id: "ADR-12-community-ai-marketplace"
status: "accepted"
version: "1.0.1"
updated: "2026-07-20"
owner: "Boss"
source_of_truth: true
related_docs: ["ADR-11", "docs/product/competitive-brief.md", "docs/product/business-requirements.md"]
---

# ADR: Community AI Marketplace

## Status
Accepted *(new product surface — post-v1.0)* · 2026-06-23

## Context
ข้อจำกัด: solo dev / no funding / no team → เทรนโมเดลเองหรือซื้อ dataset ไม่ไหว และต้องการ **moat + engagement** ที่คู่แข่งที่ตายไป (GOSU.AI, Backseat AI) ไม่มี

ผู้เล่น Dota โตมากับ **Steam Workshop + Dota Arcade** = บริโภค UGC เป็นปกติ → เหมาะกับโมเดล marketplace + creator economy

## Decision
เปิด **Community AI Marketplace**:
1. **Trainable surface (ขั้นบันได):** persona/เสียง → advice-logic → **bot** — user เทรน AI ให้แนะนำ/ตอบ/เล่นตามสไตล์ตน แล้ว publish
2. **Rating/ranking** → trainer ได้ **revenue share** เมื่อคนอื่นใช้สไตล์ตน → top style ถูกบรรจุเป็น **preset มาตรฐาน** ของ G-Maiden
3. **Payout:** เงินสด**ราย season เฉพาะ top-rank trainer**; ที่เหลือได้ credit/privilege · prize pool **self-fund จาก take-rate** (ไม่กระทบ runway)
4. 🔴 **Bot guardrail:** bot รันได้เฉพาะ **practice / sandbox / bot-match** (= Lua bot-scripting Workshop ที่ Valve รองรับ) — bot เล่นแมตช์คนจริง = automation = **แบนทันที**; ต้องกั้นที่สถาปัตยกรรม (รันได้เฉพาะโหมด vs-AI/custom, ไม่มีทาง inject input เข้า live human match)
5. **Anti-gaming ranking:** วัด **distinct active-users + retention** ถ่วงน้ำหนัก ไม่ใช่โหวต/ดาวน์โหลดดิบ (เงินสดล่อให้โกง)

## Consequences
### Positive
- **Network-effect moat** (trainer↑→style↑→user↑→trainer↑) — ลอกไม่ได้ถ้าไม่มี community
- **Engagement engine** ตอบความเสี่ยง adoption (ติด trainer คนโปรด, trainer ช่วยโต)
- สายรายได้ใหม่ (take-rate) + crowdsource การจูนแทนการจ้าง ML

### Negative
- ต้องมี quality control + moderation + verified tier
- payment rails สำหรับ payout (เล็กลงเพราะจ่ายเฉพาะ top-rank) + KYC/ภาษี
- cold-start (ไก่กับไข่) — ต้อง seed ด้วยสไตล์ผู้ก่อตั้ง + แคสเตอร์ไทยชุดแรก

### Neutral / Trade-offs
- เป็น surface ใหม่ → จัดเป็น **post-v1.0** (roadmap จบที่ v1.0 ครบ 12 โมดูลก่อน)

## Alternatives Considered
| Alternative | Reason Rejected |
| --- | --- |
| Persona/เสียง อย่างเดียว | moat ตื้น (cosmetic) — ลอกง่าย |
| จ่ายเงินสดทุก trainer | ต้นทุน/legal บาน เกินกำลัง solo dev |
| Bot เล่นแมตช์คนจริง | automation = แบนทันที |
| Centralized model เดียว (ไม่มี UGC) | ชะตาเดียวกับ GOSU/Backseat — ไม่มี moat/engagement |

## Related Documents
- [[ADR-11-optin-data-contribution-flywheel|ADR-11]] (opt-in data) · [[competitive-brief|Competitive Brief]] §10.4 · [[business-requirements|BRD]] BR-05/07/10 · Pillar C

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-06-23 | Proposed — UGC marketplace, trainable depth, seasonal top-rank payout, bot guardrail |
| 1.0.0 | 2026-06-23 | Accepted (scheduled post-v1.0) |
| 1.0.1 | 2026-07-20 | Repair UTF-8 mojibake; no semantic change |

