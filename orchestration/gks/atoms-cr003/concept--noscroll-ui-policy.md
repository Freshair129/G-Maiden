---
id: concept--noscroll-ui-policy
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: architect
status: todo
---

# CONCEPT: No-Scroll Desktop-First UI Policy [L1-Policy] concept--noscroll-ui-policy

**Phase:** P0 · **Tier:** H2 · **Type:** concept · **Est:** 1 · **MoSCoW:** must

### Description
Codify the fixed-viewport rule: NO page-level scroll anywhere in the deck; unbounded data (ledger, catalog) uses in-frame pagination sized by algo--fit-rows; overflow means add a tab, never scroll. Baseline: min logical window 1280x800 at 100%/125%/150% Windows DPI. Thai strings: no fixed px widths, clamp+ellipsis. Doc: CR-003 §3.0. Output: policy section + per-tab content budget table.

### Acceptance (DoD)
CR-003 §3.0 written: min-window spec, DPI matrix, per-tab content budget (rows/cards per tab at baseline), tab-count ceiling (<=7 top-level), and the pagination-not-scroll rule. Reviewed by Boss.

### Depends on
(none)
