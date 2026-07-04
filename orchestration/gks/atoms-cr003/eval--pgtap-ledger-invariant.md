---
id: eval--pgtap-ledger-invariant
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# EVAL: pgTAP: balance == Σ ledger invariant (DB-08) — closing gate P1 [L3-Storage] eval--pgtap-ledger-invariant

**Phase:** P1 · **Tier:** H1 · **Type:** eval · **Est:** 1 · **MoSCoW:** must

### Description
Write supabase/tests/cr003_invariant.sql: after running a mixed scenario (topup, purchase, redeem, failed purchase), assert for every user wallets.balance = SUM(wallet_ledger.amount) and every balance_after chain is consistent. This is the P1 phase gate + the nightly job query. Doc: CR-003 §5.2/5.5. Code: supabase/tests/cr003_invariant.sql.

### Acceptance (DoD)
GREEN on the seeded scenario; query documented for nightly reuse.

### Depends on
[[algo--fn-purchase-item]], [[algo--fn-credit-topup]], [[algo--fn-redeem-code]]
