---
id: entity--account-domain-types
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# ENTITY: Account Domain Types (DDD ubiquitous language) [L3-Storage] entity--account-domain-types

**Phase:** P0 · **Tier:** H1 · **Type:** entity · **Est:** 1 · **MoSCoW:** must

### Description
Create src/src/wallet/types.ts: pure TS types mirroring CR-003 §2.2 column-for-column — Wallet, LedgerEntry (entry_type union), CoinPackage, TopupOrder (status union, provider union), CatalogItem, Purchase, InventoryRow (source union), ReceiptView. All money fields bigint-safe (number for coins is OK client-side, satang stays integer). No logic, no imports beyond TS. Doc: CR-003 §2.2. Code: src/src/wallet/types.ts.

### Acceptance (DoD)
npx tsc --noEmit passes; every table in CR-003 §2.2 has a matching type with identical field names; file header carries `// Doc: CR-003 §2.2 (entity--account-domain-types)`.

### Depends on
(none)
