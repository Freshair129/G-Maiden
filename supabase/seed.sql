-- supabase/seed.sql — non-migration seed data, applied after migrations on
-- `supabase start` / `supabase db reset`. Must be idempotent (re-runnable).
--
-- Scope: the Store catalog. Wallet/economy TABLES and the economy_config defaults
-- (shard caps / expiry) are created + seeded by the migration
-- 20260711120000_cr003_wallet_billing.sql — NOT here. This file only seeds the
-- storefront's `catalog_items` so a fresh DB (local or a rebuilt project) shows the
-- same store as live gstore.

-- ---------------------------------------------------------------------------
-- Store catalog
-- ---------------------------------------------------------------------------
-- pack_mrijgajn — the bundled community announcer pack (Thai), listed as a free
-- showcase item (currency=wallet, price=0 → claimable via purchase_item without
-- any balance movement). creator_id null = first-party/official. Mirrors the live
-- gstore row seeded 2026-07-17.
--
-- NOTE: banner_url is left null — the pack's banner assets ship inside the app
-- bundle (assets/voice-cache/packs/pack_mrijgajn/banners/), not Supabase Storage.
-- Populate banner_url only once the promo image is uploaded to the public bucket.
insert into public.catalog_items (sku, item_type, title, description, currency, price, pack_id, creator_id, status)
values (
  'pack.mrijgajn',
  'announcer_pack',
  'Maiden — Community Pack',
  'Community announcer pack (ภาษาไทย) — เสียงประกาศ kill / streak / death พร้อมแบนเนอร์ในเกม',
  'wallet',
  0,
  'pack_mrijgajn',
  null,
  'active'
)
on conflict (sku) do update
  set title       = excluded.title,
      description = excluded.description,
      item_type   = excluded.item_type,
      currency    = excluded.currency,
      price       = excluded.price,
      pack_id     = excluded.pack_id,
      creator_id  = excluded.creator_id,
      status      = excluded.status,
      updated_at  = now();

-- ---------------------------------------------------------------------------
-- Coin packages (real-money top-up bundles — wallet currency only, ADR-16)
-- ---------------------------------------------------------------------------
-- price_satang = THB × 100. Seeded with active=false ON PURPOSE: the payment path
-- (topup-create / payment-webhook Edge Functions + Omise config) is not deployed,
-- so these must NOT surface in TopupModal yet. The coin_packages RLS policy is
-- `for select using (active)`, so active=false rows exist in the DB but are hidden
-- from clients — flip active=true only once payments are live and these prices are
-- final. Prices below are Boss's 2026-07-17 decision (S ฿69 / M ฿179 / L ฿349).
insert into public.coin_packages (id, title, coins, bonus_coins, price_satang, active, sort)
values
  ('coins_s', 'แพ็กเริ่มต้น', 250,  0,   6900,  false, 1),
  ('coins_m', 'แพ็กคุ้มค่า',  700,  50,  17900, false, 2),
  ('coins_l', 'แพ็กใหญ่',     1500, 200, 34900, false, 3)
on conflict (id) do update
  set title        = excluded.title,
      coins        = excluded.coins,
      bonus_coins  = excluded.bonus_coins,
      price_satang = excluded.price_satang,
      active       = excluded.active,
      sort         = excluded.sort;

-- ---------------------------------------------------------------------------
-- Redeem codes
-- ---------------------------------------------------------------------------
-- MAIDENFREE — a shared promo code that grants the free "Maiden — Community Pack"
-- into the redeemer's inventory (grant_type='item'). Codes are validated entirely
-- inside the redeem_code() RPC (never client-SELECTable). The (code, user_id) PK on
-- `redemptions` blocks the same account redeeming twice; max_uses caps total
-- redemptions across all users. item_id is resolved by SKU so this stays portable
-- across DBs (must run AFTER the catalog insert above). Codes are stored UPPERCASE.
insert into public.redeem_codes (code, grant_type, coins, item_id, max_uses, expires_at, created_by)
select 'MAIDENFREE', 'item', null, ci.id, 100000, null, null
  from public.catalog_items ci
 where ci.sku = 'pack.mrijgajn'
on conflict (code) do update
  set grant_type = excluded.grant_type,
      coins      = excluded.coins,
      item_id    = excluded.item_id,
      max_uses   = excluded.max_uses,
      expires_at = excluded.expires_at;
