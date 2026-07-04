---
id: config--sql-migration-billing
block_id: Genesis::GMaiden-CR003-Account
context_scaling_tier: H1
role: worker
status: todo
---

# CONFIG: Migration: coin_packages + topup_orders + webhook_events [L3-Storage] config--sql-migration-billing

**Phase:** P0 · **Tier:** H1 · **Type:** config · **Est:** 1 · **MoSCoW:** must

### Description
Create supabase/migrations/<ts>_cr003_billing.sql per CR-003 §2.2: coin_packages, topup_orders (status/provider unions as CHECKs, unique provider_charge_id), webhook_events (composite PK provider+event_id). Doc: CR-003 §2.2. Code: supabase/migrations/.

### Acceptance (DoD)
supabase db reset applies cleanly; all checks + unique constraints present per spec.

### Depends on
(none)
