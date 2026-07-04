---
id: config--sql-migration-store
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: worker
status: todo
---

# CONFIG: Migration: catalog_items + purchases + inventory [L3-Storage] config--sql-migration-store

**Phase:** P0 · **Tier:** H1 · **Type:** config · **Est:** 1 · **MoSCoW:** must

### Description
Create supabase/migrations/<ts>_cr003_store.sql per CR-003 §2.2: catalog_items (sku unique, status check), purchases (unique(user_id,item_id) — the double-buy fence), inventory (unique(user_id,item_id), source check). Doc: CR-003 §2.2. Code: supabase/migrations/.

### Acceptance (DoD)
supabase db reset applies cleanly; both unique(user_id,item_id) constraints verified present.

### Depends on
(none)
