---
id: algo--fit-rows
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H0
role: coder
status: todo
---

# ALGO: Pure fn: rowsThatFit(viewportH, chromeH, rowH) — no-scroll budget [L3-Logic] algo--fit-rows

**Phase:** P3 · **Tier:** H0 · **Type:** algo · **Est:** 1 · **MoSCoW:** must

### Description
src/src/wallet/fit.ts: `rowsThatFit(viewportH: number, chromeH: number, rowH: number, min=3, max=20): number` — floor((viewportH-chromeH)/rowH) clamped to [min,max]. The primitive that makes every list obey the no-scroll policy (lists render exactly this many rows + a pager). TDD first, >=5 cases incl. tiny viewport clamping to min. Doc: CR-003 §3.0. Code: src/src/wallet/fit.ts.

### Acceptance (DoD)
vitest green, tests first; used by wallet/history tabs (grep proves call sites later).

### Depends on
[[config--local-first-micro-role]], [[concept--noscroll-ui-policy]]
