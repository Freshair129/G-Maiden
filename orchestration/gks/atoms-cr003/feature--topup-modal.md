---
id: feature--topup-modal
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# FEATURE: Top-up modal — 3 steps, QR countdown, realtime settle [L2-Feature] feature--topup-modal

**Phase:** P4 · **Tier:** H2 · **Type:** feature · **Est:** 2 · **MoSCoW:** must

### Description
src/src/wallet/TopupModal.tsx per mockup §2: package cards (M tagged 'คุ้มสุด'), provider buttons, QR pane with qrCountdown + realtime status flip via useWallet pendingOrders, TrueMoney external-browser path, success/expired/failed states per the mockup. Optional deficit prop preselects via suggestPackage. Doc: CR-003 §3.2. Code: src/src/wallet/TopupModal.tsx.

### Acceptance (DoD)
eval--vitest-topup-states GREEN; sandbox manual run: test-pay flips the modal to success without reload.

### Depends on
[[eval--vitest-topup-states]], [[feature--store-api]], [[algo--countdown]], [[algo--suggest-package]], [[feature--ef-topup-create]]
