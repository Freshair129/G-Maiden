---
id: feature--store-api
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# FEATURE: storeApi.ts — thin client for RPC/Edge Fns [L2-Feature] feature--store-api

**Phase:** P3 · **Tier:** H1 · **Type:** feature · **Est:** 1 · **MoSCoW:** must

### Description
src/src/wallet/storeApi.ts: listCatalog(), listPackages(), purchase(itemId) -> rpc purchase_item, redeem(code) -> rpc redeem_code, createTopup(packageId, provider) -> fn topup-create, packDownloadUrl(itemId) -> fn pack-download. Thin wrappers only — zero business logic client-side; typed errors {code, messageTh}. TDD self-contained: storeApi.test.ts FIRST with mocked supabase.rpc/functions.invoke. Doc: CR-003 §3.7. Code: src/src/wallet/storeApi.ts.

### Acceptance (DoD)
vitest green (tests first); every export is <=15 lines; no price/balance math in this file.

### Depends on
[[entity--account-domain-types]]
