---
id: config--rls-policies
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# CONFIG: RLS policies + revokes (all 11 tables) [L3-Storage] config--rls-policies

**Phase:** P1 · **Tier:** H2 · **Type:** config · **Est:** 2 · **MoSCoW:** must

### Description
Security-critical: implement CR-003 §2.3 verbatim — enable RLS on all 11 tables, own-row SELECT policies, public read on active coin_packages/catalog_items, no client write policies anywhere, plus the REVOKE block. Doc: CR-003 §2.3. Code: supabase/migrations/<ts>_cr003_rls.sql.

### Acceptance (DoD)
eval--pgtap-rls-isolation goes GREEN; a manual psql check as authenticated confirms catalog is readable signed-out and wallets are not writable.

### Depends on
[[eval--pgtap-rls-isolation]], [[config--sql-migration-ops]]
