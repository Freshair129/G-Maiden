---
title: "CONTEXT: Mission Control Frontend Structure Refactor"
doc_id: "CONTEXT-MISSION-CONTROL-FRONTEND-STRUCTURE-REFACTOR"
status: "draft"
version: "0.1.1+draft"
updated: "2026-06-19"
owner: "LYRA / ARCHON / ATHER"
source_of_truth: false
related_docs:
  - "docs/change-requests/CR-2026-06-19-Mission-Control-Frontend-Structure-Refactor.md"
  - "docs/change-requests/feedback/CR-2026-06-19-Mission-Control-Frontend-Structure-Refactor-feedback.md"
  - "docs/PRD-GoVibe-Platform-Overview.md"
  - "docs/STD-Execution-Governance.md"
  - ".agents/cto/AGENT.md"
  - ".agents/frontend/AGENT.md"
  - ".agents/tech_lead/AGENT.md"
---

# CONTEXT: Mission Control Frontend Structure Refactor

## 1. Purpose

This shared context aligns `ARCHON`, `VIBE`, `RKOI`, and supporting reviewers around one bounded frontend structure refactor after A2 completion.

The goal is to reduce implementation sprawl and delegation noise without changing runtime truth or expanding product scope.

## 2. Current State

- A2 roadmap parity is complete enough to stop feature-chasing and start structure work.
- The live app still concentrates too much view composition and feature rendering inside broad app-level files.
- The next step is structure approval first, implementation second.

## 3. Required Repo Truth

Treat these as current implementation truth unless a newer approved doc explicitly replaces them:

- live source paths are under `src/`
- current Mission Control design truth is in `docs/design/`
- `ref/` is reference-only and must not be treated as the implementation source of truth
- runtime schema and transport are not changing in this refactor pass

## 4. Shared Scope Boundary

In scope:

- frontend file and module organization under `src/`
- narrower component and feature boundaries
- reducing `src/App.tsx` responsibility where approved
- updating agent context packets after structure approval
- design-doc alignment required by the approved refactor

Out of scope:

- new backend schema
- `src/mission.ts` contract changes
- fake runtime data
- product feature expansion
- sample-tree migration from `ref/`
- cross-platform or unrelated C4 rewrite

## 5. Agent Routing

- `LYRA` owns change-control routing and scope classification
- `ARCHON` approves target structure and decides whether ADR is required
- `ARCHON` writes the ADR directly when the change request alone is not enough to authorize safe structure movement
- `VIBE` implements only approved bounded slices
- `RKOI` reviews implementation quality and scope hygiene
- `ATHER` verifies traceability and audit readiness
- `GHOST` verifies UI sanity when the refactor touches visible behavior

## 6. Default Context Load Rule

For this change request, do not load all of `G:\govibe\.agents`.

Load only the minimum bounded set:

1. `AGENTS.md`
2. `docs/change-requests/CR-2026-06-19-Mission-Control-Frontend-Structure-Refactor.md`
3. this shared context file
4. the role-specific contract:
   - `.agents/cto/AGENT.md` for `ARCHON`
   - `.agents/frontend/AGENT.md` for `VIBE`
   - `.agents/tech_lead/AGENT.md` for `RKOI`
5. only the exact supporting docs needed for the current decision or slice

If more `.agents` files are needed, the agent must state why before expanding context.

## 7. Decision Gates

Before implementation:

- `ARCHON` must return `APPROVED`, `NEEDS_REVISION`, or `ADR_REQUIRED`
- if `ADR_REQUIRED`, `ARCHON` must author the ADR before implementation is delegated
- target structure must reference real repo paths
- implementation sequence must be split into bounded slices

Before close-out:

- `RKOI` review must exist for touched code
- `ATHER` must confirm traceability
- verification expectations must include `lint`, `build`, and browser sanity for touched views

## 8. Default Output Expectations

Architecture review should return:

- decision
- approved target structure
- required ADR or plan
- implementation sequence
- blocked risks
- verification expectations

Implementation output should return:

- exact slice completed
- files touched
- scope preserved
- verification run

## Changelog

| Version | Date | Owner | Summary |
|---|---|---|---|
| 0.1.1+draft | 2026-06-19 | LYRA / ARCHON / ATHER | Clarified that ARCHON authors the ADR directly when the structure refactor cannot be approved from the change request alone. |
| 0.1.0+draft | 2026-06-19 | LYRA / ARCHON / ATHER | Added shared context packet for the post-A2 Mission Control frontend structure refactor. |
