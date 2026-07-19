---
title: "ADR: Opt-in Data Contribution + match_id Flywheel"
doc_id: "ADR-11-optin-data-contribution-flywheel"
status: "accepted"
version: "1.0.0"
updated: "2026-06-23"
owner: "Boss"
source_of_truth: true
related_docs: ["ADR-06", "ADR-10", "docs/product/competitive-brief.md", "docs/product/business-requirements.md"]
---

# ADR: Opt-in Data Contribution + match_id Flywheel

## Status
Accepted *(amends ADR-06)* Â· 2026-06-23

## Context
ADR-06 + no-egress test (P8.2) + G-Memory `local_only` à¸à¸³à¸«à¸™à¸”à¹ƒà¸«à¹‰à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸” **à¸­à¸¢à¸¹à¹ˆ local à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™ à¸«à¹‰à¸²à¸¡à¸­à¸±à¸›à¹‚à¸«à¸¥à¸”** â€” à¹€à¸›à¹‡à¸™à¸—à¸±à¹‰à¸‡à¸ˆà¸¸à¸”à¸‚à¸²à¸¢ (privacy-first) à¹à¸¥à¸°à¸‚à¹‰à¸­à¸šà¸±à¸‡à¸„à¸±à¸š NFR

à¹à¸•à¹ˆà¸à¸¥à¸¢à¸¸à¸—à¸˜à¹Œ moat (data flywheel, Pillar B) + community marketplace (ADR-12) **à¸•à¹‰à¸­à¸‡ upload** à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸šà¸²à¸‡à¸ªà¹ˆà¸§à¸™à¹€à¸žà¸·à¹ˆà¸­à¸ªà¸£à¹‰à¸²à¸‡ dataset â†’ **à¸‚à¸±à¸”à¸à¸±à¸š ADR-06 à¹‚à¸”à¸¢à¸•à¸£à¸‡** à¸•à¹‰à¸­à¸‡à¸¡à¸µà¸¡à¸•à¸´à¸—à¸µà¹ˆà¸Šà¸±à¸”

**Insight à¹€à¸Šà¸´à¸‡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥:** GSI à¹€à¸«à¹‡à¸™à¹à¸„à¹ˆà¸à¸±à¹ˆà¸‡à¸•à¸±à¸§à¹€à¸­à¸‡ (à¹„à¸¡à¹ˆà¹€à¸«à¹‡à¸™ fog à¸¨à¸±à¸•à¸£à¸¹) à¹à¸•à¹ˆà¸—à¸µà¹ˆà¸ªà¹€à¸à¸¥ à¹à¸¡à¸•à¸Šà¹Œà¹€à¸”à¸µà¸¢à¸§à¸­à¸²à¸ˆà¸¡à¸µ user G-Maiden à¸—à¸±à¹‰à¸‡ 2 à¸à¸±à¹ˆà¸‡ â†’ à¸ˆà¸±à¸šà¸„à¸¹à¹ˆ `map.matchid` à¹à¸¥à¹‰à¸§à¹€à¸¢à¹‡à¸š GSI à¸ªà¸­à¸‡à¸à¸±à¹ˆà¸‡ = **full-match ground truth** = labeled dataset à¸Ÿà¸£à¸µà¸ªà¸³à¸«à¸£à¸±à¸š gank/heatmap prediction

## Decision
1. **local-first à¸¢à¸±à¸‡à¹€à¸›à¹‡à¸™ default** â€” ADR-06 à¸¢à¸±à¸‡à¸„à¸¸à¸¡à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸—à¸µà¹ˆà¸œà¸¹à¹‰à¹ƒà¸Šà¹‰à¹„à¸¡à¹ˆà¹„à¸”à¹‰ opt-in (à¸­à¸¢à¸¹à¹ˆ local 100%)
2. **à¹€à¸žà¸´à¹ˆà¸¡ opt-in contribution à¹à¸¥à¸ credit** â€” à¸œà¸¹à¹‰à¹ƒà¸Šà¹‰à¹€à¸¥à¸·à¸­à¸à¹à¸Šà¸£à¹Œà¹„à¸”à¹‰à¹€à¸­à¸‡, à¹„à¸”à¹‰ reward; UX à¸•à¹‰à¸­à¸‡ consent à¸Šà¸±à¸” + anonymize (à¹€à¸à¹‡à¸šà¸•à¸³à¹à¸«à¸™à¹ˆà¸‡/à¸®à¸µà¹‚à¸£à¹ˆ/à¸œà¸¥ à¹„à¸¡à¹ˆà¹€à¸à¹‡à¸š account id)
3. **match_id stitching** â€” à¹€à¸¢à¹‡à¸š GSI à¸‚à¹‰à¸²à¸¡ user à¸—à¸µà¹ˆ opt-in 2 à¸à¸±à¹ˆà¸‡ â†’ ground-truth prior
4. **Re-scope no-egress test (P8.2):** à¸ˆà¸²à¸ "à¸«à¹‰à¸²à¸¡à¸£à¸±à¹ˆà¸§à¸—à¸¸à¸à¸­à¸¢à¹ˆà¸²à¸‡" â†’ **"à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸—à¸µà¹ˆà¹„à¸¡à¹ˆ opt-in à¸•à¹‰à¸­à¸‡à¹„à¸¡à¹ˆà¸£à¸±à¹ˆà¸§ 100%"**
5. ðŸ”´ **Guardrail (non-negotiable):** à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸—à¸µà¹ˆà¹€à¸¢à¹‡à¸šà¹ƒà¸Šà¹‰ **post-match / aggregate prior à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™** â€” à¸«à¹‰à¸²à¸¡à¸›à¹‰à¸­à¸™à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸¨à¸±à¸•à¸£à¸¹*à¸ªà¸”*à¸à¸¥à¸±à¸šà¹€à¸‚à¹‰à¸²à¹à¸¡à¸•à¸Šà¹Œà¹€à¸”à¸´à¸¡ (= maphack = à¹€à¸«à¸•à¸¸ Valve à¹à¸šà¸™ 40k à¸šà¸±à¸à¸Šà¸µ + à¸—à¸¸à¸š Overwolf). à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸ˆà¸²à¸à¹à¸¡à¸•à¸Šà¹Œ X à¹ƒà¸Šà¹‰à¸žà¸¢à¸²à¸à¸£à¸“à¹Œà¹„à¸”à¹‰à¹€à¸‰à¸žà¸²à¸°à¹à¸¡à¸•à¸Šà¹Œà¸­à¸·à¹ˆà¸™à¹ƒà¸™à¸­à¸™à¸²à¸„à¸•
6. Cloud collector à¹à¸¢à¸à¸ˆà¸²à¸ live path, downsample snapshot (à¸—à¸¸à¸ ~2â€“5 à¸§à¸´) à¸„à¸¸à¸¡à¸•à¹‰à¸™à¸—à¸¸à¸™

## Consequences
### Positive
- à¸›à¸¥à¸”à¸¥à¹‡à¸­à¸ **data network-effect moat** + dataset à¸Ÿà¸£à¸µ (à¹à¸à¹‰à¸›à¸±à¸à¸«à¸² no-funding/no-dataset)
- à¸£à¸±à¸à¸©à¸² privacy promise à¸œà¹ˆà¸²à¸™ opt-in (default à¸¢à¸±à¸‡ local)

### Negative
- privacy messaging à¸•à¹‰à¸­à¸‡à¸ªà¸·à¹ˆà¸­à¸ªà¸²à¸£à¹ƒà¸«à¸¡à¹ˆ: "local-first, opt-in sharing"
- à¹€à¸žà¸´à¹ˆà¸¡ cloud collector infra/cost + à¸•à¹‰à¸­à¸‡à¸—à¸³ consent UX + anonymization pipeline

### Neutral / Trade-offs
- coverage 2 à¸à¸±à¹ˆà¸‡ â‰ˆ penetrationÂ² â†’ flywheel kick-in à¸•à¸­à¸™à¸ªà¹€à¸à¸¥ (à¸Šà¹ˆà¸§à¸‡à¹à¸£à¸à¸žà¸¶à¹ˆà¸‡ pro-replay priors à¸ˆà¸²à¸ ADR-10); Thai-first à¸Šà¹ˆà¸§à¸¢ (matchmaking à¸ˆà¸±à¸šà¸„à¸™à¹„à¸—à¸¢à¸¥à¸‡à¹à¸¡à¸•à¸Šà¹Œà¹€à¸”à¸µà¸¢à¸§à¸à¸±à¸™)

## Alternatives Considered
| Alternative | Reason Rejected |
| --- | --- |
| Pure local (à¸„à¸‡ ADR-06 à¹€à¸”à¸´à¸¡à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”) | à¹„à¸¡à¹ˆà¸¡à¸µ dataset/moat â€” à¹à¸žà¹‰à¸£à¸°à¸¢à¸°à¸¢à¸²à¸§ |
| Silent upload | à¸—à¸³à¸¥à¸²à¸¢à¸„à¸§à¸²à¸¡à¹€à¸Šà¸·à¹ˆà¸­à¹ƒà¸ˆ + à¸œà¸´à¸”à¸ªà¸›à¸´à¸£à¸´à¸• PRD privacy-first |
| Live cross-feed (à¸›à¹‰à¸­à¸™à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸ªà¸”) | maphack = à¹à¸šà¸™à¸—à¸±à¸™à¸—à¸µ |

## Related Documents
- ADR-06 (local-only) Â· [[ADR-10-hybrid-ingestion-resilience|ADR-10]] (hybrid ingestion) Â· [[ADR-12-community-ai-marketplace|ADR-12]] (marketplace)
- [[competitive-brief|Competitive Brief]] Â§10.3 Â· [[business-requirements|BRD]] BR-04 Â· Pillar B

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-06-23 | Proposed â€” opt-in contribution + match_id flywheel; amends ADR-06 no-egress scope |
| 1.0.0 | 2026-06-23 | Accepted â€” ADR-06 no-egress re-scoped to "non-opted-in data only" |


