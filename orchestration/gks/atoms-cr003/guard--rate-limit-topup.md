---
id: guard--rate-limit-topup
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# GUARD: Rate limit: max pending topups per user (EF-07) [L2-Feature] guard--rate-limit-topup

**Phase:** P2 · **Tier:** H1 · **Type:** guard · **Est:** 1 · **MoSCoW:** should

### Description
Add to topup-create: count pending topup_orders for the user in the last hour; >5 -> 429 with a Thai-friendly error body. Pure helper `isRateLimited(pendingCount: number, limit=5): boolean` with its own test first. Doc: CR-003 §5.3 EF-07. Code: supabase/functions/topup-create/index.ts.

### Acceptance (DoD)
Test: 6th create within the window returns 429; earlier orders unaffected.

### Depends on
[[feature--ef-topup-create]]
