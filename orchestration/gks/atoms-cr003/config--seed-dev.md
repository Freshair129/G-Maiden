---
id: config--seed-dev
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H0
role: worker
status: todo
---

# CONFIG: Dev seed: packages, catalog, codes, test users [L3-Storage] config--seed-dev

**Phase:** P1 · **Tier:** H0 · **Type:** config · **Est:** 1 · **MoSCoW:** must

### Description
supabase/seed.sql per CR-003 §5.1: 3 coin_packages (S/M/L incl. bonus), 2 catalog_items (1 free, 1 priced, with pack_id/banner), 2 redeem codes (coins + item), 2 test users. Doc: CR-003 §5.1. Code: supabase/seed.sql.

### Acceptance (DoD)
supabase db reset --seed leaves the exact fixture set; ids stable for tests.

### Depends on
[[config--sql-migration-billing]], [[config--sql-migration-store]], [[config--sql-migration-ops]]
