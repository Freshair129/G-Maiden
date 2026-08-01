---
title: "Closed Beta Wave 1 Definition of Done"
doc_id: "definition-of-done"
status: "draft"
version: "0.1.0"
updated: "2026-08-01"
owner: "Boss"
related_docs: ["CLOSED-BETA-WAVE-1-SPECIFICATION", "CLOSED-BETA-WAVE-0-DOD"]
---

# Wave 1 Definition of Done and Exit Gate

## Entry gate

- [ ] Wave 0 technical gate is `PASS` or an approved bounded `CONDITIONAL PASS`.
- [ ] Candidate is signed and its Dev/Stable isolation evidence is attached.
- [ ] Approved tester access, revocation, rollout pause, and diagnostic consent work.
- [ ] No unresolved S0 or release-blocking S1 exists.

## Exit gate

The Wave 1 evidence packet passes `scripts/releases/beta-wave-evidence.mjs` for `wave-1`, all thresholds in the specification are met, alert/advice evidence is linked, and a named approver records the decision.

## Required evidence

- Per-session alert labels sufficient to calculate usefulness, false, and missed alerts.
- G-Signal p99 latency report from the real runtime.
- Advice usefulness review with reviewer method recorded.
- Crash/update/privacy/security reports.
- Known issues and any accepted exceptions.
