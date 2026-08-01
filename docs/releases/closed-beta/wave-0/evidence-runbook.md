---
title: "Closed Beta Wave 0 Evidence Runbook"
doc_id: "closed-beta-wave-0-evidence-runbook"
status: "candidate"
version: "0.1.0"
updated: "2026-08-01"
owner: "Boss"
related_docs: ["CLOSED-BETA-WAVE-0-DOD", "CLOSED-BETA-WAVE-0-SPEC"]
---

# Wave 0 evidence runbook

Create one evidence directory per candidate version with these files:

```text
approval.json
metrics.json
coverage.json
operational.json
privacy.json
known-issues.md
```

Validate it with:

```text
node scripts/releases/wave-0-evidence.mjs validate release/evidence/wave-0/<version>
```

The validator enforces every numeric target in the Wave 0 Definition of Done, all required platform/display coverage, operational controls, privacy controls, a named approver, evidence links, and known-issue classification. It accepts `ultrawide: unsupported` only when that limitation is explicitly recorded in `known-issues.md`.

The validator does not generate measurements. Test operators must attach installer logs, first-run completion records, GSI/DXGI/minimap results, updater metadata/signatures, performance captures, diagnostic-redaction checks, and rollback evidence before marking the packet `PASS` or `CONDITIONAL PASS`.

No packet may contain access tokens, OAuth credentials, raw screen frames, private signing keys, or unredacted match data.

## External completion gate

Wave 0 is not complete from repository tests alone. The remaining operation is to run the controlled 5 → 10 → 20–30 tester rollout on the signed candidate and validate the resulting packet. Until then, the DoD remains `HOLD`.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-08-01 | Added machine-checkable Wave 0 evidence validation and operator runbook |
