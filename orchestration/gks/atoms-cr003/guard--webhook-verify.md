---
id: guard--webhook-verify
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# GUARD: Pure fn: decideWebhookAction(charge, order) [L3-Logic] guard--webhook-verify

**Phase:** P2 · **Tier:** H1 · **Type:** guard · **Est:** 1 · **MoSCoW:** must

### Description
Single pure function in supabase/functions/_shared/webhook-verify.ts: `decideWebhookAction(fetchedCharge: {id,status,amount,metadata}, order: {id,status,price_satang,provider_charge_id}): 'credit'|'fail'|'expire'|'ignore'`. Rules: charge must match order.provider_charge_id AND amount==price_satang; paid->'credit' only if order.status=='pending'; failed->'fail'; expired->'expire'; anything else/mismatch->'ignore'. TDD: write webhook-verify.test.ts FIRST with >=6 cases (paid, paid-but-already-paid, amount mismatch, wrong charge id, failed, expired). Doc: CR-003 §2.5 (verify-by-refetch rule). Code: supabase/functions/_shared/webhook-verify.ts.

### Acceptance (DoD)
deno test green with all 6+ cases, tests committed before impl; function is pure (no fetch, no db).

### Depends on
[[config--local-first-micro-role]], [[entity--account-domain-types]]
