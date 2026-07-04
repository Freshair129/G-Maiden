---
id: eval--pgtap-credit-idempotent
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# EVAL: pgTAP: credit_topup idempotency (DB-06) — RED first [L3-Logic] eval--pgtap-credit-idempotent

**Phase:** P1 · **Tier:** H1 · **Type:** eval · **Est:** 1 · **MoSCoW:** must

### Description
Write supabase/tests/cr003_credit.sql BEFORE credit_topup exists: calling credit_topup 3x on one pending order credits exactly once, exactly one ledger row, order status pending->paid with paid_at set. Doc: CR-003 §5.2. Code: supabase/tests/cr003_credit.sql.

### Acceptance (DoD)
File runs red and encodes DB-06 as pgTAP assertions.

### Depends on
[[config--sql-migration-wallet]], [[config--sql-migration-billing]]
