---
id: eval--pgtap-rls-isolation
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# EVAL: pgTAP: RLS isolation (DB-01/02) — RED first [L3-Storage] eval--pgtap-rls-isolation

**Phase:** P1 · **Tier:** H1 · **Type:** eval · **Est:** 1 · **MoSCoW:** must

### Description
Write supabase/tests/cr003_rls.sql (pgTAP) BEFORE the policies exist (must be red): DB-01 authenticated cannot UPDATE wallets / INSERT wallet_ledger directly; DB-02 user A selecting user B's wallets/ledger/orders/inventory gets 0 rows. Doc: CR-003 §5.2. Code: supabase/tests/cr003_rls.sql.

### Acceptance (DoD)
supabase test db runs the file; all assertions fail (red) pre-policies and are written to pass once config--rls-policies lands.

### Depends on
[[config--sql-migration-wallet]], [[config--sql-migration-billing]], [[config--sql-migration-store]]
