---
title: "G-Maiden Public Demo Specification"
doc_id: "specification"
status: "draft"
version: "0.1.0"
updated: "2026-07-23"
owner: "Boss"
related_docs: ["BETA-ROADMAP", "product-requirements", "software-requirements-specification"]
---

# G-Maiden Public Demo Specification

## Objective

Public Demo เป็น web experience สำหรับอธิบาย G-Maiden และพาผู้ชมไปสู่ Closed Beta application โดยไม่ต้องติดตั้ง Desktop App หรือเชื่อม Dota 2 จริง

## Required Experience

```text
Product value
→ deterministic match scenario
→ G-Sentry/G-Motion/G-Signal explanation
→ voice and belief-revision preview
→ honest feature-status view
→ Closed Beta call-to-action
```

## Included

- Interactive or video-backed incoming-gank scenario
- Overlay simulation
- Enemy-missing duration and danger score
- G-Signal interrupt demonstration
- Voice transcript/captions
- Feature status: Shipped / Partial / Preview / Planned
- Closed Beta application
- Hardware and privacy FAQ

## Excluded

- Live screen capture
- Live Dota integration
- Payment
- Raw microphone input
- G-Voice live conversation
- G-Memory/G-Coach production behavior
- Claims that planned features are shipped

## Functional Requirements

1. Browser access without installation
2. Play, pause, restart and jump-to-event controls
3. Deterministic playback for repeatable review
4. Explanation for each critical alert
5. Audio mute/volume and captions
6. Responsive summary on mobile; full interaction may be desktop-only
7. Beta application flow collects only required tester information
8. Feature status must match current runtime evidence

## Privacy and Security

- No access to user files, screen or Dota process
- Demo scenarios use synthetic or de-identified data
- Marketing consent and beta-diagnostic consent are separate
- No client-side secrets
- Public forms are rate-limited and abuse-protected

## Success Metrics

| Metric | Initial target |
| --- | ---: |
| Demo start rate | ≥ 40% of landing visitors |
| Demo completion | ≥ 50% of starts |
| Beta CTA click | ≥ 10% of completions |
| Beta form completion | ≥ 60% of starts |
| Demo error rate | < 1% |

## Release Gate

- Scenario completes end-to-end
- Audio has captions
- Feature status is reviewed against code baseline
- Beta form and privacy notice work
- Desktop/mobile smoke tests pass
- No critical security finding
- Production deployment and rollback are verified

## Definition of Done

A new visitor can understand the product within 60 seconds, complete the core scenario, distinguish shipped from planned features, and apply for Closed Beta without manual support.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-23 | Initial Public Demo specification |
