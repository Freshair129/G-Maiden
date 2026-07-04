---
id: config--sql-migration-wallet
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: worker
status: todo
---

# CONFIG: Migration: wallets + wallet_ledger [L3-Storage] config--sql-migration-wallet

**Phase:** P0 · **Tier:** H1 · **Type:** config · **Est:** 1 · **MoSCoW:** must

### Description
Create supabase/migrations/<ts>_cr003_wallet.sql with wallets + wallet_ledger EXACTLY as CR-003 §2.2 (checks, index, identity pk). No RLS here (config--rls-policies owns it). Doc: CR-003 §2.2. Code: supabase/migrations/.

### Acceptance (DoD)
supabase db reset applies cleanly; \d wallets and \d wallet_ledger match the spec column-for-column incl. checks.

### Depends on
(none)
