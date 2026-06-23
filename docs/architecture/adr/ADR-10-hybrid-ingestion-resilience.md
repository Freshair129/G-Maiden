---
title: "ADR: Hybrid Ingestion Resilience"
doc_id: "ADR-10-hybrid-ingestion-resilience"
status: "Accepted"
version: "1.0.0"
updated: "2026-06-23"
owner: "Boss"
source_of_truth: true
related_docs: ["ADR-05", "ADR-03", "docs/product/competitive-brief.md", "docs/product/business-requirements.md"]
---

# ADR: Hybrid Ingestion Resilience

## Status
Accepted *(extends ADR-05)* Â· 2026-06-23

## Context
à¸›à¸±à¸ˆà¸ˆà¸¸à¸šà¸±à¸™ G-Maiden à¸£à¸±à¸šà¸‚à¹‰à¸­à¸¡à¸¹à¸¥ 2 à¸—à¸²à¸‡: **GSI** (own player state â€” HP/mana/gold/items) à¹à¸¥à¸° **minimap CV** (à¸•à¸³à¹à¸«à¸™à¹ˆà¸‡à¸¨à¸±à¸•à¸£à¸¹ â€” ADR-05, ONNX detector 128 à¸®à¸µà¹‚à¸£à¹ˆ shipped à¹à¸¥à¹‰à¸§). own-state à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”à¸¡à¸²à¸ˆà¸²à¸ GSI à¸¥à¹‰à¸§à¸™

**à¸„à¸§à¸²à¸¡à¹€à¸ªà¸µà¹ˆà¸¢à¸‡à¹€à¸Šà¸´à¸‡à¸”à¸³à¸£à¸‡à¸­à¸¢à¸¹à¹ˆ:** Valve à¹€à¸›à¹‡à¸™à¹€à¸ˆà¹‰à¸²à¸‚à¸­à¸‡ GSI à¹à¸¥à¸°à¹€à¸›à¸¥à¸µà¹ˆà¸¢à¸™/à¸ˆà¸³à¸à¸±à¸”/à¸šà¸¥à¹‡à¸­à¸à¹„à¸”à¹‰à¸à¹ˆà¸²à¸¢à¹€à¸”à¸µà¸¢à¸§ (à¸›à¸£à¸°à¸§à¸±à¸•à¸´: ban wave 40k à¸šà¸±à¸à¸Šà¸µ à¸.à¸ž. 2023 à¸—à¸µà¹ˆà¸­à¹ˆà¸²à¸™à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹„à¸„à¸¥à¹€à¸­à¸™à¸•à¹Œ, à¸—à¸¸à¸šà¸Ÿà¸µà¹€à¸ˆà¸­à¸£à¹Œ Overwolf à¹€à¸‡à¸µà¸¢à¸šà¹† à¸.à¸ž. 2021). à¸–à¹‰à¸²à¹€à¸›à¹‡à¸™ **GSI-only = single point of failure** â€” à¸šà¸¥à¹‡à¸­à¸à¹€à¸¡à¸·à¹ˆà¸­à¹„à¸«à¸£à¹ˆà¸œà¸¥à¸´à¸•à¸ à¸±à¸“à¸‘à¹Œà¸ˆà¸š

## Decision
à¸£à¸±à¸šà¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹à¸šà¸š **hybrid à¸«à¸¥à¸²à¸¢à¸Šà¸±à¹‰à¸™**:
1. **GSI = primary fast path** (à¹€à¸«à¸¡à¸·à¸­à¸™à¹€à¸”à¸´à¸¡)
2. **Extend minimap-CV pipeline à¹ƒà¸«à¹‰à¸­à¹ˆà¸²à¸™ own-state** (HP/mana/gold/clock à¸ˆà¸²à¸à¹à¸–à¸šà¸šà¸™à¸ˆà¸­) à¹€à¸›à¹‡à¸™ **fallback à¹€à¸¡à¸·à¹ˆà¸­ GSI à¹„à¸¡à¹ˆà¸žà¸£à¹‰à¸­à¸¡** â€” fallback path à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™ à¹„à¸¡à¹ˆà¸­à¸¢à¸¹à¹ˆà¸šà¸™ hot path à¸›à¸à¸•à¸´ (à¸à¸±à¸™ resource budget); à¹ƒà¸Šà¹‰ headroom ~100x à¸—à¸µà¹ˆ spike S-1 à¸žà¸´à¸ªà¸¹à¸ˆà¸™à¹Œà¹à¸¥à¹‰à¸§
3. **Pro-replay statistical priors** â€” à¸”à¸¶à¸‡ replay à¸ªà¸²à¸˜à¸²à¸£à¸“à¸° (OpenDota/STRATZ) à¸¡à¸²à¸—à¸³ heatmap/gank-prediction prior à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡à¹€à¸—à¸£à¸™à¹‚à¸¡à¹€à¸”à¸¥à¹ƒà¸«à¸à¹ˆ (ref: "Time to Die" â€” features observable, ~10k replay)

à¸­à¸­à¸à¹à¸šà¸šà¹ƒà¸«à¹‰ vision à¸­à¹ˆà¸²à¸™à¹€à¸‰à¸žà¸²à¸°à¸ªà¸´à¹ˆà¸‡à¸—à¸µà¹ˆà¸œà¸¹à¹‰à¹€à¸¥à¹ˆà¸™à¹€à¸«à¹‡à¸™à¸šà¸™à¸ˆà¸­ (ban-safe, VAC à¹„à¸¡à¹ˆà¸ˆà¸±à¸š); à¸«à¹‰à¸²à¸¡ inject/à¸­à¹ˆà¸²à¸™ memory

## Consequences
### Positive
- **Resilience à¸à¸¥à¸²à¸¢à¹€à¸›à¹‡à¸™à¸ˆà¸¸à¸”à¸‚à¸²à¸¢** â€” à¸£à¸­à¸”à¸—à¸±à¹‰à¸‡à¸•à¸­à¸™ GSI à¸–à¸¹à¸à¸•à¸±à¸”à¹à¸¥à¸°à¸•à¸­à¸™ vision à¸Šà¹‰à¸² (à¹„à¸¡à¹ˆà¸¡à¸µà¸„à¸¹à¹ˆà¹à¸‚à¹ˆà¸‡à¸¡à¸µà¸ªà¸­à¸‡à¹à¸«à¸¥à¹ˆà¸‡)
- à¹ƒà¸Šà¹‰ CV pipeline + latency headroom à¸—à¸µà¹ˆà¸¡à¸µà¸­à¸¢à¸¹à¹ˆà¹à¸¥à¹‰à¸§ â†’ à¸‡à¸²à¸™à¸ªà¹ˆà¸§à¸™à¹€à¸žà¸´à¹ˆà¸¡à¹€à¸¥à¹‡à¸
- pro-replay priors à¸¢à¸à¸£à¸°à¸”à¸±à¸š prediction à¹‚à¸”à¸¢à¹„à¸¡à¹ˆà¸•à¹‰à¸­à¸‡à¸¡à¸µà¸—à¸¸à¸™/dataset

### Negative
- à¹€à¸žà¸´à¹ˆà¸¡à¸‡à¸²à¸™ CV (own-state reader) + à¸•à¹‰à¸­à¸‡ maintain 2 paths
- à¸•à¸­à¸™ fallback: latency/accuracy à¹à¸¢à¹ˆà¸¥à¸‡à¸à¸§à¹ˆà¸² GSI (à¸¢à¸­à¸¡à¸£à¸±à¸šà¹„à¸”à¹‰à¹€à¸žà¸£à¸²à¸° "à¸—à¸³à¸‡à¸²à¸™à¸•à¹ˆà¸­à¹„à¸”à¹‰" > "à¸•à¸²à¸¢")

### Neutral / Trade-offs
- à¸•à¹‰à¸­à¸‡à¸¡à¸µ logic à¸ªà¸¥à¸±à¸š path + à¸—à¸”à¸ªà¸­à¸š GSI-block scenario à¹€à¸›à¹‡à¸™ acceptance

## Alternatives Considered
| Alternative | Reason Rejected |
| --- | --- |
| GSI-only | single point of failure â€” Valve à¸šà¸¥à¹‡à¸­à¸ = à¸ˆà¸š |
| Full-screen VLM à¸­à¹ˆà¸²à¸™à¸—à¸±à¹‰à¸‡à¸ˆà¸­ | à¸Šà¹‰à¸² 3â€“4s + à¸à¸´à¸™ CPU/FPS à¹€à¸à¸´à¸™ budget |
| à¸­à¹ˆà¸²à¸™ game memory | à¹‚à¸”à¸™à¹à¸šà¸™ (ban wave 2023) |

## Related Documents
- ADR-05 (enemy positions from minimap CV) Â· ADR-03 (critical path Rust-only)
- `docs/architecture/spikes/S-1-minimap-cv.md` Â· Competitive Brief Â§10.2 Â· BRD BR-03

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-06-23 | Proposed â€” hybrid GSI + CV own-state fallback + pro-replay priors |
| 1.0.0 | 2026-06-23 | Accepted |



