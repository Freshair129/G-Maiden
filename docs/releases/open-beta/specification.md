---
title: "G-Maiden Open Beta Specification"
doc_id: "OPEN-BETA-SPEC"
status: "draft"
version: "0.1.0"
updated: "2026-07-23"
owner: "Boss"
related_docs: ["BETA-ROADMAP", "OPEN-BETA-DOD", "RELEASE-CHANNEL-ARCHITECTURE"]
---

# G-Maiden Open Beta Specification

## Objective

Open Beta พิสูจน์ว่าผู้ใช้ทั่วไปสามารถค้นหา ดาวน์โหลด ติดตั้ง ตั้งค่า ใช้งาน อัปเดต และขอความช่วยเหลือได้ด้วยตนเอง โดยทีมไม่ต้องดูแลเป็นรายคน

## Entry Preconditions

- Closed Beta Wave 0 passed technical compatibility gate
- Closed Beta Wave 1 produced alert-quality evidence
- Closed Beta Wave 2 demonstrated controlled scale and support readiness
- Public legal/privacy/support materials are ready
- Public update channel can be paused or rolled back

## Audience and Access

- Public opt-in users
- No manual approval required
- Clear Beta notice and known limitations
- Stable users may remain on Stable; Open Beta is an explicit channel choice until GA policy changes

## Required Capabilities

- Self-service download and onboarding
- Hardware/readiness diagnostics
- Automatic update with channel isolation
- Public known-issues page
- In-app feedback and diagnostic consent
- Compatibility guidance
- Privacy controls and delete-local-data flow
- Incident banner and forced minimum version
- Support triage workflow

## Feature Policy

Only features with real runtime behavior may be enabled by default. Partial features must be labelled Beta and have graceful fallback. Planned features must not be represented as available.

Payment remains gated until legal, refund, fraud, webhook, ledger reconciliation and support procedures are approved independently.

## Operational Requirements

- Release monitoring and alerting
- On-call/incident owner
- Support severity and response targets
- Rollout pause and update kill switch
- Forward-fix and rollback procedures
- Capacity monitoring for download, auth and backend services
- Public status communication path

## Success Metrics

| Area | Initial target |
| --- | ---: |
| Self-service install | ≥ 95% |
| First-run completion | ≥ 90% |
| Crash-free sessions | ≥ 99.5% |
| Update success | ≥ 98% |
| Users requiring manual support | < 10% |
| Unresolved S0 | 0 |
| Unmitigated S1 at promotion | 0 |
| Privacy incidents | 0 |

Product metrics such as activation, useful-alert rate and return rate must be baselined and reviewed, but technical safety gates cannot be waived by growth metrics.

## Exit Target

Open Beta exits to Release Candidate when product scope is frozen, operations are ready, compatibility coverage is accepted, regression/security testing passes and no release-blocking issue remains.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-23 | Initial Open Beta specification |
