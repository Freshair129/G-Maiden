---
id: algo--fn-purchase-item
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# ALGO: plpgsql purchase_item(p_item_id) — atomic buy [L3-Logic] algo--fn-purchase-item

**Phase:** P1 · **Tier:** H2 · **Type:** algo · **Est:** 2 · **MoSCoW:** must

### Description
Implement CR-003 §2.4 purchase_item: SECURITY DEFINER, price read server-side from catalog_items, wallet row FOR UPDATE lock, unique(user_id,item_id) as double-buy fence, single tx writing purchases+inventory+ledger+wallets. GRANT EXECUTE to authenticated. Doc: CR-003 §2.4. Code: supabase/migrations/<ts>_cr003_fn_purchase.sql.

### Acceptance (DoD)
eval--pgtap-purchase-atomic GREEN incl. the concurrency case (DB-05).

### Depends on
[[eval--pgtap-purchase-atomic]], [[config--rls-policies]]
