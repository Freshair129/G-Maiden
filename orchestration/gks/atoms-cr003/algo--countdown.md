---
id: algo--countdown
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H0
role: coder
status: todo
---

# ALGO: Pure fn: qrCountdown(expiresAt, now) [L3-Logic] algo--countdown

**Phase:** P3 · **Tier:** H0 · **Type:** algo · **Est:** 1 · **MoSCoW:** must

### Description
src/src/wallet/countdown.ts: `qrCountdown(expiresAtIso: string, nowMs: number): {mm: string, ss: string, expired: boolean}` — e.g. 872s left -> {mm:'14', ss:'32', expired:false}; past -> {mm:'00', ss:'00', expired:true}. TDD: countdown.test.ts FIRST, >=5 cases incl. exact-zero boundary. Doc: CR-003 §3.2 step 3. Code: src/src/wallet/countdown.ts.

### Acceptance (DoD)
vitest green, tests first; pure — caller passes now (no Date.now inside).

### Depends on
[[config--local-first-micro-role]], [[entity--account-domain-types]]
