---
id: feature--account-tabs-shell
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H2
role: coder
status: todo
---

# FEATURE: Fixed-viewport Account shell: 4 tabs, zero page scroll [L2-Feature] feature--account-tabs-shell

**Phase:** P4 · **Tier:** H2 · **Type:** feature · **Est:** 2 · **MoSCoW:** must

### Description
Extend AccountPage.tsx into the tabbed shell [Account | Wallet | Inventory | History] per the CR-003 mockup: fixed-height layout (100% of the deck content area, overflow:hidden at page level), tab bar + content pane grid. Existing Account content (AuthPanel/SteamLink/profile) becomes the first tab unchanged. Doc: CR-003 §3.0/3.1. Code: src/src/AccountPage.tsx.

### Acceptance (DoD)
At 1280x800 logical, document.scrollingElement.scrollHeight == clientHeight on every tab (empty states); existing Account tests/behavior unchanged; tab state preserved across switches.

### Depends on
[[concept--noscroll-ui-policy]]
