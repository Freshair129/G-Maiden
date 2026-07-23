---
title: "CR-019: Owner role and controlled operator delegation"
doc_id: "CR-019-owner-role-and-operator-delegation"
status: "active"
version: "0.3.1b"
updated: "2026-07-22"
owner: "Boss"
attributes:
  domain: "account-identity"
  cluster: "operator-authorization"
  system: "G-Maiden"
  risk: "HIGH"
  execution_level: "C-3"
---

# CR-019 — Owner role and controlled operator delegation

## Goal

Add an application-level `owner` role above `admin` for accountable product operation, without
turning developer infrastructure access into a player-account privilege.

## Current state

`profiles.role` allows only `user`, `creator`, and `admin`. The G-Maiden controller grants actions
only to `admin`; no role can delegate roles. Client-side profile updates cannot modify `role`.

## Proposed authorization model

| Role | G-Maiden batch operations | Role delegation | Platform access |
|---|---:|---:|---|
| `user` | no | no | none |
| `creator` | no | no | none |
| `admin` | yes | no | none |
| `owner` | yes | yes, `user`/`creator`/`admin` only | none implied |

- `owner` is assigned only by service-role / a trusted platform operator.
- An owner cannot create another owner through the landing controller. Owner assignment/removal is
  a break-glass dashboard/approved migration operation with audit evidence.
- Every owner-initiated role change is written to `gmad_download_audit` (or a dedicated
  authorization audit table if the review determines that scope is clearer).
- The G-Maiden controller accepts `admin` or `owner` for its existing operations; only `owner` may call
  the new role-delegation action.
- Supabase/Vercel project membership remains the way a developer receives deploy/database access;
  it is intentionally separate from `profiles.role`.

## Required implementation surfaces

1. Migration: extend the role constraint to include `owner`, preserving default `user` and client
   column-level restrictions.
2. Edge Function: replace the single-role guard with auditable role capability checks and add a
   narrow owner-only delegation action.
3. Landing `/ops`: display the operator role, and expose role management only to an owner.
4. Tests: reject every non-owner delegation attempt; reject owner-to-owner delegation; verify audit
   writes and unchanged G-Maiden admin behavior.
5. Threat model/RLS review: ensure no user can self-elevate through JWT metadata, direct REST,
   or a crafted Function request.

## First-owner bootstrap (required input)

Boss approved an existing account email as the first-owner target. It is resolved exactly once by a
trusted server-side operator and is not stored in this repository, migration, client, or audit
detail. The operation aborts unless exactly one existing profile matches case-insensitively.

## Risk and rollback

**HIGH / C-3.** This changes authorization semantics. Rollback removes owner-only UI/actions and
reverts the role constraint only after all owner rows have been remediated to `admin`; audit records
are retained. No owner role is created during this proposal.

## Approval gate

Boss approved CR-019 and provided the first-owner bootstrap target on 2026-07-21.

## Execution evidence

- Migration `20260721130000_cr019_owner_role_and_delegation.sql` is applied to `gstore`.
- Exactly one existing profile matched the approved bootstrap email; it was set to `owner` and an
  `owner_bootstrapped` audit row was written. The email is not stored in repository artifacts.
- `admin-gmad-controller` version 3 is active. It permits `admin` and `owner` for existing G-Maiden
  operations, while `change_role` requires `owner` and can grant only `user`, `creator`, or `admin`.
- `deno check` passed for the deployed Function; direct signed-in owner UAT remains the final
  confirmation for the browser session and delegation workflow.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
|---|---|---|---|---|---|
| 0.3.1b | 2026-07-22 | beta | Normalized reader-facing controller wording from GMAD to G-Maiden while preserving deployed function identifiers. | null | ATHER |
| 0.3.0b | 2026-07-21 | beta | Owner schema, audited one-time bootstrap, and operator controller deployed; signed-in owner UAT remains. | null | ATHER |
| 0.2.0b | 2026-07-21 | accepted | Boss approved owner delegation and supplied an existing email for one-time server-side bootstrap. | null | ATHER |
| 0.1.0b | 2026-07-21 | candidate | Proposed C-3 owner delegation model; awaiting first-owner GID and approval. | null | ATHER |
