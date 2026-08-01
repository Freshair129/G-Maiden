---
title: "G-Maiden Closed Beta Wave 2 Specification"
doc_id: "closed-beta-wave-2-specification"
status: "candidate"
version: "0.1.0"
updated: "2026-08-01"
owner: "Boss"
related_docs: ["BETA-ROADMAP", "CLOSED-BETA-WAVE-1-DOD", "OPEN-BETA-SPEC"]
---

# Closed Beta Wave 2 — Expanded Access and Operations Validation

Wave 2 starts only after Wave 1 passes core-intelligence validation. The cohort expands to 100–500 approved testers and validates self-service operation, support capacity, compatibility scale, retention, and safe incident response.

## Included validation

- Self-service entitlement, install, first-run, update, revoke, and rollout pause.
- Compatibility coverage across the supported Windows/display/GPU matrix.
- Support intake, first response, resolution, known-issues guidance, and incident ownership.
- Retention and repeat-session evidence without uploading raw match/CV data.

## Exit thresholds

| Metric | Required result |
| --- | ---: |
| Approved testers | ≥ 100 |
| Completed match sessions | ≥ 1,000 |
| Self-service installation | ≥ 95% |
| First-run completion | ≥ 90% |
| Support first response | ≤ 24 hours |
| Issues resolved within target | ≥ 90% |
| 14-day retention | ≥ 60% |
| Crash-free sessions | ≥ 99% |
| Update success | ≥ 98% |
| Critical security/privacy findings | 0 |

Wave 2 may not silently broaden access to Stable, weaken updater signatures, or introduce payment. Any compatibility exception must be public, severity-classified, and owned.

The shared `beta-wave-evidence.mjs` validator contains separate Wave 1 and Wave 2 target maps; when invoked with `wave-2`, it evaluates only the Wave 2 map. Its common operational and privacy fields must all be explicitly `true`.

## Decision

`PASS` permits Open Beta entry review. `CONDITIONAL PASS` requires bounded exceptions and an expiry date. `HOLD` pauses cohort expansion. `FAIL` returns the release to the previous controlled channel.
