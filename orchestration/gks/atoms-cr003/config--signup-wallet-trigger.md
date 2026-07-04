---
id: config--signup-wallet-trigger
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# CONFIG: Signup trigger: create wallet + welcome grant (+backfill) [L3-Logic] config--signup-wallet-trigger

**Phase:** P1 · **Tier:** H1 · **Type:** config · **Est:** 1 · **MoSCoW:** must

### Description
Extend the existing ADR-14 handle_new_user trigger: also insert wallets row + welcome grant (ledger entry_type 'grant', note 'welcome', amount from a constant). Add a backfill migration for existing profiles without wallets. Touches auth trigger — sensitive. Doc: CR-003 §2.4/US-01. Code: supabase/migrations/<ts>_cr003_signup.sql.

### Acceptance (DoD)
New-user test shows wallet + one 'grant' ledger row; backfill leaves zero profiles without a wallet; existing GID minting behavior unchanged.

### Depends on
[[config--sql-migration-wallet]]
