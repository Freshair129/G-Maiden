# Planning Decomposition Standard

LYRA decomposes product intent into work that agents can execute safely.

Quota-aware local execution is governed by `docs/features/agent-team/FEAT-Quota-Aware-Local-LLM-Decomposition.md`.

Document hierarchy for task-driving work is governed by `docs/design/GoVibe-Document-Hierarchy.md`.

## Hierarchy
```text
Master Plan
+-- Roadmap
    +-- Phase
        +-- Epic
            +-- Sprint
                +-- Task
                    +-- Sub-task
                        +-- Micro-task
                            +-- Atomic-task
```

## Level Definitions
| Level | Meaning | Owner | Typical H Tier | Output |
|---|---|---|---|---|
| Master Plan | Product-wide operating plan | Product owner + PM | H5 | Master plan |
| Roadmap | Multi-phase delivery direction | PM | H5 | Roadmap |
| Phase | Major delivery slice | PM + Architect | H4 | Phase plan |
| Epic | Cross-feature capability | PM + Architect | H3 | Epic brief |
| Sprint | Short-horizon execution plan | PM + Lead | H2 | Sprint plan |
| Backlog Item | Prioritized work item | PM | H1-H2 | Backlog row |
| Task | Implementable unit | Lead/agent | H1 | Task spec |
| Sub-task | PR-sized action | Agent | H0-H1 | Checklist |
| Micro-task | Small local LLM work packet | Agent/local LLM | H0 | Context-limited checklist item |
| Atomic-task | Single local LLM action | Agent/local LLM | H0 | One-action instruction |

## Decomposition Rules
- Use the platform PRD as the top product boundary unless a truly separate product is being defined.
- For one system or module capability, prefer `FEAT` before `SRS`, then design docs such as `ADR`, `SDD`, or `Blueprint`.
- Do not create module-level PRDs when the work already belongs inside an existing platform PRD system.
- Do not create micro-tasks before the sprint/task goal is clear.
- Do not create implementation tasks without acceptance criteria.
- Do not split tasks by arbitrary file names; split by verifiable outcome.
- Prefer small tasks that can be completed and verified by one agent.
- Keep dependencies explicit.
- Every backlog task must satisfy INVEST: Independent, Negotiable, Valuable, Estimable, Small, Testable. If it fails INVEST, decompose or merge before promotion.
- Size every backlog task before approval (story points or token estimate). A task that cannot be estimated is not Ready — split it until it can.
- Escalate planning level when cross-system impact appears.
- Use micro-tasks and atomic-tasks for local LLMs with 8k-16k context limits.
- Atomic-tasks must contain one action, one target, and one verification check.
- Use quota-aware decomposition when a narrow local LLM packet can save primary Claude/Codex/Gemini quota without increasing risk.
- Treat RTX 3060 12GB VRAM as the current local hardware class for packet sizing, not as a hard product dependency.
- Do not assign architecture, scope approval, cross-repo truth, or broad context synthesis to local LLM packets.
- Escalate back to the lead agent when a micro-task exceeds 16k context or an atomic-task requires more than one action.

## Definition of Ready (DoR)
A backlog item is **Ready** only when it has all of:

- PRD system
- source feature or module doc
- title
- user/system outcome
- priority
- C/H classification (per `docs/STD-Execution-Governance.md`)
- estimate (story points or predicted token usage)
- dependencies (explicit, with blocking/resolved state)
- testable acceptance criteria (see below)
- verification expectation
- owner / PIC and suggested agent team
- **a complete Task Container** when the item is an implementation task in a backlog source

A backlog source that declares `## Task Containers` is **not Ready** until every actionable
backlog task carries a complete container. This is machine-enforced — see Promotion Readiness Gate.

## Acceptance Criteria Quality
Acceptance criteria must be **testable and atomic**, not prose intentions.

- Prefer Given/When/Then form: `Given <precondition>, When <action>, Then <observable result>`.
- One criterion = one verifiable check. Split compound criteria.
- Each criterion must be falsifiable by a test, a command, or a reviewable artifact — name how it is verified.
- Avoid unverifiable adjectives ("robust", "clean") unless tied to a concrete check (lint rule, metric, test).

Bad: `Packet assembly works correctly.`
Good: `Given an approved source set, When the packet is assembled, Then sources appear in deterministic
order and approved docs outrank promoted learnings (verified by assembly-order unit test).`

## Estimation
- Estimate before approval; carry both predicted and actual into the Task Container `token_telemetry`.
- Feed actuals back: if actual exceeds predicted by >50% repeatedly, re-baseline the estimation guidance.
- Use the estimate as a Small-check: a task that estimates beyond one agent's bounded run must be split.

## Local LLM Packet Requirements
Micro-task packet:

```text
source excerpt:
target path:
instruction:
constraints:
acceptance check:
model name:
max context: 8k or 16k
predicted token usage:
rollback note:
escalation rule:
```

Atomic-task packet:

```text
target:
single action:
acceptance check:
model name:
rollback note:
max context: 8k
predicted token usage:
escalation rule:
```

## Done Criteria
A backlog item is done when:

- acceptance criteria pass
- verification evidence exists
- traceability is updated
- auditor gate passes when required

## Promotion Readiness Gate (enforced)
Per `docs/features/project-roadmap/FEAT-Roadmap-Promotion-Contract.md`, a planning source becomes
board-visible only when it passes the gate. Definition of Ready is shift-left enforced, not manual:

```bash
npm run roadmap:validate   # fails if any declared Task Container is missing/incomplete or links to a non-existent file
```

Gate rules:

- A source declaring `## Task Containers` must provide a **complete** container for every actionable backlog task.
- Every authored `symbol_links.code|doc|test` must resolve to a real file in the repo.
- `code` links should point under `src/`, `scripts/`, or `packages/` (warning otherwise).
- `LYRA` owns closing gate failures by completing the plan; `ATHER` owns the approval gate.
- Do not mark a source `approved` while `roadmap:validate` reports errors — A2 will correctly reject incomplete tasks.

Recommended: wire `roadmap:validate` into `baseline:check` once the active backlog containers are complete,
so an incomplete plan can never reach the board.
