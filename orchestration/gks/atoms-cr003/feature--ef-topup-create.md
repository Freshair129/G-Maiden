---
id: feature--ef-topup-create
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# FEATURE: Edge Fn topup-create (PromptPay/TrueMoney charge) [L2-Feature] feature--ef-topup-create

**Phase:** P2 · **Tier:** H2 · **Type:** feature · **Est:** 2 · **MoSCoW:** must

### Description
Implement CR-003 §2.5 topup-create: JWT auth, read package price from coin_packages (never from client), create Omise charge (source promptpay | truemoney), insert topup_orders pending with snapshots + expires_at, return {order_id, qr_image_uri|authorize_uri, expires_at}. Doc: CR-003 §2.5/2.6. Code: supabase/functions/topup-create/index.ts.

### Acceptance (DoD)
eval--ef-test-topup-create GREEN; manual sandbox call yields a scannable test QR.

### Depends on
[[eval--ef-test-topup-create]]
