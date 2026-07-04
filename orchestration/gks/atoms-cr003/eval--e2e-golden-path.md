---
id: eval--e2e-golden-path
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# EVAL: E2E-01 golden path (sign-in -> topup -> buy -> install -> history) [L2-Feature] eval--e2e-golden-path

**Phase:** P5 · **Tier:** H2 · **Type:** eval · **Est:** 2 · **MoSCoW:** must

### Description
WebdriverIO + tauri-driver journey per CR-003 E2E-01: mock session injection -> welcome coins visible -> topup via Omise test-pay API -> balance flips realtime -> buy pack -> inventory install (manifest on disk) -> activate -> History shows 3 entries. Doc: CR-003 §5.4. Code: e2e/golden-path.spec.ts.

### Acceptance (DoD)
Spec green on a Windows runner against the dev-branch Supabase + Omise sandbox; disk assertion on voice-cache manifest included.

### Depends on
[[feature--pack-install-wire]], [[feature--topup-modal]], [[feature--store-page]]
