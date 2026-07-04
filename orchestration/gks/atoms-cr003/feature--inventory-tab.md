---
id: feature--inventory-tab
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# FEATURE: Inventory tab — owned grid + redeem row [L2-Feature] feature--inventory-tab

**Phase:** P4 · **Tier:** H1 · **Type:** feature · **Est:** 1 · **MoSCoW:** must

### Description
src/src/wallet/InventoryTab.tsx per mockup §4: owned cards with source badges + acquisition date, redeem-code input row (redeem() -> new card appears), button ladder ติดตั้ง/ใช้งาน/กำลังใช้งาน (install wiring itself lands in feature--pack-install-wire — render states only here, injected via props/callback). Doc: CR-003 §3.4. Code: src/src/wallet/InventoryTab.tsx.

### Acceptance (DoD)
Redeem success adds the card without reload; duplicate redeem shows the polite error from typed storeApi errors; no overflow at baseline.

### Depends on
[[feature--account-tabs-shell]], [[feature--store-api]]
