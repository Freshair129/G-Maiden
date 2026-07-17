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
