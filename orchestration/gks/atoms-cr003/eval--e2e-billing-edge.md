---
id: eval--e2e-billing-edge
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# EVAL: E2E billing edges (expiry / insufficient / close-app / rate-limit) [L2-Feature] eval--e2e-billing-edge

**Phase:** P5 · **Tier:** H2 · **Type:** eval · **Est:** 2 · **MoSCoW:** must

### Description
WebdriverIO specs per CR-003 E2E-03/04/07 + EF-07: shortened-expiry QR -> UI offers regenerate, old order stays expired-uncredited; insufficient coins -> CTA opens modal with deficit package, zero RPC fired; pay-after-app-close -> reopen shows correct balance+history; 6th pending topup -> polite 429 surface. Doc: CR-003 §5.4. Code: e2e/billing-edge.spec.ts.

### Acceptance (DoD)
All four specs green; each asserts DB state, not just UI.

### Depends on
[[feature--topup-modal]], [[guard--rate-limit-topup]]
