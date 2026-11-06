---
title: "Git and Worktree Lifecycle Policy"
doc_id: "GIT-WORKTREE-POLICY"
status: active
version: "0.1.0"
updated: "2026-11-04"
owner: "G-Maiden"
---
# Git and Worktree Lifecycle Policy

This implements workspace lifecycle rules for G-Maiden. The existing Git & GitHub section in root AGENTS.md, CLAUDE.md's release rules, accepted MVP contract and native acceptance requirements retain their authority. Read the applicable sections for the operation; these references do not require recursively rereading entrypoints. Codex users may also consult their global lifecycle policy; this document remains usable without it.

## Select and own the workspace

- Inspect repository/common-dir identity, branch/HEAD, remotes, upstream, staged/unstaged/untracked changes and existing worktrees before writes. Reuse the assigned checkout and suitable task branch first. Do not allocate a worktree merely because a task, chat or subagent starts.
- One active writer owns each mutable worktree. Identify the current owner through the existing task/session and a current handoff. Idle/archived chats, clean status, merged PRs and missing process matches do not prove ownership release. Unknown ownership is protected.
- Never take over an active implementation or native/runtime/testing workspace owned by another session, switch its branch, regenerate its documentation, or start/stop its processes. The verified assigned owner may continue its scoped work while protecting concurrent runtime/testing consumers. Prepare a patch/handoff if no owned editable location exists. Existing Workspace Recovery protections remain in effect.
- Read-only subagents may share the checkout. Serialize parent/subagent writer turns and all shared generators, indexes, lockfiles and Git operations. Use separate worktrees only when genuinely necessary for concurrent writes, destructive tests, incompatible builds or environment isolation; record owner and reason. Follow the existing outside-repository placement rule when allocation is authorized.
- Preserve unrelated and unpushed work. Stage explicit paths; never use `git add -A`, bypass hooks, change signing configuration, force-push or amend an open PR contrary to the existing Git rules.

Use existing issue/PR/session notes to record owner, branch/HEAD/path, scope, dependencies, checks, native/UAT gaps, dirty/ignored/unpushed work, runtime users and resume conditions. Transfer ownership only after the former writer releases it and the receiver verifies current state. No new controller or mandatory registry is introduced.

## Branch, review and delivery

Reuse suitable owned branches. Otherwise follow `wip/<topic>`, `fix/<topic>` or `docs/<topic>`. Main is PR-only, including documentation. Always select the intended remote explicitly: `origin` is G-Maiden; `rwang` is a different repository. A new push uses `git push -u origin <branch>`.

Preserve Conventional Commits (`type(scope): subject`) and the existing trailer naming the authoring agent. Do not change release versions or tags for a governance documentation change.

Before merge eligibility, verify exact reviewed HEAD, intended base, current branch protection, required `ci` and `pr-gate-agent` success, strict base freshness, review-thread resolution and all applicable acceptance. Retain the PR template's Summary/scope rationale. Draft relaxation is for unfinished PRs, not acceptance. The configured zero mandatory approval count and administrator bypass capability do not grant self-merge permission: the owner merges. Do not disable or bypass any gate.

Native Windows/Tauri builds, installed behavior, injected GSI, live Dota, acoustic and resource acceptance remain distinct evidence levels under the accepted MVP and release documents. Unit/browser/CI success does not establish them. Runtime/UAT ownership and the evidence files it needs stay protected after source merge.

## Dependency-aware recovery

Use DISCOVER → REUSE OR ALLOCATE → EXECUTE → VERIFY → REVIEW → MERGE OR RETIRE → CLEANUP. Record final disposition in the existing task or PR.

Use ACTIVE, READY_TO_FINISH, BLOCKED_BY_DEPENDENCY, BLOCKED_BY_UAT, BLOCKED_BY_DECISION, SUPERSEDED, COMPLETED, MERGED, RETIRED or UNKNOWN with supporting evidence. Name the blocker, responsible owner and resume trigger for unfinished work. Recover valid unfinished work before cleanup; retire obsolete work only with authorized disposition and preservation of unique changes. Chat closure does not close the task.

Record prerequisite PRs, contracts and artifact revisions. Integrate prerequisites into the intended target before independently merging a dependent PR. Recompute the diff and rerun exact-head checks after authorized base changes; retain parent branches/worktrees needed by children. A merged source change with outstanding native UAT remains blocked for that acceptance scope.

## Documentation validation

Any change to docs, AGENTS.md or CLAUDE.md requires `node tools/doc-graph/ci-gate.mjs` in an owned writable location. It regenerates graph/report, feature ledger/orphan reports and atomic index artifacts; include the resulting relevant artifacts in the reviewed patch. Do not run this writer inside someone else's checkout.

New/edited documentation uses the established frontmatter fields and an exact `## Changelog` heading; frontmatter version must match its last changelog row. Relative links must resolve. Existing full review/verify requirements remain applicable before declaring a branch ready; this policy does not grant a documentation exemption from the repository's required CI or native gates. A file-only handoff can record static validation while leaving generator, full CI and review gates explicitly unrun.

Before integration, compare current ADRs/contracts, source diff, other agents' ownership and generated outputs. Resolve semantic drift as well as textual conflicts. Do not use policy changes to restore retired media paths, loosen the accepted MVP, or infer runtime acceptance.

## Post-merge cleanup boundary

Classify the worktree independently as PROTECTED, REVIEW_REQUIRED, VERIFIED_SAFE or CLEANED. MERGED never implies VERIFIED_SAFE. Cleanup is a separate authorized task.

Eligibility needs current owner release plus session/process/runtime checks, final task disposition, no remaining dependency/UAT/evidence consumer, complete staged/unstaged/untracked/ignored/local-ref/unpushed inventory, and verified recoverable preservation of unique content. Clean status misses ignored assets, local runtime data and build evidence. A patch/bundle alone may not cover them.

Before any authorized removal, verify exact resolved path and junction/symlink boundaries, appropriate recovery artifact coverage/integrity and retained refs. Never force-remove a merged tree, discard local changes, remove the primary/common Git directory, or infer safety from a prunable registration. Normal linked-tree removal and branch deletion need separate reachability checks. Verify registrations/recovery and record the exact result afterward.

Avoid duplicate builds/installs. Reuse safe caches and check all relevant drives before heavy work; do not run heavy parallel builds on critically full disks. Shared caches, Codex/Dot state, signing material, runtime profiles, databases and active evidence require verified ownership/recovery and applicable authority before cleanup. Never stop a runtime to make this documentation task easier.

## Enforcement and recovery

GitHub branch protection and `pr-gate-agent` enforce their configured PR/check rules; the doc-graph gate checks documentation. Neither Markdown nor a clean gate locks the filesystem or proves exclusive ownership. Review current settings before relying on them. Templates assist reviewers; new hooks, CODEOWNERS or automation require a separate proposal. Do not modify protection settings in a documentation change.

If ownership collides or an operation has an unexpected effect, stop dependent mutations, preserve refs/diffs/logs and report through the authorized task channel. Restore only affected owned files from verified evidence after checking for newer work. Use the existing RCA process for material incidents; never clean or garbage-collect recovery evidence.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.1.0 | 2026-11-04 | Add reuse-first ownership, dependency recovery and post-merge cleanup verification while retaining existing Git, review and native acceptance gates. |
