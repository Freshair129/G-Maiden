---
id: config--migration-identity-hardening-part-a
block_id: Genesis::GMaiden-SEC001-AuthHardening
context_scaling_tier: H1
role: coder
status: todo
---

# CONFIG: Migration Part A — revokes + search_path (safe) [L3-Storage] config--migration-identity-hardening-part-a

**Phase:** P0 · **Tier:** H1 · **Type:** config · **Est:** 1 · **MoSCoW:** must · ⛔ requiresConfirm

### Description
Apply Part A of supabase/migrations/20260704120000_sec001_identity_hardening.sql: revoke EXECUTE on alloc_cohort_seq + handle_new_user from anon/authenticated (F2/F3), revoke all on gid_counters + profiles from anon (F4), pin touch_updated_at search_path (F7). Non-breaking. Doc: SEC-001 §2 Phase A. Code: supabase/migrations/20260704120000_sec001_identity_hardening.sql.

### Acceptance (DoD)
After apply: get_advisors(security) no longer flags 0011/0028/0029 for these functions; signup still mints a cohort seq (trigger path unaffected); existing signed-in profile reads still work.

### Depends on
(none)
