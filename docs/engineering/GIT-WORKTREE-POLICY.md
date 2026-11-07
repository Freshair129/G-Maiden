---
title: "Git and Worktree Lifecycle Policy"
doc_id: "GIT-WORKTREE-POLICY"
status: active
version: "0.2.0"
updated: "2026-11-07"
owner: "G-Maiden"
---
# Git and Worktree Lifecycle Policy

## 1. Purpose, scope and authority

This is the repository-wide engineering policy for collaborative Git, worktree, task ownership, handoff, verification and recovery. It applies equally to human contributors, automation, and coding assistants, regardless of editor, host, service, or execution platform. A conversation, tool, or branch is not an authority boundary.

This policy governs workspace coordination. Root `AGENTS.md` governs repository-wide Git and PR requirements; `CLAUDE.md` governs the established release/update workflow; `docs/product/mvp-decisions.md` governs accepted product scope, privacy and quality; and applicable ADRs and native acceptance plans remain binding. Read the relevant operative sections, not every linked document recursively. If two requirements appear incompatible, pause the affected operation, preserve evidence, and request an explicit documented resolution. Do not quietly choose the weaker rule.

**Normative terms:** MUST / MUST NOT are mandatory; SHOULD / SHOULD NOT require an explained exception; MAY is optional. "Owner" means the authorized decision-maker recorded for the relevant work, not merely whoever can access the machine. A repository administrator's technical ability to bypass protection is not approval to do so.

This policy defines required behavior; by itself it does **not** implement a distributed lock, detect live contributors, prove that sessions have stopped, or grant permission to merge, release, delete, or take over another workspace.

## 2. Working definitions

| Term | Meaning |
| --- | --- |
| Work item | An Issue, PR, approved task, or session handoff identifying a bounded objective and its accountable owner. |
| Checkout / worktree | A working directory attached to a repository common Git directory; multiple worktrees may share refs and object storage. |
| Writer | A contributor performing mutations to a worktree, its index, Git refs, generated files, or shared runtime state. |
| Scope | The files, modules, interfaces, contracts, outputs, and runtime resources a work item may change. Scope is not just a list of filenames. |
| Shared resource | Something changes can race over: Git refs, generators, lockfiles, caches, ports, databases, native builds, test fixtures, signing material, and running applications. |
| Ownership evidence | A current, attributable task/session assignment and handoff, corroborated against local and remote state where available. |
| Protected workspace | A workspace whose owner, consumers, unique changes, or safe disposition cannot yet be established. It is read-only to others. |
| Handoff | An explicit release by the prior owner, recorded inventory, and acceptance by the new owner. An unacknowledged message is not a completed handoff. |

## 3. Mandatory invariants

1. **One writer per mutable worktree.** Read-only collaborators MAY inspect it. Concurrent writers, including delegated subprocesses and subagents, MUST serialize mutations.
2. **No assumed ownership.** Unknown, stale, unreachable, or disputed ownership MUST be treated as PROTECTED. An idle chat, clean `git status`, absent process, expired heartbeat, closed Issue, or merged PR is not release evidence.
3. **No conflicting scope without coordination.** Writers on different worktrees MUST still check for overlapping interfaces, files, generated artifacts, integration branches, and shared runtime dependencies. Separate worktrees are isolation, not a license for competing changes.
4. **Least change and least privilege.** Work only within an assigned scope; preserve unrelated staged, unstaged, untracked, ignored, unpushed and local-only assets. Avoid destructive operations and credential exposure.
5. **Reviewable delivery.** Every proposed change MUST be traceable to an authorized work item, explicit commit(s), evidence, and the protected-main PR path. Passing a CI job is not proof of native/gameplay acceptance.
6. **Cleanup is independent of completion.** A merged PR, completed task, released branch, or seemingly empty worktree MUST NOT trigger automatic deletion.

## 4. Entry gate: discover before changing anything

Before taking a write action, the contributor MUST inspect, to the extent permitted by the environment:

- The canonical repository location and common Git directory; the assigned checkout and `git worktree list --porcelain`; branch, HEAD, upstream, remotes and target base.
- Staged, unstaged, untracked, ignored (where relevant), and unpushed changes, including work not visible on GitHub.
- Open and relevant closed Issues/PRs, task/session records, branch dependencies, and recent changes to the intended scope.
- Existing ownership/handoffs, test and runtime consumers, generators, builds, and other shared resources the action might affect.
- Whether local process/session visibility is available. **Unavailable data MUST be reported as UNKNOWN, not inferred as idle or free.**

Discovery is read-only. Contributors MUST NOT switch another worktree's branch, update its index, regenerate its documents, start/stop its applications, or change Git refs merely to inspect it. A contributor with no reliable write assignment MUST stop at a read-only inventory or an owner-directed handoff.

Reuse a verified assigned checkout and compatible task branch before allocating anything. A new worktree is permitted only when concurrent writes, destructive tests, incompatible toolchains, or environmental isolation truly require it **and** its owner and purpose are recorded. Creating a worktree simply because a new session started, or to evade uncertain ownership, is prohibited. Follow `AGENTS.md`: place linked worktrees outside the repository unless an authorized, properly ignored location is established.

## 5. Work ownership and coordination record

Use the **existing Issue, PR, task, and session/handoff records**; this policy does not introduce a separate mandatory registry, daemon, central controller, or platform-specific protocol. Before implementation, record or link the following minimum fields whenever relevant:

| Field | Required evidence |
| --- | --- |
| Work item and accountable owner | Issue/task reference, responsible contributor or team, and an accessible communication/handoff route. |
| Workspace identity | Canonical local path (in an access-controlled record if sensitive), common Git directory, branch, remote, base and current HEAD. |
| Authorized scope | Intended files/modules/contracts, generated outputs, shared resources and explicit exclusions. |
| Dependencies | Upstream PRs, overlapping work items, required handoffs, integration sequence, and consumers awaiting native/UAT evidence. |
| State and freshness | Status, last **verified** observation time, source of observation, and what could not be verified. |
| Working changes | Relevant dirty, ignored, unpushed or unique work, and where recoverable evidence is retained. |
| Completion gates | Tests, review, CI, native/UAT evidence, blockers, responsible decision-maker and exact resume trigger. |

Update the record at ownership acquisition, scope change, material blocker, handoff, PR submission and final disposition. Reports MUST distinguish **observed facts**, **declared intent**, and **unverified claims**. Do not publish credentials, personal data, raw game data, or sensitive absolute paths in a public Issue/PR; store sensitive evidence in an authorized private location and link only safe metadata.

A GitHub assignee, label, comment, branch name, or optional heartbeat is **coordination metadata**, not an atomic lock or proof that a person or process is alive. If automated multi-writer scheduling is later introduced, it MUST use an actual concurrency-safe claim mechanism with fenced ownership, expiry handling and audit records; that implementation requires separate design/review. Lease expiry alone MUST NOT authorize destructive takeover.

## 6. Ownership decisions and overlapping changes

Before editing, classify the intended work:

| Condition | Permitted action |
| --- | --- |
| Verified own worktree, authorized scope, no conflicting active consumer | Write within scope and keep evidence current. |
| Another verified active writer or dependent runtime/test consumer | Read-only inspection; request sequencing, integration contract or explicit handoff. |
| Unknown or stale ownership, missing local visibility, disputed assignment | PROTECT; no mutation or takeover; escalate with a concise evidence-backed handoff request. |
| Separate owned worktrees but intersecting files, contracts or generators | Agree ownership/split of integration surfaces and sequence before modifying the overlap. |
| Independent scope and isolated resources with accountable ownership | Parallel implementation MAY proceed, with explicit dependency tracking. |

In particular, Rust/TypeScript API changes, GSI schemas, capture interfaces, UI state contracts, `Cargo.lock`/package lockfiles, code-generated indexes, CI configurations and shared build/runtime state count as **logical overlaps** even when edits occur in different paths.

One writer MUST control the integration of shared surfaces at a time. Parent and delegated writers MUST serialize commits, rebases, generator runs and writes to shared resources. Read-only reviews may proceed in parallel. No contributor MAY silently rewrite another contributor's task/branch, amend or force-push an open PR, change its base, or take over its worktree.

## 7. Lifecycle and state transitions

Follow: **DISCOVER → ASSIGN/VERIFY OWNERSHIP → PLAN SCOPE → EXECUTE → VERIFY → REVIEW → MERGE OR RETIRE → INDEPENDENT CLEANUP**.

Track the work-item state independently from workspace safety:

- Work-item states: `ACTIVE`, `READY_TO_FINISH`, `BLOCKED_BY_DEPENDENCY`, `BLOCKED_BY_UAT`, `BLOCKED_BY_DECISION`, `SUPERSEDED`, `COMPLETED`, `MERGED`, `RETIRED`, or `UNKNOWN`.
- Workspace cleanup states: `PROTECTED`, `REVIEW_REQUIRED`, `VERIFIED_SAFE`, or `CLEANED`.
- A status MUST include evidence, the accountable owner, outstanding blockers and a resume/closure condition. A chat ending does not close the work item.
- `MERGED` describes source integration, not runtime verification. A merged change may remain `BLOCKED_BY_UAT` for its acceptance scope, with evidence consumers protected.

A dependency MUST be linked to its prerequisite task/PR and integration target. Resolve contract and branch dependencies in the approved order. After changing a base or integrating prerequisites, recalculate the actual diff and rerun required checks on the resulting exact HEAD.

## 8. Handoff, absence and incident response

**Normal handoff:** The current writer MUST publish its scope, branch/HEAD, uncommitted/unpushed/ignored inventory, local runtime consumers, dependencies, test evidence and remaining risks; explicitly release ownership; and identify the intended receiver. The receiver MUST independently verify the current state, acknowledge acceptance, and update the work record **before** writing.

**Absent or unreachable owner:** Do not infer abandonment from elapsed time or an expired heartbeat. Preserve the original workspace and report the blocker. An authorized maintainer MAY assign a *separate, verified non-overlapping* scope or request a reviewed recovery/handoff plan. Access to a shared machine alone is not permission to take over existing work. Any exceptional recovery MUST preserve unique work and record the approving authority, exact scope, evidence and rollback approach before mutation.

**Collision or unexpected mutation:** Stop dependent writes immediately; capture only safe relevant refs, diffs, logs, session identifiers and timestamps; identify affected consumers; notify the accountable owner; and preserve recovery artifacts. Do not reset, clean, restore over newer work, force-push or garbage-collect as an improvised fix. Material incidents require an RCA and a verified, scoped recovery plan.

## 9. Branch, change and review controls

- Protected `main` is PR-only, including documentation. Always confirm the intended remote; `origin` is G-Maiden and `rwang` is a separate repository. Use `git push -u origin <branch>` for a new branch, never rely on an ambiguous upstream.
- Reuse an appropriate owned branch; otherwise use the established `wip/<topic>`, `fix/<topic>` or `docs/<topic>` conventions. Use Conventional Commits and the repository's authoring-attribution trailer.
- Stage only explicit intended paths; **never `git add -A`** in a shared checkout. Never bypass hooks, tamper with signing, discard changes, force-push or silently amend an open PR.
- Every PR MUST state summary, rationale/scope, linked work item, known collisions/dependencies, test evidence and outstanding gates. Wide-scope changes retain the required PR-template rationale.
- Before declaring merge eligibility, check the intended base, reviewed exact HEAD, branch freshness, current protections, successful required `ci` and `pr-gate-agent` checks, resolved review threads, owner approval and applicable acceptance. Draft status permits incomplete work to be visible; it does not waive verification.
- The repository owner controls merges and release decisions. Configured zero required approval reviews or administrator bypass capability are not self-approval. Do not change branch protections, checks, release tags, manifests or deployment settings as part of policy-only work.

## 10. Verification and evidence levels

Evidence MUST identify command/test, environment, revision or artifact ID, outcome, timestamp, and any limitation. Separate at least:

| Level | What it establishes | What it does not establish |
| --- | --- | --- |
| Static review / unit tests | Bounded source and fixture behavior | Installed desktop or live-game behavior |
| Hosted CI / PR gate | Configured checks for the recorded commit | Local Windows configuration, real devices, gameplay, audio or FPS |
| Native/runtime validation | Recorded Windows/Tauri/install/GSI scenarios | Unrun live Dota and resource scenarios |
| Live UAT / performance | Specifically measured game, capture, audio, latency and resource acceptance | Untested configurations or blanket platform compatibility |

No one MAY convert `NOT_RUN` or `UNKNOWN` to `PASS` based on another evidence level. Follow accepted MVP privacy, critical-path latency, CPU/RAM/FPS and consent constraints. Protect runtime profiles, signing keys, CV/GSI/voice data, credentials and test evidence under existing access controls; do not upload them into public reports.

For changes to `docs/`, `AGENTS.md`, `CLAUDE.md` or doc-graph tooling, run `node tools/doc-graph/ci-gate.mjs` in an **owned writable** workspace. The generator modifies graph/report, feature ledger, orphan and atomic-index artifacts; include the corresponding regenerated outputs in the reviewed diff. New/edited docs require established frontmatter and an exact `## Changelog` heading, with matching version/changelog entry. Check relative links and semantic consistency with ADRs/contracts. **If generation or required tests cannot be run, keep the PR Draft and mark each missing gate NOT_RUN with the reason; do not claim ready for merge.**

Avoid duplicate native builds/installs and heavy concurrent workloads. Inspect available capacity and resource ownership before running expensive checks; reuse safe caches without modifying another writer's state.

## 11. Post-merge retention and authorized cleanup

Cleanup is a separate authorized work item. `MERGED`, `COMPLETED`, clean status, and `git worktree prune` candidates are **not** deletion criteria.

A worktree may become `VERIFIED_SAFE` only after **all** of the following have affirmative evidence:

1. The current owner expressly released the workspace; no active task, downstream branch, session, runtime, native/UAT or evidence consumer still needs it.
2. The final task/PR disposition and dependency graph are reconciled.
3. All staged, unstaged, untracked, **ignored**, unpushed and local-ref-only changes, plus relevant caches/runtime data, have been inventoried; unique work has a verified, authorized and recoverable preservation path.
4. The exact canonical target path, common Git directory, symlinks/junctions and retained refs were checked. The primary/common repository and other contributors' trees are excluded.
5. A reviewer/authorized owner approved the specific removal, and the recovery and verification steps are recorded.

Only then MAY a separately authorized normal linked-worktree removal occur; branch/ref deletion has its **own** reachability and authorization check. Never force-remove a merged tree, delete unknown data, stop someone else's runtime, or clear shared caches, credentials, databases or evidence to make space. Record the exact result and validate remaining registrations and recovery artifacts afterward.

## 12. Governance, compliance and exception handling

The work-item owner maintains accurate assignment and handoff evidence. Contributors verify before writes. Reviewers independently examine scope, dependencies and evidence. The repository owner approves merges and exceptional recovery/removal. These roles can be held by humans or delegated automation only within explicitly recorded authority; role names do not grant implicit machine permissions.

Existing GitHub protections, PR gate and doc-graph checks enforce **only their configured subset**. This document is a behavioral control and is not a filesystem lock. Where a control cannot be observed or enforced, record the gap and fail closed for destructive or ownership-changing operations.

Exceptions to SHOULD rules require a documented reason, risk, owner and expiry/review condition. MUST-level safety, privacy, protected-main, signing and preservation controls cannot be silently waived; any proposed change to them requires a separate approved governance change, not an ad hoc session instruction. Review this policy when a material collaboration incident, worktree workflow change, or new automation integration exposes a control gap.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-04 | Add reuse-first ownership, dependency recovery and post-merge cleanup verification while retaining existing Git, review and native acceptance gates. |
| 0.2.0 | 2026-11-07 | Define platform-neutral normative controls, evidence-backed ownership/scope decisions, safe handoff and offline recovery, independent task/workspace states, verification matrix, and authorized cleanup without adding a mandatory registry. |
