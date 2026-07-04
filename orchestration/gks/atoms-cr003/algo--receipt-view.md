---
id: algo--receipt-view
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H0
role: coder
status: todo
---

# ALGO: Pure fn: toReceipt(order) — receipt projection [L3-Logic] algo--receipt-view

**Phase:** P3 · **Tier:** H0 · **Type:** algo · **Est:** 1 · **MoSCoW:** should

### Description
src/src/wallet/receipt.ts: `toReceipt(order: TopupOrder, pkg: CoinPackage | null): ReceiptView` — maps to {orderId, channelLabel('PromptPay QR'|'TrueMoney Wallet'), amountLabel(formatSatang), coinsLabel(base+bonus), providerRef, paidAtLabel}. TDD first, >=4 cases (both providers, missing pkg fallback, unpaid order). Doc: CR-003 §3.5. Code: src/src/wallet/receipt.ts.

### Acceptance (DoD)
vitest green, tests first; output matches the mockup receipt fields 1:1.

### Depends on
[[config--local-first-micro-role]], [[entity--account-domain-types]]
