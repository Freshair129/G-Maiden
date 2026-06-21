---
title: "CONTEXT: GoVibe Git Hygiene"
doc_id: "CONTEXT-GOVIBE-GIT-HYGIENE"
status: "draft"
version: "0.1.0+draft"
updated: "2026-06-17"
owner: "JANUS / ATHER"
source_of_truth: false
related_docs:
  - "AGENTS.md"
  - ".agents/context/shared/CONTEXT-GoVibe-Shared-External-Agent.md"
---

# CONTEXT: GoVibe Git Hygiene

## 1. Purpose

This context constrains agents that are asked to inspect, clean, stage, commit, or push GoVibe repository state.

## 2. Owner Model

- `JANUS` owns environment and repository hygiene execution.
- `ATHER` audits scope safety and evidence preservation.
- The human owner approves destructive cleanup.

## 3. Required Checks

Before recommending git actions, inspect or receive:

- `git status --short --branch`
- tracked modifications
- untracked files
- ignored evidence paths
- latest commit when push or history state matters

## 4. Cleanup Rules

- Stage only files that directly match the task.
- Do not use `git clean -fd` on evidence directories.
- Do not delete raw inbound evidence without explicit human approval.
- Prefer `.gitignore` guardrails for raw import or generated evidence that must remain local.
- Push only after confirming branch target and worktree state.

## 5. Response Contract

```yaml
owner: JANUS / ATHER
risk:
git_status_summary:
recommended_actions:
do_not_touch:
approval_needed:
confidence:
```

## Changelog

| Version | Date | Owner | Summary |
|---|---|---|---|
| 0.1.0+draft | 2026-06-17 | JANUS / ATHER | Added shared git hygiene context for external executor review and audit-safe cleanup. |
