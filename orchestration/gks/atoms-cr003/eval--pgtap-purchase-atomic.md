---
id: eval--pgtap-purchase-atomic
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# EVAL: pgTAP: purchase atomicity + concurrency (DB-03/04/05) — RED first [L3-Logic] eval--pgtap-purchase-atomic

**Phase:** P1 · **Tier:** H2 · **Type:** eval · **Est:** 2 · **MoSCoW:** must

### Description
Write supabase/tests/cr003_purchase.sql BEFORE purchase_item exists: DB-03 happy path inserts purchases+inventory+ledger and decrements balance with consistent balance_after; DB-04 insufficient balance raises and inserts NOTHING; DB-05 two concurrent sessions buying with balance for one — at most one succeeds, balance never negative (use two dblink/pg_background sessions or advisory-lock simulation). Doc: CR-003 §5.2. Code: supabase/tests/cr003_purchase.sql.

### Acceptance (DoD)
File runs red (function missing) and encodes all three scenarios as pgTAP assertions.

### Depends on
[[config--sql-migration-wallet]], [[config--sql-migration-store]]
