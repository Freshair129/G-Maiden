---
id: algo--fn-credit-topup
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# ALGO: plpgsql credit_topup(p_order_id) — idempotent credit [L3-Logic] algo--fn-credit-topup

**Phase:** P1 · **Tier:** H2 · **Type:** algo · **Est:** 1 · **MoSCoW:** must

### Description
Implement CR-003 §2.4 credit_topup: status-guarded UPDATE (pending->paid) as the idempotency latch, wallet FOR UPDATE, ledger insert. NO grant to authenticated — service_role only. Doc: CR-003 §2.4. Code: supabase/migrations/<ts>_cr003_fn_credit.sql.

### Acceptance (DoD)
eval--pgtap-credit-idempotent GREEN; \df+ shows no EXECUTE for authenticated.

### Depends on
[[eval--pgtap-credit-idempotent]], [[config--rls-policies]]
