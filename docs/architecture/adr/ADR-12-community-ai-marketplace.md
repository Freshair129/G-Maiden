---
title: "ADR: Community AI Marketplace"
doc_id: "ADR-12-community-ai-marketplace"
status: "Accepted"
version: "1.0.0"
updated: "2026-06-23"
owner: "Boss"
source_of_truth: true
related_docs: ["ADR-11", "docs/product/competitive-brief.md", "docs/product/business-requirements.md"]
---

# ADR: Community AI Marketplace

## Status
Accepted *(new product surface â€” post-v1.0)* Â· 2026-06-23

## Context
à¸‚à¹‰à¸­à¸ˆà¸³à¸à¸±à¸”: solo dev / no funding / no team â†’ à¹€à¸—à¸£à¸™à¹‚à¸¡à¹€à¸”à¸¥à¹€à¸­à¸‡à¸«à¸£à¸·à¸­à¸‹à¸·à¹‰à¸­ dataset à¹„à¸¡à¹ˆà¹„à¸«à¸§ à¹à¸¥à¸°à¸•à¹‰à¸­à¸‡à¸à¸²à¸£ **moat + engagement** à¸—à¸µà¹ˆà¸„à¸¹à¹ˆà¹à¸‚à¹ˆà¸‡à¸—à¸µà¹ˆà¸•à¸²à¸¢à¹„à¸› (GOSU.AI, Backseat AI) à¹„à¸¡à¹ˆà¸¡à¸µ

à¸œà¸¹à¹‰à¹€à¸¥à¹ˆà¸™ Dota à¹‚à¸•à¸¡à¸²à¸à¸±à¸š **Steam Workshop + Dota Arcade** = à¸šà¸£à¸´à¹‚à¸ à¸„ UGC à¹€à¸›à¹‡à¸™à¸›à¸à¸•à¸´ â†’ à¹€à¸«à¸¡à¸²à¸°à¸à¸±à¸šà¹‚à¸¡à¹€à¸”à¸¥ marketplace + creator economy

## Decision
à¹€à¸›à¸´à¸” **Community AI Marketplace**:
1. **Trainable surface (à¸‚à¸±à¹‰à¸™à¸šà¸±à¸™à¹„à¸”):** persona/à¹€à¸ªà¸µà¸¢à¸‡ â†’ advice-logic â†’ **bot** â€” user à¹€à¸—à¸£à¸™ AI à¹ƒà¸«à¹‰à¹à¸™à¸°à¸™à¸³/à¸•à¸­à¸š/à¹€à¸¥à¹ˆà¸™à¸•à¸²à¸¡à¸ªà¹„à¸•à¸¥à¹Œà¸•à¸™ à¹à¸¥à¹‰à¸§ publish
2. **Rating/ranking** â†’ trainer à¹„à¸”à¹‰ **revenue share** à¹€à¸¡à¸·à¹ˆà¸­à¸„à¸™à¸­à¸·à¹ˆà¸™à¹ƒà¸Šà¹‰à¸ªà¹„à¸•à¸¥à¹Œà¸•à¸™ â†’ top style à¸–à¸¹à¸à¸šà¸£à¸£à¸ˆà¸¸à¹€à¸›à¹‡à¸™ **preset à¸¡à¸²à¸•à¸£à¸à¸²à¸™** à¸‚à¸­à¸‡ G-Maiden
3. **Payout:** à¹€à¸‡à¸´à¸™à¸ªà¸”**à¸£à¸²à¸¢ season à¹€à¸‰à¸žà¸²à¸° top-rank trainer**; à¸—à¸µà¹ˆà¹€à¸«à¸¥à¸·à¸­à¹„à¸”à¹‰ credit/privilege Â· prize pool **self-fund à¸ˆà¸²à¸ take-rate** (à¹„à¸¡à¹ˆà¸à¸£à¸°à¸—à¸š runway)
4. ðŸ”´ **Bot guardrail:** bot à¸£à¸±à¸™à¹„à¸”à¹‰à¹€à¸‰à¸žà¸²à¸° **practice / sandbox / bot-match** (= Lua bot-scripting Workshop à¸—à¸µà¹ˆ Valve à¸£à¸­à¸‡à¸£à¸±à¸š) â€” bot à¹€à¸¥à¹ˆà¸™à¹à¸¡à¸•à¸Šà¹Œà¸„à¸™à¸ˆà¸£à¸´à¸‡ = automation = **à¹à¸šà¸™à¸—à¸±à¸™à¸—à¸µ**; à¸•à¹‰à¸­à¸‡à¸à¸±à¹‰à¸™à¸—à¸µà¹ˆà¸ªà¸–à¸²à¸›à¸±à¸•à¸¢à¸à¸£à¸£à¸¡ (à¸£à¸±à¸™à¹„à¸”à¹‰à¹€à¸‰à¸žà¸²à¸°à¹‚à¸«à¸¡à¸” vs-AI/custom, à¹„à¸¡à¹ˆà¸¡à¸µà¸—à¸²à¸‡ inject input à¹€à¸‚à¹‰à¸² live human match)
5. **Anti-gaming ranking:** à¸§à¸±à¸” **distinct active-users + retention** à¸–à¹ˆà¸§à¸‡à¸™à¹‰à¸³à¸«à¸™à¸±à¸ à¹„à¸¡à¹ˆà¹ƒà¸Šà¹ˆà¹‚à¸«à¸§à¸•/à¸”à¸²à¸§à¸™à¹Œà¹‚à¸«à¸¥à¸”à¸”à¸´à¸š (à¹€à¸‡à¸´à¸™à¸ªà¸”à¸¥à¹ˆà¸­à¹ƒà¸«à¹‰à¹‚à¸à¸‡)

## Consequences
### Positive
- **Network-effect moat** (trainerâ†‘â†’styleâ†‘â†’userâ†‘â†’trainerâ†‘) â€” à¸¥à¸­à¸à¹„à¸¡à¹ˆà¹„à¸”à¹‰à¸–à¹‰à¸²à¹„à¸¡à¹ˆà¸¡à¸µ community
- **Engagement engine** à¸•à¸­à¸šà¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¹ˆà¸¢à¸‡ adoption (à¸•à¸´à¸” trainer à¸„à¸™à¹‚à¸›à¸£à¸”, trainer à¸Šà¹ˆà¸§à¸¢à¹‚à¸•)
- à¸ªà¸²à¸¢à¸£à¸²à¸¢à¹„à¸”à¹‰à¹ƒà¸«à¸¡à¹ˆ (take-rate) + crowdsource à¸à¸²à¸£à¸ˆà¸¹à¸™à¹à¸—à¸™à¸à¸²à¸£à¸ˆà¹‰à¸²à¸‡ ML

### Negative
- à¸•à¹‰à¸­à¸‡à¸¡à¸µ quality control + moderation + verified tier
- payment rails à¸ªà¸³à¸«à¸£à¸±à¸š payout (à¹€à¸¥à¹‡à¸à¸¥à¸‡à¹€à¸žà¸£à¸²à¸°à¸ˆà¹ˆà¸²à¸¢à¹€à¸‰à¸žà¸²à¸° top-rank) + KYC/à¸ à¸²à¸©à¸µ
- cold-start (à¹„à¸à¹ˆà¸à¸±à¸šà¹„à¸‚à¹ˆ) â€” à¸•à¹‰à¸­à¸‡ seed à¸”à¹‰à¸§à¸¢à¸ªà¹„à¸•à¸¥à¹Œà¸œà¸¹à¹‰à¸à¹ˆà¸­à¸•à¸±à¹‰à¸‡ + à¹à¸„à¸ªà¹€à¸•à¸­à¸£à¹Œà¹„à¸—à¸¢à¸Šà¸¸à¸”à¹à¸£à¸

### Neutral / Trade-offs
- à¹€à¸›à¹‡à¸™ surface à¹ƒà¸«à¸¡à¹ˆ â†’ à¸ˆà¸±à¸”à¹€à¸›à¹‡à¸™ **post-v1.0** (roadmap à¸ˆà¸šà¸—à¸µà¹ˆ v1.0 à¸„à¸£à¸š 12 à¹‚à¸¡à¸”à¸¹à¸¥à¸à¹ˆà¸­à¸™)

## Alternatives Considered
| Alternative | Reason Rejected |
| --- | --- |
| Persona/à¹€à¸ªà¸µà¸¢à¸‡ à¸­à¸¢à¹ˆà¸²à¸‡à¹€à¸”à¸µà¸¢à¸§ | moat à¸•à¸·à¹‰à¸™ (cosmetic) â€” à¸¥à¸­à¸à¸‡à¹ˆà¸²à¸¢ |
| à¸ˆà¹ˆà¸²à¸¢à¹€à¸‡à¸´à¸™à¸ªà¸”à¸—à¸¸à¸ trainer | à¸•à¹‰à¸™à¸—à¸¸à¸™/legal à¸šà¸²à¸™ à¹€à¸à¸´à¸™à¸à¸³à¸¥à¸±à¸‡ solo dev |
| Bot à¹€à¸¥à¹ˆà¸™à¹à¸¡à¸•à¸Šà¹Œà¸„à¸™à¸ˆà¸£à¸´à¸‡ | automation = à¹à¸šà¸™à¸—à¸±à¸™à¸—à¸µ |
| Centralized model à¹€à¸”à¸µà¸¢à¸§ (à¹„à¸¡à¹ˆà¸¡à¸µ UGC) | à¸Šà¸°à¸•à¸²à¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸š GOSU/Backseat â€” à¹„à¸¡à¹ˆà¸¡à¸µ moat/engagement |

## Related Documents
- ADR-11 (opt-in data) Â· Competitive Brief Â§10.4 Â· BRD BR-05/07/10 Â· Pillar C

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-06-23 | Proposed â€” UGC marketplace, trainable depth, seasonal top-rank payout, bot guardrail |
| 1.0.0 | 2026-06-23 | Accepted (scheduled post-v1.0) |


