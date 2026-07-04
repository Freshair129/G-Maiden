---
id: feature--ef-payment-webhook
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# FEATURE: Edge Fn payment-webhook (verify-by-refetch + idempotent credit) [L2-Feature] feature--ef-payment-webhook

**Phase:** P2 · **Tier:** H2 · **Type:** feature · **Est:** 2 · **MoSCoW:** must

### Description
Implement CR-003 §2.5 payment-webhook: insert webhook_events (on conflict do nothing -> 200 early-exit), refetch the charge from Omise with the secret key (never trust payload), call decideWebhookAction, then credit_topup / status update via service_role. Doc: CR-003 §2.5/2.6. Code: supabase/functions/payment-webhook/index.ts.

### Acceptance (DoD)
eval--ef-test-webhook GREEN; sandbox end-to-end: test-pay a charge -> order paid + balance credited exactly once.

### Depends on
[[eval--ef-test-webhook]], [[guard--webhook-verify]], [[algo--fn-credit-topup]]
