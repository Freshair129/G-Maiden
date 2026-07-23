---
title: "G-Maiden Beta and Release Roadmap"
doc_id: "beta-roadmap"
status: "draft"
version: "0.1.0"
updated: "2026-07-23"
owner: "Boss"
related_docs: ["roadmap", "RELEASE-CHANNEL-ARCHITECTURE", "PUBLIC-DEMO-SPEC", "CLOSED-BETA-WAVE-0-SPEC", "OPEN-BETA-SPEC"]
---

# G-Maiden Beta and Release Roadmap

## 1. Purpose

เอกสารนี้กำหนด release maturity roadmap โดยแยกจาก feature-development roadmap เดิม เพื่อให้การเลื่อน stage ขึ้นกับหลักฐาน ไม่ใช่เลขเวอร์ชันหรือวันกำหนดส่งเพียงอย่างเดียว

## 2. Stage Sequence

```text
Internal / Dev
→ Public Demo
→ Closed Beta Wave 0: Technical Preview
→ Closed Beta Wave 1: Core Intelligence Validation
→ Closed Beta Wave 2: Expanded Access
→ Open Beta
→ Release Candidate
→ Stable / General Availability
```

## 3. Stage Matrix

| Stage | Audience | Primary question | Promotion evidence |
| --- | --- | --- | --- |
| Dev | Developers | Build นี้ติดตั้งและเริ่มทำงานได้หรือไม่ | CI, smoke test, update isolation |
| Public Demo | Public viewers | ผู้ใช้เข้าใจคุณค่าของ G-Maiden หรือไม่ | demo completion, beta conversion |
| Closed Beta Wave 0 | 10–30 testers | Runtime ทำงานได้บนเครื่องจริงหลายแบบหรือไม่ | install/GSI/DXGI/update/FPS evidence |
| Closed Beta Wave 1 | 30–100 testers | Alert และ advice มีประโยชน์และไม่รบกวนหรือไม่ | false/missed/useful alert metrics |
| Closed Beta Wave 2 | 100–500 testers | Self-service, support และ compatibility scale ได้หรือไม่ | support load, coverage, retention |
| Open Beta | Public opt-in | คนทั่วไปใช้งานได้โดยไม่ต้องช่วยทีละคนหรือไม่ | onboarding, reliability, privacy, operations |
| Release Candidate | Selected/public | Build พร้อม freeze และ production sign-off หรือไม่ | regression/security/rollback evidence |
| Stable / GA | Public | พร้อมเป็นผลิตภัณฑ์ใช้งานจริงหรือไม่ | final approval and operations readiness |

## 4. Global Release Gates

ทุก stage ต้องผ่านเงื่อนไขร่วม:

- No unresolved S0 Critical issue
- Artifact signed and verifiable
- Release notes and known issues available
- Rollback or forward-fix path available
- Privacy classification reviewed
- Evidence linked from release record
- Stage-specific DoD completed

## 5. Immediate Roadmap

### Workstream A — Release Safety

1. Split candidate and promotion workflows
2. Add Dev and Stable update manifests/endpoints
3. Add runtime channel resolution
4. Add production approval gate
5. Verify same-artifact promotion
6. Test rollback/forward-fix procedure

### Workstream B — Public Demo

1. Define deterministic incoming-gank scenario
2. Implement overlay and alert simulation
3. Show shipped/partial/planned status honestly
4. Add beta application flow
5. Add privacy-safe analytics

### Workstream C — Closed Beta Wave 0

1. Add beta entitlement
2. Add first-run readiness checks
3. Add Compatibility Mode wording and diagnostics
4. Produce diagnostic bundle
5. Create tester application/feedback flow
6. Build compatibility test matrix
7. Run controlled rollout to 5 → 10 → 20–30 testers

### Workstream D — Open Beta Readiness

1. Self-service onboarding
2. Scalable support and incident workflow
3. Compatibility matrix sign-off
4. Privacy/Terms review
5. Forced minimum version and kill switch
6. Public download and update capacity validation

## 6. Dependency Order

```text
Release channel architecture
  ├── candidate workflow
  ├── channel manifests
  ├── runtime channel resolution
  └── promotion workflow
          ↓
Dev channel validation
          ↓
Closed Beta Wave 0 rollout
          ↓
Closed Beta Wave 1 intelligence validation
          ↓
Open Beta readiness
```

Public Demo can be developed in parallel but does not replace Desktop Beta validation.

## 7. Version Policy

- Stage names are not tied permanently to specific version numbers
- Every candidate uses a unique SemVer
- Failed candidate versions are never overwritten
- Stable may skip rejected candidate versions
- Release channel and artifact promotion status are recorded separately from product feature status

## 8. Ownership

| Area | Accountable role |
| --- | --- |
| Release architecture | Release Engineer / System Architect |
| Candidate validation | Developer/Internal QA |
| Promotion approval | Product owner / Boss |
| Beta operations | Product + QA |
| Security/privacy gate | Security owner |
| Stable release | Release owner |

## 9. Exit from Roadmap Stage

A stage is complete only when:

1. All mandatory gates are marked Pass
2. Evidence links are present
3. Known failures are classified and accepted or fixed
4. Promotion decision is recorded
5. Next-stage entry conditions are satisfied

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-23 | Initial evidence-gated beta and release roadmap |
