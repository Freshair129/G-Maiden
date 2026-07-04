---
id: config--sql-migration-ops
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: worker
status: todo
---

# CONFIG: Migration: redeem_codes + redemptions + deletion_requests + profiles.role [L3-Storage] config--sql-migration-ops

**Phase:** P0 · **Tier:** H1 · **Type:** config · **Est:** 1 · **MoSCoW:** must

### Description
Create supabase/migrations/<ts>_cr003_ops.sql per CR-003 §2.2: redeem_codes (grant_type XOR check), redemptions (PK code+user_id), deletion_requests, and ALTER profiles ADD role. FK item_id -> catalog_items (hence dep). Doc: CR-003 §2.2. Code: supabase/migrations/.

### Acceptance (DoD)
supabase db reset applies cleanly; redeem_codes XOR check rejects a row with both coins and item_id.

### Depends on
[[config--sql-migration-store]]
