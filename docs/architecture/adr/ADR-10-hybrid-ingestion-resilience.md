---
title: "ADR: Hybrid Ingestion Resilience"
doc_id: "ADR-10-hybrid-ingestion-resilience"
status: "accepted"
version: "1.0.1"
updated: "2026-07-20"
owner: "Boss"
source_of_truth: true
related_docs: ["ADR-05", "ADR-03", "docs/product/competitive-brief.md", "docs/product/business-requirements.md"]
---

# ADR: Hybrid Ingestion Resilience

## Status
Accepted *(extends ADR-05)* · 2026-06-23

## Context
ปัจจุบัน G-Maiden รับข้อมูล 2 ทาง: **GSI** (own player state — HP/mana/gold/items) และ **minimap CV** (ตำแหน่งศัตรู — ADR-05, ONNX detector 128 ฮีโร่ shipped แล้ว). own-state ทั้งหมดมาจาก GSI ล้วน

**ความเสี่ยงเชิงดำรงอยู่:** Valve เป็นเจ้าของ GSI และเปลี่ยน/จำกัด/บล็อกได้ฝ่ายเดียว (ประวัติ: ban wave 40k บัญชี ก.พ. 2023 ที่อ่านข้อมูลไคลเอนต์, ทุบฟีเจอร์ Overwolf เงียบๆ ก.พ. 2021). ถ้าเป็น **GSI-only = single point of failure** — บล็อกเมื่อไหร่ผลิตภัณฑ์จบ

## Decision
รับข้อมูลแบบ **hybrid หลายชั้น**:
1. **GSI = primary fast path** (เหมือนเดิม)
2. **Extend minimap-CV pipeline ให้อ่าน own-state** (HP/mana/gold/clock จากแถบบนจอ) เป็น **fallback เมื่อ GSI ไม่พร้อม** — fallback path เท่านั้น ไม่อยู่บน hot path ปกติ (กัน resource budget); ใช้ headroom ~100x ที่ spike S-1 พิสูจน์แล้ว
3. **Pro-replay statistical priors** — ดึง replay สาธารณะ (OpenDota/STRATZ) มาทำ heatmap/gank-prediction prior โดยไม่ต้องเทรนโมเดลใหญ่ (ref: "Time to Die" — features observable, ~10k replay)

ออกแบบให้ vision อ่านเฉพาะสิ่งที่ผู้เล่นเห็นบนจอ (ban-safe, VAC ไม่จับ); ห้าม inject/อ่าน memory

## Consequences
### Positive
- **Resilience กลายเป็นจุดขาย** — รอดทั้งตอน GSI ถูกตัดและตอน vision ช้า (ไม่มีคู่แข่งมีสองแหล่ง)
- ใช้ CV pipeline + latency headroom ที่มีอยู่แล้ว → งานส่วนเพิ่มเล็ก
- pro-replay priors ยกระดับ prediction โดยไม่ต้องมีทุน/dataset

### Negative
- เพิ่มงาน CV (own-state reader) + ต้อง maintain 2 paths
- ตอน fallback: latency/accuracy แย่ลงกว่า GSI (ยอมรับได้เพราะ "ทำงานต่อได้" > "ตาย")

### Neutral / Trade-offs
- ต้องมี logic สลับ path + ทดสอบ GSI-block scenario เป็น acceptance

## Alternatives Considered
| Alternative | Reason Rejected |
| --- | --- |
| GSI-only | single point of failure — Valve บล็อก = จบ |
| Full-screen VLM อ่านทั้งจอ | ช้า 3–4s + กิน CPU/FPS เกิน budget |
| อ่าน game memory | โดนแบน (ban wave 2023) |

## Related Documents
- ADR-05 (enemy positions from minimap CV) · ADR-03 (critical path Rust-only)
- [[S-1-minimap-cv]] · [[competitive-brief|Competitive Brief]] §10.2 · [[business-requirements|BRD]] BR-03

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-06-23 | Proposed — hybrid GSI + CV own-state fallback + pro-replay priors |
| 1.0.0 | 2026-06-23 | Accepted |
| 1.0.1 | 2026-07-20 | Repair UTF-8 mojibake; no semantic change |


