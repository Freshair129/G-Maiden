---
id: feature--ef-pack-download
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# FEATURE: Edge Fn pack-download (entitlement-gated signed URL) [L2-Feature] feature--ef-pack-download

**Phase:** P2 · **Tier:** H1 · **Type:** feature · **Est:** 1 · **MoSCoW:** must

### Description
Implement CR-003 §2.5 pack-download: JWT auth, check inventory row for the item, issue a 5-min signed URL for bundle_path in the private 'packs' Storage bucket. TDD self-contained: write pack-download.test.ts FIRST (has-item / no-item-403 / no-jwt-401 / URL-expiry). Doc: CR-003 §2.5, EF-06. Code: supabase/functions/pack-download/index.ts.

### Acceptance (DoD)
All 4 test cases green (written first); URL stops working after expiry.

### Depends on
[[config--sql-migration-store]]
