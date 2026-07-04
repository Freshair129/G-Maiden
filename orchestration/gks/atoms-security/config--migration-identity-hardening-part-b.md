---
id: config--migration-identity-hardening-part-b
block_id: Genesis::GMaiden-SEC001-AuthHardening
context_scaling_tier: H2
role: coder
status: todo
---

# CONFIG: Migration Part B — column-lock + role column (BREAKING) [L3-Storage] config--migration-identity-hardening-part-b

**Phase:** P1 · **Tier:** H2 · **Type:** config · **Est:** 1 · **MoSCoW:** must · ⛔ requiresConfirm

### Description
Uncomment + apply Part B: revoke INSERT/UPDATE on profiles from authenticated, drop own_profile_insert, grant UPDATE(display_name,steamid64,account_id) only, add locked `role` column (default 'user', check user/creator/admin, no client grant). Closes F1 + makes CR-003's role safe from birth. Deploy in lockstep with the two feature atoms above. Doc: SEC-001 §2 Phase B step 2. Code: supabase/migrations/20260704120000_sec001_identity_hardening.sql.

### Acceptance (DoD)
eval--pgtap-identity-lock GREEN (forgery denied, display_name allowed); mint-gid + sign-in still work end-to-end; get_advisors(security) clean for the account schema.

### Depends on
[[eval--pgtap-identity-lock]], [[feature--ef-mint-gid]], [[feature--client-gid-mint-move]]
