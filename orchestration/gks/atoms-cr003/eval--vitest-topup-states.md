---
id: eval--vitest-topup-states
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# EVAL: Vitest: topup modal state machine — RED first [L2-Feature] eval--vitest-topup-states

**Phase:** P4 · **Tier:** H1 · **Type:** eval · **Est:** 1 · **MoSCoW:** must

### Description
Write src/src/__tests__/topup-modal.test.ts BEFORE the modal: state machine pick-package -> pick-provider -> paying(pending) -> paid|expired|failed; assertions — paid closes with success feedback, expired offers 'สร้าง QR ใหม่' creating a NEW order (old never reused), closing mid-pending keeps the pending badge, provider=truemoney opens external browser exactly once. Doc: CR-003 §3.2 step 3, US-05. Code: src/src/__tests__/topup-modal.test.ts.

### Acceptance (DoD)
vitest red (modal missing) with all transitions + the no-reuse rule encoded.

### Depends on
[[entity--account-domain-types]]
