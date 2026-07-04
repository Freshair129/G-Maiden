---
id: eval--ef-test-topup-create
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# EVAL: Deno tests: topup-create (EF-01/02) — RED first [L2-Feature] eval--ef-test-topup-create

**Phase:** P2 · **Tier:** H1 · **Type:** eval · **Est:** 1 · **MoSCoW:** must

### Description
Write supabase/functions/tests/topup-create.test.ts BEFORE the function: EF-01 valid package x2 providers returns order_id + qr/authorize URI, price taken from DB even when client sends a fake price; EF-02 no JWT -> 401, inactive package -> 400. Omise mocked via fetch stub. Doc: CR-003 §5.3. Code: supabase/functions/tests/.

### Acceptance (DoD)
deno test runs red (function missing) with all EF-01/02 assertions encoded.

### Depends on
[[entity--account-domain-types]], [[config--seed-dev]]
