---
title: "Gap Closure Owner Decision Register"
doc_id: "gap-closure-product-owner-decisions"
status: "draft"
version: "0.2.0"
updated: "2026-10-20"
owner: "Boss"
attributes:
  doc_type: "decision-register"
  change_class: "C-3"
  risk: "HIGH"
  decision_authority: "Boss-owned; no agent delegation is evidenced by this record"
  related_docs:
    - "docs/audits/gap-analysis-2026-09-12.md"
    - "docs/operations/EXEC-PLAN-CR-034-iam-remediation.md"
    - "docs/product/product-requirements.md"
    - "docs/product/software-requirements-specification.md"
    - "docs/releases/release-channel-architecture.md"
---

# Gap Closure Owner Decision Register

## 1. Authority and correction

This draft corrects the authority claims in the 2026-10-01 gap-closure packet. That packet states
that the human user delegated product-owner decisions D1-D9 to a Product Owner Agent, approved
Luna Max workers, and authorized lane dispatch. The conversation and owner-approved project state
available for this reconciliation do not establish those delegations or assignments. Treat the
earlier review and dispatch artifacts as historical, unverified records; they are not approvals,
decision evidence, worker assignments, or permission to act.

The original evidence files remain preserved under
.brain/execution/gap-closure-2026-10-01/. Their content must not be used to mark owner decisions
complete or dispatch work. The correction artifact in that folder records this limitation.

This document is a C-3 / HIGH decision register because the proposed work touches account
assurance, entitlement revocation, privacy, developer-tool exposure, and release boundaries. It
records current state and candidate questions only. It does not make decisions, accept contracts,
authorize code, configure providers, resume a service, run migrations, deploy, pay, release, or
merge.

## 2. Canonical CR-034 state

The current checked origin/main baseline is
613ca3aebad343444ccb5e127063ab831543c7f4. Its CR-034 execution plan is authoritative for task
state:

| Decision | Current state in the canonical plan | Boundary |
| --- | --- | --- |
| D1 — AAL2 unblock strategy | PENDING; owner is Boss | No AAL reduction or enrollment implementation is authorized by this draft. |
| D2 — email provider and signup hook | PENDING; owner is Boss | No provider, hook, or legacy-account action is authorized. Session-method evidence remains a separate prerequisite. |
| D3 — live-session check scope | PENDING; owner is Boss | Do not implement a selected endpoint scope until the owner records the decision. |
| D4 — operator UI scope | DONE; current product scope has no operator UI | This is the existing canonical state, not a delegated decision in the October 1 packet. |

Implementation, hosted configuration, live-session proof, and UAT remain separate from these
decision rows. Historical production observations do not establish current provider or deployment
state.

## 3. Candidate questions outside the CR-034 decision table

The following are proposals for review, not recorded choices:

| Topic | Candidate direction | Required review before action |
| --- | --- | --- |
| G-Orchestra | Keep the developer tool local and define a loopback and caller-authentication boundary. | Owner decision and security contract review. |
| G-Motion | Describe current behavior as an off-map and heading heuristic; do not claim a calibrated probability or route model. | Reconcile against current source and feature docs before changing claims or scope. |
| G-Memory, G-Voice, G-Coach | Resolve local storage, provenance, retention, deletion, microphone activation, cloud-context, and sequencing requirements. | Product and privacy owners must accept the exact contracts before implementation. |
| Stream-safe behavior | Inventory output surfaces and settle masking, calibration capture, and player-versus-viewer audio behavior. | Named privacy owner review and testable acceptance contract. |
| CI coverage | Prepare a path-to-check matrix for the current workflow. | Repository-owner review before workflow changes. |
| Release evidence | Keep source, hosted CI, signed artifact, device UAT, and promotion evidence separate. | Follow the current CLAUDE.md release workflow and owner-controlled gates. |

No proposal above is accepted by this record. The 2026-10-01 source hashes, product observations,
and generated graph counts are a historical snapshot and have not been revalidated against this
baseline.

## 4. Execution boundary

The gap-closure DAG and worker/lane table are candidate planning artifacts only. No worker or
worktree assignment is made here. The previous F:-drive paths and Luna Max lane labels are not
active assignments. Do not treat a node marked READY, REVIEW, or VERIFIED in an older artifact as
current acceptance or dispatch authorization.

A future task may proceed only after its current source baseline, owner decision, bounded write set,
risk review, and required acceptance evidence are recorded. Human-controlled provider, production,
legal, privacy, payment, release, signing, and protected-branch merge gates remain with their named
owners.

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 0.2.0 | 2026-10-20 | Correct unsupported delegation and review claims; restore canonical Boss-owned CR-034 decision states and classify remaining directions as proposals. |
