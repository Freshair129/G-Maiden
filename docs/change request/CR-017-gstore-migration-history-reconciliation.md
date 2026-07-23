---
title: "CR-017: Reconcile gstore migration history before CR-016 deployment"
doc_id: "CR-017-gstore-migration-history-reconciliation"
version: "0.2.0b"
created_at: "2026-07-21T13:10:00+07:00,ATHER"
last_update: "2026-07-21T13:25:00+07:00,ATHER"
status: "historical"
updated: "2026-07-21"
owner: "Boss"
attributes:
  doc_type: "change-request"
  domain: "platform-data"
  cluster: "supabase-migration-governance"
  scope: "gstore migration-history only"
  risk: "HIGH"
  execution_level: "C-3"
---

# CR-017 — Reconcile gstore migration history before CR-016 deployment

## Decision and completion

Boss approved this **metadata-only** reconciliation of the linked Supabase project's migration history.
It does not execute, revert, or modify schema/data. It aligns the `supabase_migrations.schema_migrations`
ledger with migrations whose schema effect already exists in production, so a later CR-016 migration can
be planned safely.

## Evidence and root cause

- Linked project: `gstore` / `wsseitulmcgnolgsrxgh`.
- `supabase migration list --linked` reports nine remote-only versions:
  `20260702123611`, `20260702143043`, `20260702151441`, `20260704004908`, `20260704005001`,
  `20260704030056`, `20260717061056`, `20260720111441`, `20260720111529`.
- It reports six pre-CR-016 local-only versions:
  `20260702000000`, `20260704000000`, `20260704120000`, `20260711120000`,
  `20260720183000`, `20260720184500`.
- `supabase db push --linked --dry-run` refuses with `Remote migration versions not found in local
  migrations directory.`
- Read-only production snapshot: `.brain/schema-snapshots/gstore-public-20260721.sql`
  (`SHA-256 835ACFF464459001FC39C602CE505B2D5DA54E2CA4A72A8699A4D9E815800A82`). It contains the
  required pre-CR-016 objects: `profiles.gid_code`, `profiles.generation`, `profiles.cohort_seq`,
  `profiles.role`, `closed_beta_enrollments`, the GID allocator, and the relevant RLS policies.

The supported root-cause record is [migration history drift](../../.brain/rca/2026-07-21-gstore-migration-history-drift.md).

## Scope and boundary

In scope:

- Add ledger entries for the six existing local migrations, marked `applied`.
- Remove the nine orphaned remote ledger entries, marked `reverted`.
- Re-run linked migration-list and dry-run checks.

Out of scope:

- Running the CR-016 GMAD migration.
- Changing production schema, RLS, Storage, Edge Functions, application data, or user accounts.
- Deploying the landing page or GMAD functions.

## Execution plan

1. Record a fresh read-only schema dump and its SHA-256 immediately before the repair.
2. Run `supabase migration repair --status reverted` once per remote-only version above. This removes
   only its orphaned history record; it runs no migration SQL.
3. Run `supabase migration repair --status applied` once per listed pre-CR-016 local version. This adds
   only the history marker; it runs no migration SQL.
4. Verify that `supabase migration list --linked` has matching local/remote status for every
   pre-CR-016 migration and that `20260721120000` remains local-only.
5. Run `supabase db push --linked --dry-run`. The only schema delta permitted to be proposed after
   reconciliation is CR-016; it must not be applied in this CR.
6. Save command output and a post-check schema-dump hash in the RCA/CR evidence.

## Rollback

If any ledger state is wrong, reverse the corresponding history marker with `migration repair`:
mark an incorrectly removed remote version `applied`, or an incorrectly inserted local version
`reverted`. No schema/data rollback is needed because this CR never executes schema SQL.

## Acceptance and exit criteria

- [x] Pre/post dumps are recorded, with matching SHA-256:
  `835ACFF464459001FC39C602CE505B2D5DA54E2CA4A72A8699A4D9E815800A82`.
- [x] No application, schema, RLS, storage, function, or user-data statement was executed.
- [x] Linked migration history is consistent for the six pre-CR-016 local migrations.
- [x] CR-016 remains pending and is the sole candidate schema delta in a fresh dry run.
- [x] Evidence is appended to the RCA and this CR; document graph validation passes.

## Execution evidence

- Reverted the nine orphaned remote history markers listed above.
- Applied history markers for the six pre-CR-016 local migrations listed above.
- `supabase migration list --linked` now reports matching local/remote versions through
  `20260720184500`, with only `20260721120000` local-only.
- `supabase db push --linked --dry-run` reports only
  `20260721120000_cr016_gmad_download_access.sql` and did not push it.
- Pre-repair snapshot:
  `.brain/schema-snapshots/gstore-public-pre-repair-20260721.sql`.
- Post-repair snapshot:
  `.brain/schema-snapshots/gstore-public-post-repair-20260721.sql`.

## Risk assessment

**HIGH / C-3.** The operation touches production migration metadata. It is intentionally separated
from schema deployment, has a reversible marker-level rollback, and needs explicit owner approval
after the snapshot evidence above.

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.2.0b | 2026-07-21 | implemented | Approved migration-history repair completed; schema hash and dry-run verified. | — | ATHER |
| 0.1.0b | 2026-07-21 | candidate | Proposed metadata-only reconciliation after production schema snapshot. | — | ATHER |
