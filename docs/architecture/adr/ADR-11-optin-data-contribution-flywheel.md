---
title: "ADR: Opt-in Data Contribution + match_id Flywheel"
doc_id: "ADR-11-optin-data-contribution-flywheel"
status: "accepted"
version: "1.0.1"
updated: "2026-07-20"
owner: "Boss"
source_of_truth: true
related_docs: ["ADR-06", "ADR-10", "docs/product/competitive-brief.md", "docs/product/business-requirements.md"]
---

# ADR: Opt-in Data Contribution + match_id Flywheel

## Status
Accepted *(amends ADR-06)* · 2026-06-23

## Context
ADR-06 + no-egress test (P8.2) + G-Memory `local_only` กำหนดให้ข้อมูลทั้งหมด **อยู่ local เท่านั้น ห้ามอัปโหลด** — เป็นทั้งจุดขาย (privacy-first) และข้อบังคับ NFR

แต่กลยุทธ์ moat (data flywheel, Pillar B) + community marketplace (ADR-12) **ต้อง upload** ข้อมูลบางส่วนเพื่อสร้าง dataset → **ขัดกับ ADR-06 โดยตรง** ต้องมีมติที่ชัด

**Insight เชิงข้อมูล:** GSI เห็นแค่ฝั่งตัวเอง (ไม่เห็น fog ศัตรู) แต่ที่สเกล แมตช์เดียวอาจมี user G-Maiden ทั้ง 2 ฝั่ง → จับคู่ `map.matchid` แล้วเย็บ GSI สองฝั่ง = **full-match ground truth** = labeled dataset ฟรีสำหรับ gank/heatmap prediction

## Decision
1. **local-first ยังเป็น default** — ADR-06 ยังคุมข้อมูลที่ผู้ใช้ไม่ได้ opt-in (อยู่ local 100%)
2. **เพิ่ม opt-in contribution แลก credit** — ผู้ใช้เลือกแชร์ได้เอง, ได้ reward; UX ต้อง consent ชัด + anonymize (เก็บตำแหน่ง/ฮีโร่/ผล ไม่เก็บ account id)
3. **match_id stitching** — เย็บ GSI ข้าม user ที่ opt-in 2 ฝั่ง → ground-truth prior
4. **Re-scope no-egress test (P8.2):** จาก "ห้ามรั่วทุกอย่าง" → **"ข้อมูลที่ไม่ opt-in ต้องไม่รั่ว 100%"**
5. 🔴 **Guardrail (non-negotiable):** ข้อมูลที่เย็บใช้ **post-match / aggregate prior เท่านั้น** — ห้ามป้อนตำแหน่งศัตรู*สด*กลับเข้าแมตช์เดิม (= maphack = เหตุ Valve แบน 40k บัญชี + ทุบ Overwolf). ข้อมูลจากแมตช์ X ใช้พยากรณ์ได้เฉพาะแมตช์อื่นในอนาคต
6. Cloud collector แยกจาก live path, downsample snapshot (ทุก ~2–5 วิ) คุมต้นทุน

## Consequences
### Positive
- ปลดล็อก **data network-effect moat** + dataset ฟรี (แก้ปัญหา no-funding/no-dataset)
- รักษา privacy promise ผ่าน opt-in (default ยัง local)

### Negative
- privacy messaging ต้องสื่อสารใหม่: "local-first, opt-in sharing"
- เพิ่ม cloud collector infra/cost + ต้องทำ consent UX + anonymization pipeline

### Neutral / Trade-offs
- coverage 2 ฝั่ง ≈ penetration² → flywheel kick-in ตอนสเกล (ช่วงแรกพึ่ง pro-replay priors จาก ADR-10); Thai-first ช่วย (matchmaking จับคนไทยลงแมตช์เดียวกัน)

## Alternatives Considered
| Alternative | Reason Rejected |
| --- | --- |
| Pure local (คง ADR-06 เดิมทั้งหมด) | ไม่มี dataset/moat — แพ้ระยะยาว |
| Silent upload | ทำลายความเชื่อใจ + ผิดสปิริต PRD privacy-first |
| Live cross-feed (ป้อนตำแหน่งสด) | maphack = แบนทันที |

## Related Documents
- ADR-06 (local-only) · [[ADR-10-hybrid-ingestion-resilience|ADR-10]] (hybrid ingestion) · [[ADR-12-community-ai-marketplace|ADR-12]] (marketplace)
- [[competitive-brief|Competitive Brief]] §10.3 · [[business-requirements|BRD]] BR-04 · Pillar B

## Changelog
| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-06-23 | Proposed — opt-in contribution + match_id flywheel; amends ADR-06 no-egress scope |
| 1.0.0 | 2026-06-23 | Accepted — ADR-06 no-egress re-scoped to "non-opted-in data only" |
| 1.0.1 | 2026-07-20 | Repair UTF-8 mojibake; no semantic change |

