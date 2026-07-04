---
id: algo--fn-redeem-code
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# ALGO: plpgsql redeem_code(p_code) — locked grant [L3-Logic] algo--fn-redeem-code

**Phase:** P1 · **Tier:** H2 · **Type:** algo · **Est:** 1 · **MoSCoW:** should

### Description
Implement CR-003 §2.4 redeem_code: lock the code row FOR UPDATE, check expiry/max_uses, insert redemptions (PK = per-user fence), grant coins (ledger 'redeem') or item (inventory 'redeem'), bump used_count. GRANT EXECUTE to authenticated. Doc: CR-003 §2.4. Code: supabase/migrations/<ts>_cr003_fn_redeem.sql.

### Acceptance (DoD)
eval--pgtap-redeem GREEN.

### Depends on
[[eval--pgtap-redeem]], [[config--rls-policies]]
