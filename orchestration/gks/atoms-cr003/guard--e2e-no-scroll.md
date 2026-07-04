---
id: guard--e2e-no-scroll
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# GUARD: E2E gate: zero page scroll on every tab (success meter) [L2-Feature] guard--e2e-no-scroll

**Phase:** P4 · **Tier:** H2 · **Type:** guard · **Est:** 1 · **MoSCoW:** must

### Description
WebdriverIO spec: for each of the 6 surfaces (4 tabs + Store + open TopupModal) at 1280x800 and DPI 125% emulation, assert scrollHeight <= clientHeight on the page root, with BOTH empty-state and max-seeded data. This is the enforcement of concept--noscroll-ui-policy — regressions fail CI, not eyes. Doc: CR-003 §3.0/5.4. Code: e2e/no-scroll.spec.ts.

### Acceptance (DoD)
Spec green on all 6x2x2 combinations; intentionally breaking one tab makes it fail (verified once).

### Depends on
[[feature--wallet-tab]], [[feature--topup-modal]], [[feature--store-page]], [[feature--inventory-tab]], [[feature--history-tab]]
