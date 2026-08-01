---
title: "Closed Beta Wave 0 Definition of Done"
doc_id: "definition-of-done"
status: "draft"
version: "0.1.0"
updated: "2026-07-23"
owner: "Boss"
related_docs: ["CLOSED-BETA-WAVE-0-SPEC", "BETA-ROADMAP"]
---

# Closed Beta Wave 0 Definition of Done and Exit Gate

## Entry Gate

Wave 0 may begin only when all items are Pass:

- [ ] Dev and Stable update channels are isolated
- [ ] Candidate promotion does not rebuild the artifact
- [ ] Signed installer and updater artifacts are available
- [ ] Beta entitlement or invite access works
- [ ] First-run readiness flow works
- [ ] Compatibility Mode works and is clearly disclosed
- [ ] Diagnostic bundle can be created
- [ ] Feedback/bug intake is available
- [ ] Release notes and known issues are published
- [ ] No known S0 or unresolved release-blocking S1

## Technical Exit Metrics

| Gate | Target | Actual | Status | Evidence |
| --- | ---: | ---: | --- | --- |
| Approved testers | ≥ 20 | — | Pending | — |
| Completed match sessions | ≥ 100 | — | Pending | — |
| Installer success | ≥ 95% | — | Pending | — |
| First-run completion | ≥ 90% | — | Pending | — |
| GSI connection success | ≥ 95% | — | Pending | — |
| DXGI capture success | ≥ 90% | — | Pending | — |
| Minimap readiness | ≥ 85% | — | Pending | — |
| Crash-free sessions | ≥ 99% | — | Pending | — |
| Match without restart | ≥ 90% | — | Pending | — |
| Update success | ≥ 95% | — | Pending | — |
| Diagnostic bundle success | ≥ 95% | — | Pending | — |
| G-Signal p99 | ≤ 300 ms | — | Pending | — |
| Background CPU | ≤ 2.5% | — | Pending | — |
| Application RAM | ≤ 400 MB | — | Pending | — |
| Dota FPS impact | ≤ 3% | — | Pending | — |
| Critical security/privacy findings | 0 | — | Pending | — |

## Coverage Gate

The machine validator accepts `pass` for every required coverage item. `ultrawide` may instead be recorded as `unsupported` only when that limitation and its user impact are explicitly documented in `known-issues.md`; all other coverage items must be `pass`.

- [ ] Windows 10 covered
- [ ] Windows 11 covered
- [ ] 1080p covered
- [ ] 1440p covered
- [ ] Ultrawide covered or explicitly unsupported
- [ ] Single monitor covered
- [ ] Multi-monitor covered
- [ ] Borderless covered
- [ ] Windowed covered
- [ ] Exclusive-fullscreen fallback behavior documented
- [ ] Multiple NVIDIA GPU generations covered

## Operational Gate

- [ ] Rollout can pause without shipping a new build
- [ ] Beta access can be revoked
- [ ] Stable users cannot see candidate updates
- [ ] Known issues are severity-classified
- [ ] S0/S1 response owner is identified
- [ ] Rollback/forward-fix drill completed
- [ ] Diagnostic evidence can support root-cause analysis
- [ ] Support workload and common failures are summarized

## Privacy and Security Gate

- [ ] G-Log and match data remain local by default
- [ ] CV frames are not uploaded by default
- [ ] Diagnostic upload requires explicit consent
- [ ] Secrets and tokens are excluded from bundles
- [ ] Update signatures are verified
- [ ] No game-memory reading, process injection or code hooking
- [ ] No unresolved S0 security issue

## Exit Decision

Wave 0 result must be one of:

- `PASS` — all mandatory gates pass; proceed to Wave 1
- `CONDITIONAL PASS` — bounded exceptions have owner, deadline and accepted risk
- `HOLD` — continue Wave 0; no cohort expansion
- `FAIL` — stop rollout and return to Dev channel

## Required Approval Record

```yaml
stage: closed-beta-wave-0
candidate_version: ""
decision: pending
approved_by: ""
approved_date: ""
known_exceptions: []
evidence_links: []
next_stage: closed-beta-wave-1
```

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-07-23 | Initial Wave 0 entry gate, DoD and exit metrics |
