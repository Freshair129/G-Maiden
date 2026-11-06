---
title: "CONTEXT: Visual Agent Fleet Scope"
doc_id: "CONTEXT-VISUAL-AGENT-FLEET-SCOPE"
status: "draft"
version: "0.1.0"
updated: "2026-06-14"
owner: "THESEUS"
source_of_truth: false
---

# CONTEXT: Visual Agent Fleet Scope

## Purpose

This context container derives compact agent-facing rules from `.agents/Visual-Agent-Fleet-Scope/` without editing the protected human-dev source files.

## Protected Source Policy

Protected source path:

```text
.agents/Visual-Agent-Fleet-Scope/
```

Allowed actions:

- Read source files.
- Reference source file paths.
- Summarize reusable rules into derived context.

Forbidden actions:

- Edit protected source files.
- Delete protected source files.
- Normalize encoding in place.
- Copy full protected docs into agent packets.

## Shared Fleet Taxonomy

Every Visual Agent Fleet role record should use:

```yaml
agent_id:
agent_name:
fleet_role:
job_title_equivalent:
domain:
cluster:
responsibility:
authority:
  can:
  cannot:
source_refs:
approval_gate:
scope_boundary:
out_of_scope:
```

## Scope Control Rules

- Requirement, scope, out-of-scope, acceptance criteria, and owner must be clear before planning starts.
- New requests are classified as bug, existing requirement, or change request.
- Change requests require impact assessment before acceptance.
- If new scope enters a sprint, another item must be moved out or the approval owner must accept the timeline/resource change.

## Derived Role Packets

| Packet | Role | Purpose |
|---|---|---|
| `.agents/pm/context/LYRA-Scope-Control-Context.md` | PM / Planning Owner | Scope control, change request gate, planning input rules |
| `.agents/doc_writer/context/THESEUS-Requirement-Doc-Context.md` | Technical Documentation Engineer | Protected source derivation and documentation traceability |
| `.agents/auditor/context/ATHER-Scope-Audit-Context.md` | Auditor | Drift, scope creep, and protected source audit checks |
| `.agents/qa/context/GHOST-AC-UAT-Context.md` | QA | AC, test case, UAT, and A5 verification guidance |
| `.agents/tech_lead/context/RKOI-Feasibility-Risk-Context.md` | Tech Lead | Feasibility, risk, and implementation scope review |
| `.agents/context/BA-PO-Requirement-Context.md` | Context-only BA/PO | Requirement and decision guidance without standalone agent authority |

## Source References

- `.agents/Visual-Agent-Fleet-Scope/Scope-Creep.md`
- `.agents/Visual-Agent-Fleet-Scope/Acceptance Criteria.md`
- `.agents/Visual-Agent-Fleet-Scope/test case.md`
- `.agents/Visual-Agent-Fleet-Scope/UAT.md`
- `.agents/Visual-Agent-Fleet-Scope/Requirement/Requirement.md`
- `.agents/Visual-Agent-Fleet-Scope/Requirement/Requirement Traceability.md`
- `.agents/Visual-Agent-Fleet-Scope/Requirement/Workshop - Requirement.md`
- `.agents/Visual-Agent-Fleet-Scope/PM/PM-req.md`
- `.agents/Visual-Agent-Fleet-Scope/PO/PO-req.md`
- `.agents/Visual-Agent-Fleet-Scope/BA/Doc for BA-PO.md`

## Changelog

| Version | Date | Owner | Summary |
|---|---|---|---|
| 0.1.0 | 2026-06-20 | THESEUS | Added changelog footer and normalized doc_id casing per versioning standard. |
