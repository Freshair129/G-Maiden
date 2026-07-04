---
id: feature--wallet-tab
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# FEATURE: Wallet tab — balance hero + 3-row ledger preview [L2-Feature] feature--wallet-tab

**Phase:** P4 · **Tier:** H1 · **Type:** feature · **Est:** 1 · **MoSCoW:** must

### Description
src/src/wallet/WalletTab.tsx per mockup §1: balance hero (formatCoins, lifetime stats, GID), pending-order badge, '+ เติมเหรียญ' button opening TopupModal, ledger preview capped by rowsThatFit (default 3). Signed-out: benefit copy + sign-in CTA. Doc: CR-003 §3.2. Code: src/src/wallet/WalletTab.tsx.

### Acceptance (DoD)
Renders from useWallet only (no direct supabase); no overflow at baseline; vitest snapshot for signed-in/out/pending states.

### Depends on
[[feature--account-tabs-shell]], [[feature--wallet-hook]], [[algo--fmt-money]], [[algo--fit-rows]]
