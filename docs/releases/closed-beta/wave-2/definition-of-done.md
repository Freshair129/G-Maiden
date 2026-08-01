---
title: "Closed Beta Wave 2 Definition of Done"
doc_id: "closed-beta-wave-2-dod"
status: "candidate"
version: "0.1.0"
updated: "2026-08-01"
owner: "Boss"
related_docs: ["CLOSED-BETA-WAVE-2-SPECIFICATION", "OPEN-BETA-SPEC"]
---

# Wave 2 Definition of Done and Exit Gate

## Entry gate

- [ ] Wave 1 is `PASS` or has an approved bounded `CONDITIONAL PASS`.
- [ ] Self-service access, revocation, pause, rollback, and diagnostics are exercised.
- [ ] Support owner, severity policy, and incident route are active.
- [ ] Public-facing compatibility limitations and privacy boundaries are ready.
- [ ] No unresolved S0 or unmitigated S1 exists.

## Exit gate

The Wave 2 evidence packet passes `scripts/releases/beta-wave-evidence.mjs` for `wave-2`, all thresholds in the specification are met, support and retention evidence are linked, and the release owner records the decision.

## Required evidence

- Cohort, install, first-run, update, and retention report.
- Support response/resolution report and severity-classified known issues.
- Rollout pause, revoke, rollback/forward-fix, and incident drill evidence.
- Privacy/security review confirming no raw match/CV egress.
