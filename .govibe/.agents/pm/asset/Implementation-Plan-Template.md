# GoVibe Implementation Plan Template

**SSOT Reference:** [.agents/pm/asset/Planning-Decomposition-Standard.md](Planning-Decomposition-Standard.md)
**Quota-Aware Local LLM Reference:** [docs/features/agent-team/FEAT-Quota-Aware-Local-LLM-Decomposition.md](../../../docs/features/agent-team/FEAT-Quota-Aware-Local-LLM-Decomposition.md)
**Document Hierarchy Reference:** [docs/design/GoVibe-Document-Hierarchy.md](../../../docs/design/GoVibe-Document-Hierarchy.md)
**Tier:** H1-H0 (Execution)

```yaml
ImpId: [[IMP-ID]]
Source Spec: [[LINK-TO-FEAT-OR-SRS]]
Product Boundary: [[PRD-SYSTEM]]
Methodology: DDD + CoDev multi-agent execution
Complexity: C-1/C-2/C-3
Risk: LOW/MEDIUM/HIGH
Gate: Doc/spec first -> approval -> implementation
Status: pending/WIP/Done/hold/Rejected
Progression: 0%
Target: task, sub-task, micro-task, atomic-task
```

## Goal
[[Describe the goal of this implementation plan]]

## Source Hierarchy Check

- [ ] Work belongs under an existing platform PRD system
- [ ] Module or feature source doc is identified
- [ ] SRS exists or is explicitly not required for this slice
- [ ] Architecture/design doc is identified when the slice is C-3

## Execution Table

| Status | Task ID | Task Details | Pt | Mode | Dependency | Symbollink | Assign To | Model Name | Context | Verification Link | Predicted Tokens | Actual Input | Actual Output | Tool Calling | Total Tokens | Start | End |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| waiting | [[ID]] | [[Task]] | 3 | SERIAL | - | <path> | [[AGENT]] | [[MODEL]] | 128k | [verify](#) | 1000 | - | - | - | - | - | - |

## Task Breakdown

### [[Task ID]]: [[Title]]
- [ ] S-[[ID]] [[Sub-task description]]
  - [ ] M-[[ID]] [[Micro-task description (Local LLM Packet)]]
    - [ ] A-[[ID]] [[Atomic-task description (Single Action)]]

## Definition of Done

■ Acceptance Criteria
- [ ] Spec/Doc approved (DDD gate)
- [ ] Docs updated (README, GEMINI.md, or inline JSDoc)
- [ ] Test plan Spec/Doc approved

■ Success Criteria
- [ ] Code complete — No TODO/FIXME
- [ ] Lints clean (TypeScript strict, no any)
- [ ] Renders correctly in target environment

■ Exit Criteria
- [ ] Tests passed (Evidence in Verification Link)
- [ ] Regression free
- [ ] Auditor gate passed (if required)

## Local LLM Packets (H0 Tier)
> These packets are for local LLM execution with 8k-16k context limits. Define them here to keep the Backlog clean.
> Use these packets to reduce primary Claude/Codex/Gemini quota only when the work is narrow enough for a local model on the current RTX 3060 12GB VRAM hardware class.
> Local LLM output is draft until verified by the lead agent, QA, or auditor.

### Micro-task Packet: [[M-TSK-ID]]
```text
source excerpt: [[Reference code or doc snippet]]
target path: [[File to modify]]
instruction: [[Specific step-by-step for local LLM]]
constraints: [[e.g., no external libs, preserve style]]
acceptance check: [[Verifiable outcome]]
model name: [[LOCAL MODEL]]
max context: [[8k or 16k]]
predicted token usage: [[ESTIMATE]]
max output tokens: [[LIMIT]]
rollback note: [[How to revert if fail]]
escalation rule: escalate_to_lead_when_context_exceeds_packet
```

### Atomic-task Packet: [[A-TSK-ID]]
```text
target: [[Specific line or function]]
single action: [[One instruction]]
acceptance check: [[Single check]]
model name: [[LOCAL MODEL]]
rollback note: [[How to revert if fail]]
max context: 8k
predicted token usage: [[ESTIMATE]]
max output tokens: [[LIMIT]]
escalation rule: escalate_to_lead_when_more_than_one_action_is_required
```
