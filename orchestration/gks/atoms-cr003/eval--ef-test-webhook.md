---
id: eval--ef-test-webhook
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# EVAL: Deno tests: payment-webhook (EF-03/04/05) — RED first [L2-Feature] eval--ef-test-webhook

**Phase:** P2 · **Tier:** H1 · **Type:** eval · **Est:** 1 · **MoSCoW:** must

### Description
Write supabase/functions/tests/payment-webhook.test.ts BEFORE the handler: EF-03 forged event (charge not found on refetch) credits nothing; EF-04 same event id x5 -> 200 every time, credited once (webhook_events PK); EF-05 failed/expired flips order status with no ledger row. Doc: CR-003 §5.3. Code: supabase/functions/tests/.

### Acceptance (DoD)
deno test runs red with EF-03/04/05 encoded.

### Depends on
[[config--seed-dev]]
