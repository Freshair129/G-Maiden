---
id: algo--ledger-page
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# ALGO: Pure fn: mergeLedger(existing, incoming, pageSize) [L3-Logic] algo--ledger-page

**Phase:** P3 · **Tier:** H1 · **Type:** algo · **Est:** 1 · **MoSCoW:** must

### Description
src/src/wallet/ledger-page.ts: `mergeLedger(existing: LedgerEntry[], incoming: LedgerEntry[], pageSize: number): LedgerEntry[]` — dedupe by id, sort created_at desc then id desc, truncate to pageSize. Feeds both the Wallet preview (3 rows) and History pages; realtime events arrive out of order. TDD first, >=6 cases (dup id, out-of-order, truncate, empty). Doc: CR-003 §3.5. Code: src/src/wallet/ledger-page.ts.

### Acceptance (DoD)
vitest green, tests first; stable ordering proven by a shuffled-input property case.

### Depends on
[[config--local-first-micro-role]], [[entity--account-domain-types]]
