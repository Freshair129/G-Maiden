---
id: eval--vitest-wallet-hook
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# EVAL: Vitest: useWallet realtime states — RED first [L2-Feature] eval--vitest-wallet-hook

**Phase:** P3 · **Tier:** H1 · **Type:** eval · **Est:** 1 · **MoSCoW:** must

### Description
Write src/src/__tests__/wallet-hook.test.ts BEFORE useWallet: mocked supabase client; cases — signed-out returns null wallet without subscribing; initial load populates balance+ledger; realtime wallet UPDATE mutates balance; realtime ledger INSERT prepends via mergeLedger; unsubscribes on unmount. Doc: CR-003 §3.7. Code: src/src/__tests__/wallet-hook.test.ts.

### Acceptance (DoD)
vitest runs red (hook missing) with all 5 states encoded.

### Depends on
[[entity--account-domain-types]]
