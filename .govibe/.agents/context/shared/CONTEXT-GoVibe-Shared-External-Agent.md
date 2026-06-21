---
title: "CONTEXT: GoVibe Shared External Agent"
doc_id: "CONTEXT-GOVIBE-SHARED-EXTERNAL-AGENT"
status: "draft"
version: "0.1.2+draft"
updated: "2026-06-19"
owner: "ATHER / THESEUS"
source_of_truth: false
related_docs:
  - "AGENTS.md"
  - "AGENT.md"
  - ".agents/context/CONTEXT-Bounded-External-Executor.md"
  - ".agents/context/shared/CONTEXT-Mission-Control-Frontend-Structure-Refactor.md"
  - "docs/design/GoVibe-Document-Hierarchy.md"
  - "docs/features/agent-team/FEAT-Task-Scoped-Context-Injection.md"
  - "docs/features/integration-bridge/FEAT-Qwen-CLI-Model-Routing.md"
---

# CONTEXT: GoVibe Shared External Agent

## 1. Purpose

This shared context is the compact rule packet for external executors such as Gemini CLI, qwen-cli, OpenRouter-backed models, and local Ollama workers.

It prevents each wrapper from inventing its own governance prompt.

It also prevents wrappers from overloading context by scanning broad agent folders when a bounded packet already exists.

## 2. Authority Boundary

- `AGENTS.md` is the canonical operating contract.
- Shared context files explain how to apply the contract to external executors.
- External executor output is draft evidence.
- Human owner and GoVibe lead agents keep final approval authority.

## 3. Reality Check

Before making claims, check or receive factual evidence for:

- repository root
- `git status --short --branch`
- root context files present in the repo
- referenced source docs
- referenced commands
- relevant code or test evidence

If evidence is missing, answer with `blocked_by_missing_evidence`.

When a task already names a bounded shared context file, do not broaden to all of `.agents/` by default.

## 4. Minimal-Code Rule

Before proposing code, check in this order:

1. Can the work be skipped?
2. Can docs, config, or process solve it?
3. Can standard tools or existing dependencies solve it?
4. Can a one-line change solve it?
5. Only then propose minimum implementation.

## 5. Document Hierarchy Rule

When a bounded external executor is asked to propose or update documentation, use this hierarchy by default:

1. `PRD` for platform or truly separate product scope only
2. `FEAT` for system, module, or major feature contract
3. `SRS` / `TRD` / `SRD` for technical requirements
4. `ADR` / `SDD` / `LLD` / `Blueprint` for design and architecture
5. `RUNBOOK`, roadmap, change request, RCA, audit, and feedback as supporting operational or control artifacts

Do not create a second product-level PRD for module work when the platform PRD already owns the product boundary.

For bounded context assembly work, prefer:

- `docs/features/agent-team/FEAT-Task-Scoped-Context-Injection.md`
- `docs/srs/SRS-GoVibe-Task-Scoped-Context-Injection.md`

over creating a new PRD-level document.

## 6. Required Response Contract

```yaml
repo_root_checked:
git_status_summary:
context_files_read:
context_source_used:
model_name:
model_route:
claims_checked:
mismatches_or_unknowns:
recommended_decision:
confidence:
```

## 7. Disallowed Behavior

- Do not pretend to inspect files that were not provided or read.
- Do not turn a bounded review into a new feature proposal.
- Do not approve scope, architecture, release, or source truth.
- Do not delete, normalize, or rewrite protected human-dev source.
- Do not scan all of `.agents/` when a smaller role-specific packet is available.

## Changelog

| Version | Date | Owner | Summary |
|---|---|---|---|
| 0.1.2+draft | 2026-06-19 | ATHER / THESEUS | Added document hierarchy guidance so external executors use FEAT plus SRS for module work instead of spawning duplicate PRDs. |
| 0.1.1+draft | 2026-06-19 | ATHER / THESEUS | Added bounded-loading guidance so external executors do not treat the entire `.agents/` tree as default context. |
| 0.1.0+draft | 2026-06-17 | ATHER / THESEUS | Added shared context packet for external agent executors. |
