# RCA — gstore migration history drift blocks CR-016 deployment

## Symptom

`supabase db push --linked --dry-run` refused to prepare the CR-016 GMAD migration.

## Evidence

- Repository link resolves to `gstore` project ref `wsseitulmcgnolgsrxgh`.
- `supabase migration list --linked` reports remote history entries with no corresponding local
  migration files: `20260702123611`, `20260702143043`, `20260702151441`, `20260704004908`,
  `20260704005001`, `20260704030056`, `20260717061056`, `20260720111441`, and `20260720111529`.
- The dry run ends with: `Remote migration versions not found in local migrations directory.`
- A read-only production schema dump completed on 2026-07-21 after Docker Desktop was started:
  `.brain/schema-snapshots/gstore-public-20260721.sql` (40,986 bytes, SHA-256
  `835ACFF464459001FC39C602CE505B2D5DA54E2CA4A72A8699A4D9E815800A82`). It verifies the existing
  GID and Closed Beta objects needed before CR-016; it contains no table data.
- Existing ADR-14 bootstrap migration documents that part of the live project predated the repo
  migration directory, which is consistent with the observed history mismatch.

## Root cause

The live `gstore` migration history and the repository's `supabase/migrations/` history were
created independently. The project was linked successfully, but the CLI correctly refuses to
apply new migrations while remote versions have no local source files.

## Why the issue escaped detection

Earlier GID/Closed Beta changes were applied through live/dashboard workflows and captured in the
repo later. This checkout had no linked-project verification or `db push --dry-run` gate before
CR-016 introduced a new production migration.

## Proposed prevention

1. Reconcile history deliberately: first create a backup and run a read-only schema pull/diff in a
   dedicated reconciliation change; do not run the CLI-suggested `migration repair` blindly.
2. Reconcile the missing remote migrations into reviewed local artifacts, or explicitly approve a
   history repair after verifying every version's schema effect.
3. Add `supabase migration list --linked` plus `supabase db push --linked --dry-run` as a required
   pre-deploy gate for schema changes.
4. Keep Edge Function-only releases separate from schema releases where possible; `mint-gid` CORS
   was safely deployed because it needs no new migration.

## Resolution evidence

- With owner approval under CR-017, the nine orphaned remote history markers were marked
  `reverted` and the six matching pre-CR-016 local markers were marked `applied`.
- `supabase migration list --linked` now matches local and remote through `20260720184500`; only
  CR-016 (`20260721120000`) remains pending locally.
- `supabase db push --linked --dry-run` proposes only CR-016 and was not applied.
- The public schema SHA-256 is identical before and after the marker-only operation:
  `835ACFF464459001FC39C602CE505B2D5DA54E2CA4A72A8699A4D9E815800A82`.
