---
title: "Open Beta Definition of Done"
doc_id: "definition-of-done"
status: "draft"
version: "0.1.0"
updated: "2026-07-23"
owner: "Boss"
related_docs: ["OPEN-BETA-SPEC", "BETA-ROADMAP"]
---

# Open Beta Definition of Done and Exit Gate

## Entry Gate

- [ ] Closed Beta technical and intelligence gates passed
- [ ] Public installer/download is self-service
- [ ] Open Beta update channel is isolated from Stable
- [ ] Terms, Privacy Notice and Beta disclaimer are published
- [ ] Public support and incident routes are active
- [ ] Forced minimum version and rollout pause work
- [ ] Compatibility matrix and known issues are public
- [ ] No unresolved S0 or unmitigated S1

## Exit Metrics

| Gate | Target | Actual | Status | Evidence |
| --- | ---: | ---: | --- | --- |
| Self-service installation | ≥ 95% | — | Pending | — |
| First-run completion | ≥ 90% | — | Pending | — |
| Crash-free sessions | ≥ 99.5% | — | Pending | — |
| Update success | ≥ 98% | — | Pending | — |
| Manual-support dependency | < 10% | — | Pending | — |
| G-Signal p99 | ≤ 300 ms | — | Pending | — |
| CPU/RAM/FPS NFR | Pass | — | Pending | — |
| Unresolved S0 | 0 | — | Pending | — |
| Unmitigated S1 | 0 | — | Pending | — |
| Privacy incidents | 0 | — | Pending | — |

## Product and Experience Gate

- [ ] Core value is understandable during onboarding
- [ ] Alert usefulness has an accepted baseline
- [ ] False and missed alerts are measured
- [ ] Feature flags and fallback states are honest
- [ ] Users can disable alerts, delete local data and submit feedback
- [ ] Top support issues have self-service guidance

## Operational Gate

- [ ] Release dashboard or evidence report exists
- [ ] Incident owner and severity policy exist
- [ ] Rollout pause has been exercised
- [ ] Rollback or emergency forward-fix has been exercised
- [ ] Update/download/auth capacity is monitored
- [ ] Support workload is within planned capacity
- [ ] Public communication channel is ready

## Release Candidate Entry

Open Beta may promote to Release Candidate only when:

1. Feature scope is frozen
2. Only bug fixes and release blockers remain
3. Compatibility exceptions are documented and accepted
4. Security/privacy review passes
5. Installer, updater and migration regression pass
6. Operations and support approve production readiness

## Decision Record

```yaml
stage: open-beta
candidate_version: ""
decision: pending
approved_by: ""
approved_date: ""
known_exceptions: []
evidence_links: []
next_stage: release-candidate
```

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-23 | Initial Open Beta entry, DoD and exit gates |
