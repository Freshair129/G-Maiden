---
title: "G-Maiden Closed Beta Wave 1 Specification"
doc_id: "closed-beta-wave-1-specification"
status: "candidate"
version: "0.1.0"
updated: "2026-08-01"
owner: "Boss"
related_docs: ["BETA-ROADMAP", "CLOSED-BETA-WAVE-0-DOD"]
---

# Closed Beta Wave 1 — Core Intelligence Validation

Wave 1 starts only after Wave 0 passes its technical compatibility gate. The cohort expands to 30–100 approved testers and measures whether G-Signal warnings and G-Master advice are useful, timely, and non-disruptive during real matches.

## Included validation

- G-Signal danger/gank alerts and belief revision.
- G-Master advice with its accuracy disclaimer.
- False-alert and missed-alert review against operator-labelled match evidence.
- Voice interruption latency, crash-free sessions, updater safety, and local-only data behavior.

## Exit thresholds

| Metric | Required result |
| --- | ---: |
| Approved testers | ≥ 30 |
| Completed match sessions | ≥ 300 |
| Alert usefulness | ≥ 70% |
| False alerts | ≤ 15% |
| Missed alerts | ≤ 10% |
| Advice usefulness | ≥ 70% |
| G-Signal p99 | ≤ 300 ms |
| Crash-free sessions | ≥ 99% |
| Update success | ≥ 95% |
| Critical security/privacy findings | 0 |

Wave 1 does not authorize new AI features, cloud data sharing, or relaxing the local critical-path requirement. Every result must link to replay/session evidence and a severity-classified known-issues record.

The shared `beta-wave-evidence.mjs` validator contains separate Wave 1 and Wave 2 target maps; when invoked with `wave-1`, it evaluates only the Wave 1 map. Its common operational and privacy fields must all be explicitly `true`.

## Decision

`PASS` proceeds to Wave 2. `CONDITIONAL PASS` requires bounded exceptions with owner and deadline. `HOLD` keeps the cohort size unchanged. `FAIL` returns the candidate to Dev.
