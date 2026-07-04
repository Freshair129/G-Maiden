---
id: feature--wallet-hook
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# FEATURE: useWallet() — balance + ledger + orders, realtime [L2-Feature] feature--wallet-hook

**Phase:** P3 · **Tier:** H2 · **Type:** feature · **Est:** 2 · **MoSCoW:** must

### Description
src/src/wallet/wallet.ts: useWallet() following the useProfile()/useAuth() patterns — loads wallets + recent ledger + pending topup_orders, subscribes Supabase Realtime on all three (own rows), merges via mergeLedger, exposes {wallet, ledger, pendingOrders, loaded}. Signed-out -> inert nulls (additive rule). Doc: CR-003 §3.7. Code: src/src/wallet/wallet.ts.

### Acceptance (DoD)
eval--vitest-wallet-hook GREEN; npx tsc --noEmit passes; no direct DB writes anywhere in the file.

### Depends on
[[eval--vitest-wallet-hook]], [[algo--ledger-page]]
