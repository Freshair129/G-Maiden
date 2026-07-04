---
id: algo--suggest-package
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H0
role: coder
status: todo
---

# ALGO: Pure fn: suggestPackage(deficit, packages) [L3-Logic] algo--suggest-package

**Phase:** P3 · **Tier:** H0 · **Type:** algo · **Est:** 1 · **MoSCoW:** must

### Description
src/src/wallet/suggest.ts: `suggestPackage(deficitCoins: number, packages: CoinPackage[]): CoinPackage | null` — cheapest active package whose coins+bonus >= deficit; null if none. Drives the 'เหรียญไม่พอ — เติมเลย' CTA. TDD first, >=5 cases (exact fit, between tiers, above max, empty list, inactive filtered). Doc: CR-003 §3.3. Code: src/src/wallet/suggest.ts.

### Acceptance (DoD)
vitest green, tests first; deterministic tie-break by price_satang asc.

### Depends on
[[config--local-first-micro-role]], [[entity--account-domain-types]]
