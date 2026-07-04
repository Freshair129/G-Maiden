---
id: feature--deletion-request
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# FEATURE: Danger zone — PDPA deletion request (2-step confirm) [L2-Feature] feature--deletion-request

**Phase:** P4 · **Tier:** H1 · **Type:** feature · **Est:** 1 · **MoSCoW:** should

### Description
Add the Danger zone to the Account tab: 'ขอลบบัญชี' -> confirm by typing the GID -> insert deletion_requests (own-row RLS) -> notice '30 วัน / ข้อมูลแมตช์อยู่ในเครื่องคุณอยู่แล้ว'. Doc: CR-003 §3.6, US-14. Code: src/src/AccountPage.tsx.

### Acceptance (DoD)
Wrong GID blocks submit; successful request persists and renders the pending notice on next load; deck remains fully usable signed-out after.

### Depends on
[[feature--account-tabs-shell]], [[config--sql-migration-ops]]
