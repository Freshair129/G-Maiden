---
id: config--feature-flag-wallet
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: coder
status: todo
---

# CONFIG: Remote flag wallet_enabled (ship dark until Omise live) [L2-Feature] config--feature-flag-wallet

**Phase:** P5 · **Tier:** H1 · **Type:** config · **Est:** 1 · **MoSCoW:** must

### Description
Add app_flags table (public read, service write) with wallet_enabled boolean; when false the top-up button renders disabled with 'เร็ว ๆ นี้' while Store's free items + redeem still work (per MASTERPLAN gate: economy usable before payments go live). Doc: CR-003 §6.2. Code: supabase/migrations/<ts>_cr003_flags.sql + src/src/wallet/WalletTab.tsx.

### Acceptance (DoD)
Flipping the flag in DB changes the UI within one app restart (or realtime); with flag off, golden-path e2e still passes its redeem-based variant.

### Depends on
[[feature--wallet-tab]], [[feature--topup-modal]]
