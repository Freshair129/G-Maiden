---
title: "Git and Worktree Lifecycle Policy"
doc_id: "GIT-WORKTREE-POLICY"
status: active
version: "0.2.1"
updated: "2026-11-07"
owner: "G-Maiden"
---
# Git and Worktree Lifecycle Policy

## 1. Purpose, scope and authority

This is the repository-wide engineering policy for collaborative Git, worktree, task ownership, handoff, verification and recovery. It applies equally to human contributors, automation, and coding assistants, regardless of editor, host, service, or execution platform. A conversation, tool, or branch is not an authority boundary. An ephemeral CI job in an isolated checkout satisfies the one-writer rule by construction; its authority is limited to its workflow definition and the event or approval that triggered it.

This policy governs workspace coordination. Root `AGENTS.md` governs repository-wide Git and PR requirements; `CLAUDE.md` governs the established release/update workflow; `docs/product/mvp-decisions.md` governs accepted product scope, privacy and quality; and applicable ADRs and native acceptance plans remain binding. Read the relevant operative sections, not every linked document recursively. If requirements conflict, apply the more restrictive one for destructive, ownership-changing, privacy, release or merge operations and record the conflict in the work item; pause only where the more restrictive choice is unclear, and request a documented resolution from the repository owner. `CLAUDE.md` prevails on release, `AGENTS.md` on Git/PR mechanics, and this policy on workspace ownership, handoff and cleanup. Do not quietly choose the weaker rule.

**Normative terms:** MUST / MUST NOT are mandatory; SHOULD / SHOULD NOT require an explained exception; MAY is optional. Imperatives ("Do not", "Never", "is prohibited") carry MUST NOT force. The roles **repository owner**, **assigner** and **writer** are defined in §2; "owner" without qualification means the repository owner. A repository administrator's technical ability to bypass protection is not approval to do so.

This policy defines required behavior; by itself it does **not** implement a distributed lock, detect live contributors, prove that sessions have stopped, or grant permission to merge, release, delete, or take over another workspace.

## 2. Working definitions

| Term | Meaning |
| --- | --- |
| Work item | An Issue, PR, approved task, or session handoff identifying a bounded objective and its accountable owner. |
| Repository owner | The human account holder who alone approves merges, releases, exceptional recovery and cleanup. Not a role an assistant or automation can hold. |
| Assigner | The repository owner, or a coordinator the repository owner recorded for a specific plan. Exactly one per work item. |
| Writer | The single accountable holder of a workspace's write assignment, performing mutations to a worktree, its index, Git refs, generated files, or shared runtime state. Delegated subprocesses and subagents act under the writer's assignment, not their own. |
| Checkout / worktree | A working directory attached to a repository common Git directory; multiple worktrees may share refs and object storage. |
| Scope | The files, modules, interfaces, contracts, outputs, and runtime resources a work item may change. Scope is not just a list of filenames. |
| Shared resource | Something changes can race over: Git refs, generators, lockfiles, caches, ports, databases, native builds, test fixtures, signing material, running applications, and repository-wide Git state shared by all worktrees (stash list, reflogs, local branches, worktree registrations and the object store). |
| Ownership evidence | A current, attributable task/session assignment and handoff, corroborated against local and remote state where available. |
| Protected workspace | A workspace whose owner, consumers, unique changes, or safe disposition cannot yet be established. It is read-only to others. |
| Handoff | An explicit release by the prior writer, recorded inventory, and acceptance by the new writer. An unacknowledged message is not a completed handoff. |

## 3. Mandatory invariants

1. **One writer per mutable worktree.** Read-only collaborators MAY inspect it. Concurrent writers, including delegated subprocesses and subagents, MUST serialize mutations.
2. **No assumed ownership.** Unknown, stale, unreachable, or disputed ownership MUST be treated as PROTECTED. An idle chat, clean `git status`, absent process, expired heartbeat, closed Issue, or merged PR is not release evidence.
3. **No conflicting scope without coordination.** Writers on different worktrees MUST still check for overlapping interfaces, files, generated artifacts, integration branches, and shared runtime dependencies. Separate worktrees are isolation, not a license for competing changes.
4. **Least change and least privilege.** Work only within an assigned scope; preserve unrelated staged, unstaged, untracked, ignored, unpushed and local-only assets. Avoid destructive operations and credential exposure.
5. **Reviewable delivery.** Every proposed change MUST be traceable to an authorized work item, explicit commit(s), evidence, and the protected-main PR path. Passing a CI job is not proof of native/gameplay acceptance.
6. **Cleanup is independent of completion.** A merged PR, completed task, released branch, or seemingly empty worktree MUST NOT trigger automatic deletion.

## 4. Entry gate: discover before changing anything

Before taking a write action, the contributor MUST inspect, to the extent permitted by the environment:

- The canonical repository location and common Git directory; the assigned checkout and `git worktree list --porcelain` (including lock reasons); branch, HEAD, upstream, remotes and target base, after fetching the intended base.
- Staged, unstaged, untracked, ignored (where relevant), and unpushed changes, including work not visible on GitHub.
- Open and relevant closed Issues/PRs, task/session records, branch dependencies, and recent changes to the intended scope.
- Existing ownership/handoffs, test and runtime consumers, generators, builds, and other shared resources the action might affect.
- Whether local process/session visibility is available. **Unavailable data MUST be reported as UNKNOWN, not inferred as idle or free.**

**Solo-lane path:** when a contributor writes only in its own assigned worktree and branch, with no other recorded writer for that scope and no §6 shared surface, the entry gate is `git fetch` of the intended base, `git worktree list --porcelain`, `git status`, branch/HEAD/upstream/base, a check of open PRs touching the same paths, and the assignment recorded in the PR body.

Each linked worktree in use or PROTECTED SHOULD carry `git worktree lock --reason "<work item> <writer label> <YYYY-MM-DD>"`. This is a visibility and removal guard, not a write lock. Only the holder, or the §11 cleanup authorization, may unlock it. The primary checkout cannot be locked; record its holder in the work record.

Discovery is read-only. Contributors MUST NOT switch another worktree's branch, update its index, regenerate its documents, start/stop its applications, or change Git refs merely to inspect it. A contributor without a verified write assignment for a workspace MUST NOT write to it; it MAY prepare a patch outside that workspace and attach it to a handoff request, and MUST NOT apply it there.

Reuse a verified assigned checkout and compatible task branch before allocating anything. A new worktree is permitted only when concurrent writes, destructive tests, incompatible toolchains, or environmental isolation truly require it **and** its owner and purpose are recorded. Creating a worktree to continue, duplicate or work around a PROTECTED workspace's work item is prohibited; creating one from current `origin/main` for a separately assigned, non-overlapping work item is permitted even when the primary checkout is PROTECTED. Creating a worktree simply because a new session started is prohibited. Follow `AGENTS.md`: place linked worktrees outside the repository unless an authorized, properly ignored location is established.

## 5. Work ownership and coordination record

Use the **existing Issue, PR, task, and session/handoff records**; this policy does not introduce a separate mandatory registry, daemon, central controller, or platform-specific protocol. Before implementation, record or link the following minimum fields when work runs in parallel with another writer, is handed off, becomes blocked, or touches a shared surface:

| Field | Required evidence |
| --- | --- |
| Work item and accountable owner | Issue/task reference, responsible contributor or team, and an accessible communication/handoff route. |
| Workspace identity | Workspace label (directory basename or tool-assigned name), machine label if more than one machine is used, branch, remote, base SHA and HEAD. Absolute paths stay local (for example in the `git worktree lock` reason) and MUST NOT be posted in this public repository. |
| Authorized scope | Intended files/modules/contracts, generated outputs, shared resources and explicit exclusions. |
| Dependencies | Upstream PRs, overlapping work items, required handoffs, integration sequence, and consumers awaiting native/UAT evidence. |
| State and freshness | Status, last **verified** observation time, source of observation, and what could not be verified. |
| Working changes | Relevant dirty, ignored, unpushed or unique work, and where recoverable evidence is retained. |
| Completion gates | Tests, review, CI, native/UAT evidence, blockers, responsible decision-maker and exact resume trigger. |

Update the record at ownership acquisition, scope change, material blocker, handoff, PR submission and final disposition. Reports MUST distinguish **observed facts**, **declared intent**, and **unverified claims**. This repository is public: keep credentials, personal data, raw game data and absolute local paths out of Issues and PRs; keep such evidence local and reference it by a non-sensitive label.

A GitHub assignee, label, comment, branch name, or optional heartbeat is **coordination metadata**, not an atomic lock or proof that a person or process is alive. A plan in which a single recorded coordinator grants and releases leases in a single-writer record (for example `docs/product/mvp-execution-dag.md`) satisfies this policy. A scheduler that lets more than one party grant leases, or grants them unattended, MUST use a concurrency-safe claim mechanism with fencing, expiry handling and audit records, under separate design review. Lease expiry alone MUST NOT authorize destructive takeover.

**Claim serialization.** Each work item has exactly one assigner: the repository owner, or a coordinator the repository owner recorded for that plan. Self-claims are requests until the assigner records them. Before the first write the assignee MUST re-read the work record. If more than one active write assignment exists for overlapping scope, every assignee MUST stop writing until the assigner resolves it.

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

One writer MUST control the integration of shared surfaces at a time. Parent and delegated writers MUST serialize commits, rebases, generator runs and writes to shared resources. Read-only reviews may proceed in parallel. Contributors MUST NOT rewrite another contributor's task or branch, amend or force-push an open PR, change its base, or take over its worktree.

Repository-wide Git state is shared by every worktree. `git stash drop`, `git stash clear` or `git stash pop` of entries the contributor did not create, `git gc --prune=now`, `git reflog expire`, `git worktree prune`, and deleting branches the contributor did not create require the §11 authorization.

## 7. Lifecycle and state transitions

Follow: **DISCOVER → ASSIGN/VERIFY OWNERSHIP → PLAN SCOPE → EXECUTE → VERIFY → REVIEW → MERGE OR RETIRE → INDEPENDENT CLEANUP**.

Track the work-item state independently from workspace safety. Use these states in reports and handoffs where no plan-specific board exists; a plan board (CR-034 §3, `docs/product/mvp-execution-dag.json`) MAY keep its own vocabulary if it maps to these:

- Work-item states: `ACTIVE`, `READY_TO_FINISH`, `BLOCKED_BY_DEPENDENCY`, `BLOCKED_BY_UAT`, `BLOCKED_BY_DECISION`, `SUPERSEDED`, `COMPLETED`, `MERGED`, `RETIRED`, or `UNKNOWN`.
- Workspace cleanup states: `PROTECTED`, `REVIEW_REQUIRED`, `VERIFIED_SAFE`, or `CLEANED`.
- A status MUST include evidence, the accountable owner, outstanding blockers and a resume/closure condition. A chat ending does not close the work item.
- `MERGED` describes source integration, not runtime verification. A merged change may remain `BLOCKED_BY_UAT` for its acceptance scope, with evidence consumers protected. Do not let a `Closes #N` keyword close a work item that still has a `BLOCKED_BY_UAT` scope.

A dependency MUST be linked to its prerequisite task/PR and integration target. Do not merge a dependent PR until its prerequisites are merged into its target branch, unless the assigner records an integration-branch plan with every dependency SHA. After any base change or prerequisite merge, recompute the diff, regenerate generated artifacts and rerun required checks on the exact resulting HEAD.

## 8. Handoff, absence and incident response

**Normal handoff:** The current writer MUST publish its scope, branch/HEAD, uncommitted/unpushed/ignored inventory, local runtime consumers, dependencies, test evidence and remaining risks; explicitly release ownership; and identify the intended receiver. The receiver MUST independently verify the current state, acknowledge acceptance, and update the work record **before** writing.

**Absent or unreachable writer:** Do not infer abandonment from elapsed time or an expired heartbeat. Preserve the original workspace and report the blocker. The assigner MAY assign a *separate, verified non-overlapping* scope or request a reviewed recovery/handoff plan. Access to a shared machine alone is not permission to take over existing work. Any exceptional recovery MUST preserve unique work and record the approving authority, exact scope, evidence and rollback approach before mutation.

**Collision or unexpected mutation:** Stop dependent writes immediately; capture only safe relevant refs, diffs, logs, session identifiers and timestamps; identify affected consumers; notify the accountable owner; and preserve recovery artifacts. Do not reset, clean, restore over newer work, force-push or garbage-collect as an improvised fix. Material incidents require an RCA and a verified, scoped recovery plan.

## 9. Branch, change and review controls

Follow `AGENTS.md` → Git & GitHub for protected `main`, remotes (`origin` is G-Maiden; `rwang` is a separate repository), branch naming, Conventional Commits and the authoring-attribution trailer, explicit-path staging (**never `git add -A`**), hooks and signing, the `pr-gate-agent` findings, force-push/amend (never once a PR is open), and owner merge authority. Those rules are not restated here; where this section appears to differ, `AGENTS.md` prevails for Git/PR mechanics. This section adds only:

- Every PR MUST state summary, rationale/scope, linked work item, known collisions/dependencies, test evidence and outstanding gates. Wide-scope changes retain the required PR-template rationale.
- Before declaring merge eligibility, check the intended base, reviewed exact HEAD, branch freshness, current protections, successful required `ci` and `pr-gate-agent` checks, resolved review threads, owner approval evidence (below) and applicable acceptance. Draft status permits incomplete work to be visible; it does not waive verification.
- The repository owner controls merges and release decisions. Configured zero required approval reviews or administrator bypass capability are not self-approval. Do not change branch protections, checks, release tags, manifests or deployment settings as part of policy-only work.

**Single-identity operation.** While human and automated contributors act through the same GitHub account, GitHub permissions, required reviewers and check results cannot distinguish them. A contributor other than the repository owner MUST NOT merge a PR, push or delete tags, dispatch `candidate-release` or `promote-release`, approve an environment deployment, change repository settings, delete branches it did not create, or unlock or remove a worktree, unless the repository owner gave, in the current session, an explicit instruction naming that action and its exact target (PR number and head SHA, tag, workflow inputs, or worktree). The contributor MUST quote that instruction in the work record before acting. **Owner approval** is evidenced only by an owner-made PR review or comment naming the approved head SHA, or by the repository owner performing the merge. Contributors MUST NOT author, paraphrase or infer that evidence.

## 10. Verification and evidence levels

Evidence cited for acceptance, merge eligibility or cleanup MUST identify command/test, environment, revision or artifact ID, outcome, timestamp, and any limitation; other evidence SHOULD. Separate at least:

| Level | What it establishes | What it does not establish |
| --- | --- | --- |
| Static review / unit tests | Bounded source and fixture behavior | Installed desktop or live-game behavior |
| Hosted CI / PR gate | Configured checks for the recorded commit | Local Windows configuration, real devices, gameplay, audio or FPS |
| Native/runtime validation | Recorded Windows/Tauri/install/GSI scenarios | Unrun live Dota and resource scenarios |
| Live UAT / performance | Specifically measured game, capture, audio, latency and resource acceptance | Untested configurations or blanket platform compatibility |

Contributors MUST NOT convert `NOT_RUN` or `UNKNOWN` to `PASS` based on another evidence level. Follow accepted MVP privacy, critical-path latency, CPU/RAM/FPS and consent constraints. Protect runtime profiles, signing keys, CV/GSI/voice data, credentials and test evidence under existing access controls; do not upload them into public reports.

For changes to `docs/`, `AGENTS.md`, `CLAUDE.md` or doc-graph tooling, run `node tools/doc-graph/ci-gate.mjs` in an **owned writable** workspace and include the regenerated outputs in the reviewed diff. Generated artifacts (graph/report, feature ledger, orphan reports, atomic index) are a shared integration surface: generate them on the final branch HEAD after the last update from `main`, never copy or hand-merge them from another branch, and regenerate whenever `main` advances before merge. In a coordinator-run multi-lane plan the coordinator MAY regenerate once on the integration SHA, provided each PR that lands on `main` carries artifacts generated from its own final HEAD. CI currently regenerates these files in the runner without comparing them to the committed files; a green `ci` is not evidence of freshness. New/edited docs require established frontmatter and an exact `## Changelog` heading, with matching version/changelog entry. Check relative links and semantic consistency with ADRs/contracts. **If generation or required tests cannot be run, keep the PR Draft and mark each missing gate NOT_RUN with the reason; do not claim ready for merge.**

Avoid duplicate native builds/installs and heavy concurrent workloads. Inspect available capacity and resource ownership before running expensive checks; reuse safe caches without modifying another writer's state.

## 11. Post-merge retention and authorized cleanup

Cleanup is a separate authorized work item. `MERGED`, `COMPLETED`, clean status, and `git worktree prune` candidates are **not** deletion criteria.

A worktree may become `VERIFIED_SAFE` only after **all** of the following have affirmative evidence:

1. The current writer expressly released the workspace and removed its own `git worktree lock`; no active task, downstream branch, session, runtime, native/UAT or evidence consumer still needs it.
2. The final task/PR disposition and dependency graph are reconciled.
3. All staged, unstaged, untracked, **ignored**, unpushed and local-ref-only changes, stash entries, plus relevant caches/runtime data, have been inventoried; unique work has a verified, authorized and recoverable preservation path.
4. The exact canonical target path, common Git directory, symlinks/junctions and retained refs were checked. The primary/common repository and other contributors' trees are excluded.
5. The repository owner, or the releasing writer for its own workspace, approved the specific removal, and the recovery and verification steps are recorded.

Only then MAY a separately authorized normal linked-worktree removal occur; branch/ref deletion has its **own** reachability and authorization check. Never force-remove a merged tree, delete unknown data, stop someone else's runtime, or clear shared caches, credentials, databases or evidence to make space. Record the exact result and validate remaining registrations and recovery artifacts afterward.

## 12. Governance, compliance and exception handling

The assigner maintains accurate assignment records; the writer maintains handoff evidence for its workspace. Contributors verify before writes. Reviewers independently examine scope, dependencies and evidence; an automated or assistant review is recorded as an agent review and is not owner approval. The repository owner approves merges and exceptional recovery/removal. These roles can be held by humans or delegated automation only within explicitly recorded authority; role names do not grant implicit machine permissions.

Existing GitHub protections, PR gate and doc-graph checks enforce **only their configured subset**. This document is a behavioral control and is not a filesystem lock. Where a control cannot be observed or enforced, record the gap and fail closed for destructive or ownership-changing operations.

Exceptions to SHOULD rules require a documented reason, risk, owner and expiry/review condition. MUST-level safety, privacy, protected-main, signing and preservation controls cannot be silently waived; any proposed change to them requires a separate approved governance change, not an ad hoc session instruction. Repository-owner approval of this policy is recorded in its frontmatter as `status: accepted` with `approved_by`, `approved_date` and `approval_basis`, accompanied by a changelog row; until then it is `active`. Review this policy when a material collaboration incident, worktree workflow change, or new automation integration exposes a control gap.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-04 | Add reuse-first ownership, dependency recovery and post-merge cleanup verification while retaining existing Git, review and native acceptance gates. |
| 0.2.0 | 2026-11-07 | Define platform-neutral normative controls, evidence-backed ownership/scope decisions, safe handoff and offline recovery, independent task/workspace states, verification matrix, and authorized cleanup without adding a mandatory registry. |
| 0.2.1 | 2026-11-07 | Address independent governance review of PR #152: define repository owner / assigner / writer roles, single-identity operation and owner-approval evidence, claim serialization, solo-lane entry path, public-safe workspace identity, `git worktree lock` as visibility guard, repository-wide Git state protections, generated-artifact freshness ordering, conflict precedence, and point to `AGENTS.md` instead of restating Git/PR rules. |
