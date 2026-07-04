---
id: feature--history-tab
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# FEATURE: History tab — paged ledger + inline receipt [L2-Feature] feature--history-tab

**Phase:** P4 · **Tier:** H1 · **Type:** feature · **Est:** 1 · **MoSCoW:** must

### Description
src/src/wallet/HistoryTab.tsx per mockup §5: filter chips (ทั้งหมด/เติมเหรียญ/ซื้อ/รับฟรี), rows-per-page from rowsThatFit + pager (no scroll), topup rows expand to the toReceipt view with copy buttons, empty state per spec. Distinct from the deck's match HistoryPage — do not touch it. Doc: CR-003 §3.5. Code: src/src/wallet/HistoryTab.tsx.

### Acceptance (DoD)
Filters compose with pagination correctly (assert on seeded fixture); receipt fields match toReceipt 1:1; no overflow at baseline.

### Depends on
[[feature--account-tabs-shell]], [[feature--wallet-hook]], [[algo--receipt-view]], [[algo--fit-rows]]
