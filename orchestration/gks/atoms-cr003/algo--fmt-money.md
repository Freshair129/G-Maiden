---
id: algo--fmt-money
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H0
role: coder
status: todo
---

# ALGO: Pure fns: formatCoins / formatSatang [L3-Logic] algo--fmt-money

**Phase:** P3 · **Tier:** H0 · **Type:** algo · **Est:** 1 · **MoSCoW:** must

### Description
src/src/wallet/format.ts: `formatCoins(n: number): string` -> thousands-separated, e.g. 2450 -> '2,450'; `formatSatang(satang: number): string` -> baht string, e.g. 10000 -> '฿100.00', 105050 -> '฿1,050.50'. TDD: format.test.ts FIRST (vitest), >=6 cases incl. 0 and negative ledger amounts. Doc: CR-003 §3.2. Code: src/src/wallet/format.ts.

### Acceptance (DoD)
vitest green (tests committed before impl); no locale API dependence (deterministic output).

### Depends on
[[config--local-first-micro-role]], [[entity--account-domain-types]]
