-- Doc: CR-003-account-phase1-wallet-billing.md §2.2/§2.3/§2.4 (v0.3.0, Approved 2026-07-11)
-- Wallet (shard/wallet split, ADR-16) + billing (PromptPay/TrueMoney via Omise) + store/
-- inventory + shard faucet (match_submissions/tips) + ops (redeem codes, deletion requests,
-- tunable economy config). Assembled from the doc's SQL blocks into one runnable migration.
--
-- NOTE: `public.profiles.role` is NOT re-added here — it already shipped in Part B of
-- 20260704120000_sec001_identity_hardening.sql (`add column if not exists role text not null
-- default 'user' check (role in ('user','creator','admin'))`). CR-003 §2.2 lists that statement
-- too because the doc predates knowing it had already landed; skipping the duplicate here.
--
-- APPLIED to live gstore on 2026-07-17 (schema-only) after local pgTAP 69/69 PASS + a review
-- pass. The shard faucet (mint_shard_from_match) and payment (credit_topup) RPCs are deployed
-- but are service_role-only, and their Edge Functions (match-share-submit / payment-webhook)
-- are deliberately NOT deployed — so minting/ingestion/payment stay closed until ADR-16
-- §Prerequisites (Valve legal status + consent/terms copy) are resolved.

begin;

-- =====================================================================
-- Wallet (ADR-16 §7: provenance separated from the first migration)
-- =====================================================================
create table public.wallets (
  user_id                uuid primary key references public.profiles(id) on delete cascade,
  -- shard: earned only, minted via mint_shard_from_match/tip only (no client write)
  shard_balance           bigint not null default 0 check (shard_balance >= 0),
  lifetime_shard_earned   bigint not null default 0,
  lifetime_shard_spent    bigint not null default 0,
  -- refreshed on every shard credit (earn or tip received); the expiry window itself lives
  -- in economy_config('shard_expiry_days'), not hardcoded here
  shard_expires_at        timestamptz,
  -- wallet: purchased only (named `balance` in the pre-ADR-16 v0.2.0 draft)
  wallet_balance           bigint not null default 0 check (wallet_balance >= 0),
  lifetime_topup            bigint not null default 0,
  lifetime_spend             bigint not null default 0,
  updated_at                 timestamptz not null default now()
);

-- append-only ledger — source of truth for every balance movement (this is "History")
create table public.wallet_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  -- ADR-16 §7: every row must know its provenance — no entry may be ambiguous about currency
  currency      text not null check (currency in ('shard','wallet')),
  entry_type    text not null check (entry_type in
                  ('topup','purchase','refund','grant','redeem','adjust',
                   'earn_share','tip_sent','tip_received')),
  amount        bigint not null check (amount <> 0),      -- + in / - out
  balance_after bigint not null check (balance_after >= 0),
  ref_type      text,          -- 'topup_order' | 'purchase' | 'redeem_code' | 'admin' | 'match_submission' | 'tip'
  ref_id        text,
  note          text,
  created_at    timestamptz not null default now(),
  -- currency must agree with entry_type (catches bugs like "earn_share logged as wallet")
  check (
    (currency = 'shard' and entry_type in ('earn_share','tip_sent','tip_received','purchase','adjust','grant','redeem'))
    or
    (currency = 'wallet' and entry_type in ('topup','purchase','refund','grant','redeem','adjust','tip_sent','tip_received'))
  )
);
create index wallet_ledger_user_idx on public.wallet_ledger (user_id, created_at desc);
create index wallet_ledger_currency_idx on public.wallet_ledger (user_id, currency, created_at desc);

-- =====================================================================
-- Billing
-- =====================================================================
create table public.coin_packages (
  id            text primary key,              -- 'coins_s' | 'coins_m' | 'coins_l'
  title         text not null,
  coins         bigint not null check (coins > 0),
  bonus_coins   bigint not null default 0,
  price_satang  integer not null check (price_satang > 0),  -- THB in satang
  active        boolean not null default true,
  sort          integer not null default 0
);

create table public.topup_orders (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  package_id         text not null references public.coin_packages(id),
  coins              bigint  not null check (coins > 0),          -- snapshot at order time
  price_satang       integer not null check (price_satang > 0),   -- snapshot at order time
  provider           text not null check (provider in ('promptpay','truemoney')),
  provider_charge_id text unique,                                 -- Omise charge id
  status             text not null default 'pending' check (status in
                       ('pending','paid','failed','expired')),
  qr_image_uri       text,          -- PromptPay: Omise download_uri for the QR
  authorize_uri      text,          -- TrueMoney: redirect into the app
  expires_at         timestamptz,
  paid_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index topup_orders_user_idx on public.topup_orders (user_id, created_at desc);

-- guards against re-processing a webhook (Omise can retry delivery)
create table public.webhook_events (
  provider     text not null,
  event_id     text not null,
  payload      jsonb not null,
  processed_at timestamptz,
  created_at   timestamptz not null default now(),
  primary key (provider, event_id)
);

-- =====================================================================
-- Store / Inventory
-- =====================================================================
create table public.catalog_items (
  id           uuid primary key default gen_random_uuid(),
  sku          text unique not null,           -- 'pack.maiden-classic'
  item_type    text not null default 'announcer_pack'
               check (item_type in ('announcer_pack','persona','advice_style')),
  title        text not null,
  description  text,
  -- ADR-16 §6: catalog separation is absolute — one item sells in exactly one currency
  currency     text not null check (currency in ('shard','wallet')),
  price        bigint not null check (price >= 0),         -- 0 = free; unit follows `currency`
  pack_id      text,            -- bundle id under voice-cache/packs/<id>/
  banner_url   text,            -- Supabase Storage public URL (promo image)
  bundle_path  text,            -- path in the private Storage bucket 'packs'
  creator_id   uuid references public.profiles(id),        -- null = official
  status       text not null default 'draft'
               check (status in ('draft','active','delisted')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- ADR-16 §1: shard cannot buy creator items — creator items must be wallet-only
  -- shard-priced items are a prestige sink (§6): official-only, never money-purchasable
  check (currency <> 'shard' or creator_id is null)
);

create table public.purchases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_id     uuid not null references public.catalog_items(id),
  currency    text not null check (currency in ('shard','wallet')),  -- snapshot at purchase time
  price       bigint not null check (price >= 0),                   -- snapshot price at purchase time
  created_at  timestamptz not null default now(),
  unique (user_id, item_id)                                 -- DB-level repeat-purchase guard
);

create table public.inventory (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_id     uuid not null references public.catalog_items(id),
  source      text not null check (source in ('purchase','grant','redeem','starter')),
  ref_id      text,
  acquired_at timestamptz not null default now(),
  unique (user_id, item_id)
);
create index inventory_user_idx on public.inventory (user_id);

-- =====================================================================
-- Ops
-- =====================================================================
create table public.redeem_codes (
  code       text primary key,                 -- stored UPPERCASE
  grant_type text not null check (grant_type in ('coins','item')),
  coins      bigint check (coins > 0),
  item_id    uuid references public.catalog_items(id),
  max_uses   integer not null default 1,
  used_count integer not null default 0 check (used_count <= max_uses),
  expires_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((grant_type = 'coins' and coins is not null)
      or (grant_type = 'item'  and item_id is not null))
);

create table public.redemptions (
  code        text not null references public.redeem_codes(code),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)                  -- 1 code per person
);

-- PDPA: account deletion request (processed by job/manual within 30 days)
create table public.deletion_requests (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  processed_at timestamptz
);

-- =====================================================================
-- Shard faucet (ADR-16 §3/§5 — new in v0.3.0)
-- =====================================================================
-- Mint oracle = OpenDota only. Raw match_id is used to verify inside the Edge Function
-- and then discarded — only the HMAC is persisted. Two players in the same match get the
-- same match_ref (stitching, ADR-11 §3), so uniqueness is per (user_id, match_ref), not
-- per match_ref alone.
create table public.match_submissions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  match_ref     text not null,                 -- HMAC(server_key, match_id) — never the raw match_id
  verified      boolean not null default false,
  shard_minted  bigint not null default 0 check (shard_minted >= 0),
  receipt_sig   text,                          -- server signature returned to the user (non-repudiation)
  submitted_at  timestamptz not null default now(),
  unique (user_id, match_ref)                  -- prevents double-minting the same match (ADR-16 §5)
);
create index match_submissions_user_idx on public.match_submissions (user_id, submitted_at desc);

-- tip: both shard and wallet go through one table; per-currency rules are enforced in the
-- tip() RPC, not a check constraint (the "shard received per day" cap is an aggregate query
-- against the recipient — a check constraint can't express that).
create table public.tips (
  id          uuid primary key default gen_random_uuid(),
  from_user   uuid not null references public.profiles(id) on delete cascade,
  to_user     uuid not null references public.profiles(id) on delete cascade,
  currency    text not null check (currency in ('shard','wallet')),
  amount      bigint not null check (amount > 0),
  created_at  timestamptz not null default now(),
  check (from_user <> to_user)
);
create index tips_to_user_idx on public.tips (to_user, currency, created_at desc);

-- ---------- Ops: tunable economy parameters (new in v0.3.0) ----------
-- Business numbers (daily caps / expiry) are not finalized (see the doc's "Open" note at the
-- end of §2.2) — kept as config so service_role can tune without a new migration each time.
create table public.economy_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Seed the starter values the doc lists as the migration-time defaults. Boss can retune these
-- via service_role before real launch without another migration.
insert into public.economy_config (key, value) values
  ('shard_daily_earn_cap', '500'),
  ('shard_daily_tip_receive_cap', '300'),
  ('shard_expiry_days', '180')
on conflict (key) do nothing;

-- =====================================================================
-- RLS + grants (§2.3)
-- =====================================================================
alter table public.wallets            enable row level security;
alter table public.wallet_ledger      enable row level security;
alter table public.coin_packages      enable row level security;
alter table public.topup_orders       enable row level security;
alter table public.webhook_events     enable row level security;
alter table public.catalog_items      enable row level security;
alter table public.purchases          enable row level security;
alter table public.inventory          enable row level security;
alter table public.redeem_codes       enable row level security;
alter table public.redemptions        enable row level security;
alter table public.deletion_requests  enable row level security;
alter table public.match_submissions  enable row level security;
alter table public.tips               enable row level security;
alter table public.economy_config     enable row level security;

-- read own rows only
create policy "own read" on public.wallets        for select using (auth.uid() = user_id);
create policy "own read" on public.wallet_ledger  for select using (auth.uid() = user_id);
create policy "own read" on public.topup_orders   for select using (auth.uid() = user_id);
create policy "own read" on public.purchases      for select using (auth.uid() = user_id);
create policy "own read" on public.inventory      for select using (auth.uid() = user_id);
create policy "own read" on public.redemptions    for select using (auth.uid() = user_id);
create policy "own read" on public.match_submissions for select using (auth.uid() = user_id);
-- tip: visible to both sender and recipient (not just the row "owner")
create policy "own read" on public.tips
  for select using (auth.uid() = from_user or auth.uid() = to_user);
create policy "own rw"   on public.deletion_requests
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- catalog is readable by everyone (including signed-out — the Store must render pre-login)
create policy "public read" on public.coin_packages for select using (active);
create policy "public read" on public.catalog_items for select using (status = 'active');
-- economy_config: caps/expiry must be client-readable (UI shows "N days left" etc.)
create policy "public read" on public.economy_config for select using (true);

-- no INSERT/UPDATE/DELETE policy for authenticated anywhere =
-- the only write path is a SECURITY DEFINER fn or service_role (Edge Function)
revoke insert, update, delete on public.wallets, public.wallet_ledger,
  public.topup_orders, public.purchases, public.inventory,
  public.coin_packages, public.catalog_items, public.redeem_codes,
  public.redemptions, public.webhook_events, public.match_submissions,
  public.tips, public.economy_config from anon, authenticated;

-- =====================================================================
-- Server-side functions (§2.4) — all atomic
-- =====================================================================

-- Ensures a wallet row exists for a user, idempotently. Called defensively at the top of
-- every money-touching RPC instead of relying on the signup trigger alone (Opus review gate
-- 2026-07-11 finding P0: the signup trigger's wallet-creation is a TODO pending discovery of
-- `handle_new_user`'s live body — see the note above the backfill insert below. Without this,
-- any user who signed up after this migration has no wallets row, so credit_topup/purchase_item/
-- tip/redeem_code all fail: a paid Omise topup would mark the order 'paid' but then throw on the
-- balance update, leaving the order stuck and the user's money captured with no coins delivered).
-- Idempotent and safe to call from within an already-open transaction.
create or replace function public.ensure_wallet(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
end $$;

-- purchase an item with shard or wallet (per catalog_items.currency) — one RPC, one transaction
create or replace function public.purchase_item(p_item_id uuid)
returns public.purchases
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_item  catalog_items;
  v_bal   bigint;
  v_row   purchases;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  perform ensure_wallet(v_uid);

  select * into v_item from catalog_items
   where id = p_item_id and status = 'active';
  if not found then raise exception 'item not available'; end if;

  -- lock the wallet row against a concurrent double-spend, regardless of which currency pays
  select case v_item.currency when 'shard' then shard_balance else wallet_balance end
    into v_bal from wallets where user_id = v_uid for update;
  if v_bal < v_item.price then raise exception 'insufficient balance'; end if;
  -- redundant with the catalog_items check constraint, but kept as RPC-level defense in depth
  if v_item.currency = 'shard' and v_item.creator_id is not null then
    raise exception 'shard cannot purchase creator items';
  end if;

  insert into purchases (user_id, item_id, currency, price)
  values (v_uid, p_item_id, v_item.currency, v_item.price)   -- unique(user_id,item_id) blocks repeat buys
  returning * into v_row;

  insert into inventory (user_id, item_id, source, ref_id)
  values (v_uid, p_item_id, 'purchase', v_row.id::text);

  -- Opus review gate finding (2026-07-11): a free item (price=0) has no balance movement to
  -- record — wallet_ledger.amount has `check (amount <> 0)`, so a 0-amount insert would violate
  -- that constraint and the whole purchase would roll back. Skip the ledger/balance update
  -- entirely when price is 0; the purchases+inventory rows above are the only effect.
  if v_item.price > 0 then
    if v_item.currency = 'shard' then
      update wallets set shard_balance = shard_balance - v_item.price,
             lifetime_shard_spent = lifetime_shard_spent + v_item.price, updated_at = now()
       where user_id = v_uid;
    else
      update wallets set wallet_balance = wallet_balance - v_item.price,
             lifetime_spend = lifetime_spend + v_item.price, updated_at = now()
       where user_id = v_uid;
    end if;

    insert into wallet_ledger (user_id, currency, entry_type, amount, balance_after, ref_type, ref_id, note)
    values (v_uid, v_item.currency, 'purchase', -v_item.price, v_bal - v_item.price,
            'purchase', v_row.id::text, v_item.title);
  end if;
  return v_row;
end $$;

-- credit coins after a successful payment — called from the webhook Edge Function
-- (service_role) only. wallet only (Omise topup is real money; it can only ever land in
-- wallet_balance, never shard).
create or replace function public.credit_topup(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order topup_orders;
  v_bal   bigint;
begin
  -- status guard = idempotent: fired any number of times, credited exactly once
  update topup_orders set status = 'paid', paid_at = now(), updated_at = now()
   where id = p_order_id and status = 'pending'
  returning * into v_order;
  if not found then return; end if;

  perform ensure_wallet(v_order.user_id);
  select wallet_balance into v_bal from wallets where user_id = v_order.user_id for update;
  update wallets
     set wallet_balance = wallet_balance + v_order.coins,
         lifetime_topup = lifetime_topup + v_order.coins,
         updated_at = now()
   where user_id = v_order.user_id;

  insert into wallet_ledger (user_id, currency, entry_type, amount, balance_after, ref_type, ref_id, note)
  values (v_order.user_id, 'wallet', 'topup', v_order.coins, v_bal + v_order.coins,
          'topup_order', v_order.id::text, v_order.provider);
end $$;

-- mint shard from a verified match — called from the `match-share-submit` Edge Function
-- (service_role only; OpenDota verification happens in the Edge Fn because plpgsql cannot
-- make outbound HTTP calls).
-- ADR-16 §3: unverified means no shard (honest state) — the Edge Fn never calls this function
-- at all when verification fails.
create or replace function public.mint_shard_from_match(
  p_user_id uuid, p_match_ref text, p_shard bigint, p_receipt_sig text
) returns public.match_submissions
language plpgsql security definer set search_path = public as $$
declare
  v_bal  bigint;
  v_cap  bigint;
  v_today_earned bigint;
  v_row  match_submissions;
begin
  if p_shard <= 0 then raise exception 'shard must be positive'; end if;
  perform ensure_wallet(p_user_id);

  -- Opus review gate finding (2026-07-11): lock the wallet row BEFORE reading the daily-earn
  -- aggregate, not after. Two concurrent mint_shard_from_match calls for the SAME user (e.g.
  -- sharing two different matches back to back) would otherwise both read the pre-update
  -- aggregate and both pass the cap check before either commits — the lock below serializes
  -- them, so the second call's aggregate read (which happens after acquiring the lock, i.e.
  -- after the first call has committed or rolled back) sees the first call's effect.
  select shard_balance into v_bal from wallets where user_id = p_user_id for update;

  -- daily cap (ADR-16 §3 "low per-day cap") — read from economy_config, never hardcoded
  select (value #>> '{}')::bigint into v_cap from economy_config where key = 'shard_daily_earn_cap';
  select coalesce(sum(amount), 0) into v_today_earned from wallet_ledger
   where user_id = p_user_id and currency = 'shard' and entry_type = 'earn_share'
     and created_at >= date_trunc('day', now());
  if v_cap is not null and v_today_earned + p_shard > v_cap then
    raise exception 'daily shard earn cap reached';
  end if;

  -- unique(user_id, match_ref) prevents double-minting the same match — insert fails if
  -- this match was already submitted
  insert into match_submissions (user_id, match_ref, verified, shard_minted, receipt_sig)
  values (p_user_id, p_match_ref, true, p_shard, p_receipt_sig)
  returning * into v_row;

  update wallets
     set shard_balance = shard_balance + p_shard,
         lifetime_shard_earned = lifetime_shard_earned + p_shard,
         shard_expires_at = now() + (
           select ((value #>> '{}')::int || ' days')::interval
             from economy_config where key = 'shard_expiry_days'),
         updated_at = now()
   where user_id = p_user_id;

  insert into wallet_ledger (user_id, currency, entry_type, amount, balance_after, ref_type, ref_id, note)
  values (p_user_id, 'shard', 'earn_share', p_shard, v_bal + p_shard,
          'match_submission', v_row.id::text, 'match share verified');
  return v_row;
end $$;

-- tip — either shard or wallet, always zero-sum; shard has a "received per day" cap
-- (ADR-16 §4, not decay)
create or replace function public.tip(p_to_user uuid, p_amount bigint, p_currency text)
returns public.tips
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_bal bigint;
  v_cap bigint;
  v_today_received bigint;
  v_row tips;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if v_uid = p_to_user then raise exception 'cannot tip yourself'; end if;
  if p_currency not in ('shard','wallet') then raise exception 'invalid currency'; end if;

  -- Opus review gate finding (2026-07-11), two issues fixed together:
  -- (a) the recipient may have no wallets row at all — the old code's final insert selected
  --     FROM wallets WHERE user_id = p_to_user with no row to select, silently inserting ZERO
  --     ledger rows while the sender had already been debited: shard/wallet value vanished.
  -- (b) the daily shard-received cap read its aggregate before locking the recipient's row, so
  --     two concurrent tips to the same recipient could both pass the cap check before either
  --     commits.
  -- ensure_wallet() fixes (a) for both parties. Locking BOTH wallet rows before doing anything
  -- else fixes (b) (the aggregate read below happens after the lock, so a concurrent tip that
  -- already committed is visible) and also serializes the sender-overdraft check consistently.
  -- Rows are locked in a fixed (uuid-ordered) sequence — not source/destination order — so two
  -- tips crossing in opposite directions (A tips B, B tips A, at the same time) can't deadlock.
  -- The ensure_wallet() calls must follow that SAME uuid order, not source/destination order:
  -- two brand-new users (neither has a row yet) tipping each other at the same moment would
  -- otherwise deadlock on the two INSERT..ON CONFLICT calls themselves, before the lock block
  -- below even runs (re-verification finding, 2026-07-11 — the ordering guarantee has to start
  -- at the very first row-touching statement, not just at the explicit FOR UPDATE block).
  if v_uid < p_to_user then
    perform ensure_wallet(v_uid);
    perform ensure_wallet(p_to_user);
    perform 1 from wallets where user_id = v_uid for update;
    perform 1 from wallets where user_id = p_to_user for update;
  else
    perform ensure_wallet(p_to_user);
    perform ensure_wallet(v_uid);
    perform 1 from wallets where user_id = p_to_user for update;
    perform 1 from wallets where user_id = v_uid for update;
  end if;

  if p_currency = 'shard' then
    select (value #>> '{}')::bigint into v_cap from economy_config
     where key = 'shard_daily_tip_receive_cap';
    select coalesce(sum(amount), 0) into v_today_received from wallet_ledger
     where user_id = p_to_user and currency = 'shard' and entry_type = 'tip_received'
       and created_at >= date_trunc('day', now());
    if v_cap is not null and v_today_received + p_amount > v_cap then
      raise exception 'recipient daily shard tip cap reached';
    end if;
  end if;

  select case p_currency when 'shard' then shard_balance else wallet_balance end
    into v_bal from wallets where user_id = v_uid;  -- already locked above
  if v_bal < p_amount then raise exception 'insufficient balance'; end if;

  insert into tips (from_user, to_user, currency, amount)
  values (v_uid, p_to_user, p_currency, p_amount)
  returning * into v_row;

  if p_currency = 'shard' then
    update wallets set shard_balance = shard_balance - p_amount, updated_at = now() where user_id = v_uid;
    -- tipped-in shard is still earned-provenance (still can't buy creator items / convert to
    -- cash) but it IS fresh value the recipient now holds, so its expiry refreshes just like a
    -- direct match-share earn would (ADR-16 §1 "shard has an expiry date" — the old code never
    -- set this on the tip-received side, so tipped shard silently never expired).
    update wallets set shard_balance = shard_balance + p_amount, updated_at = now(),
           shard_expires_at = now() + (
             select ((value #>> '{}')::int || ' days')::interval
               from economy_config where key = 'shard_expiry_days')
     where user_id = p_to_user;
  else
    update wallets set wallet_balance = wallet_balance - p_amount, updated_at = now() where user_id = v_uid;
    update wallets set wallet_balance = wallet_balance + p_amount, updated_at = now() where user_id = p_to_user;
  end if;

  insert into wallet_ledger (user_id, currency, entry_type, amount, balance_after, ref_type, ref_id)
  values (v_uid, p_currency, 'tip_sent', -p_amount, v_bal - p_amount, 'tip', v_row.id::text);
  insert into wallet_ledger (user_id, currency, entry_type, amount, balance_after, ref_type, ref_id)
  select p_to_user, p_currency, 'tip_received', p_amount,
         (case p_currency when 'shard' then shard_balance else wallet_balance end), 'tip', v_row.id::text
    from wallets where user_id = p_to_user;
  return v_row;
end $$;

-- redeem a code (codes are never SELECTable by clients — validated entirely inside this fn).
-- Grants are always wallet coins or an item — never shard (shard must come from a verified
-- OpenDota match per ADR-16 §3; minting shard from a giveaway code would turn codes into a
-- fake faucet).
create or replace function public.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_code   text := upper(p_code);
  v_row    redeem_codes;
  v_bal    bigint;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  -- lock the code row so concurrent redeems can't both pass the max_uses check
  select * into v_row from redeem_codes where code = v_code for update;
  if not found then raise exception 'invalid code'; end if;

  if v_row.expires_at is not null and now() >= v_row.expires_at then
    raise exception 'code expired';
  end if;
  if v_row.used_count >= v_row.max_uses then
    raise exception 'code fully redeemed';
  end if;

  -- primary key (code, user_id) blocks a repeat redemption by the same account
  begin
    insert into redemptions (code, user_id) values (v_code, v_uid);
  exception when unique_violation then
    raise exception 'you have already redeemed this code';
  end;

  if v_row.grant_type = 'coins' then
    -- same locked-balance pattern as purchase_item, wallet side only
    perform ensure_wallet(v_uid);
    select wallet_balance into v_bal from wallets where user_id = v_uid for update;

    update wallets
       set wallet_balance = wallet_balance + v_row.coins,
           updated_at = now()
     where user_id = v_uid;

    insert into wallet_ledger (user_id, currency, entry_type, amount, balance_after, ref_type, ref_id, note)
    values (v_uid, 'wallet', 'redeem', v_row.coins, v_bal + v_row.coins,
            'redeem_code', v_code, 'redeem code');

    v_result := jsonb_build_object('grant_type', 'coins', 'coins', v_row.coins);

  elsif v_row.grant_type = 'item' then
    if exists (select 1 from inventory where user_id = v_uid and item_id = v_row.item_id) then
      raise exception 'you already own this item';
    end if;

    insert into inventory (user_id, item_id, source, ref_id)
    values (v_uid, v_row.item_id, 'redeem', v_code);

    v_result := jsonb_build_object('grant_type', 'item', 'item_id', v_row.item_id);

  else
    raise exception 'unknown grant_type';
  end if;

  update redeem_codes set used_count = used_count + 1 where code = v_code;

  return v_result;
end $$;

-- Signup wallet creation (§2.4 "append to the existing ADR-14 trigger"):
-- TODO(next migration): wire wallets-row creation + welcome grant into handle_new_user's
-- existing body once its current SQL is confirmed. `handle_new_user()` is referenced by
-- CR-003 §2.4 and by SEC-001 (which revokes its EXECUTE grant), but its body is not checked
-- into this repo's supabase/migrations/ — it appears to predate the migration history here
-- (created directly against the live `gstore` project alongside ADR-14, before this
-- migrations/ folder existed). Rewriting it blind, without the current source, risks
-- silently dropping profile-row creation or GID cohort assignment (a signup-path regression
-- would be severe). Confirm the live function body (e.g. via `list_migrations`/`execute_sql`
-- against gstore, not done in this task since this task is migration-file-only, no live
-- access) before extending it.
--
-- In the meantime, this migration keeps the schema self-consistent to test against: a one-off
-- backfill creates a zero-balance wallets row for every existing profile that lacks one. No
-- welcome grant is issued here (welcome grants belong with the trigger extension above, so
-- new and backfilled users aren't treated inconsistently by two different code paths).
insert into public.wallets (user_id)
select p.id
  from public.profiles p
  left join public.wallets w on w.user_id = p.id
 where w.user_id is null;

-- =====================================================================
-- RPC privilege grants
-- =====================================================================
-- client-callable RPCs: authenticated only (functions grant EXECUTE to PUBLIC by default —
-- explicitly revoke first, matching the SEC-001 F2/F3 hardening pattern, then grant back only
-- to authenticated; anon calls fail anyway via `auth.uid() is null` but this closes the RPC
-- surface structurally rather than relying on that check alone).
revoke execute on function public.purchase_item(uuid) from public, anon, authenticated;
revoke execute on function public.tip(uuid, bigint, text) from public, anon, authenticated;
revoke execute on function public.redeem_code(text) from public, anon, authenticated;
grant execute on function public.purchase_item(uuid) to authenticated;
grant execute on function public.tip(uuid, bigint, text) to authenticated;
grant execute on function public.redeem_code(text) to authenticated;

-- server-only RPCs: never exposed to authenticated; callable only via the service_role key
-- held by the `payment-webhook` and `match-share-submit` Edge Functions respectively.
revoke execute on function public.credit_topup(uuid) from public, anon, authenticated;
revoke execute on function public.mint_shard_from_match(uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.credit_topup(uuid) to service_role;
grant execute on function public.mint_shard_from_match(uuid, text, bigint, text) to service_role;

-- ensure_wallet: purely an internal helper called via `perform` from the functions above.
-- Function owners always implicitly retain EXECUTE on functions they own regardless of grants,
-- so the internal calls keep working; this revoke just closes the direct-call surface (a client
-- calling it directly would only ever create an empty-balance row, but there's no reason to
-- expose it — nothing outside this file should ever call it directly).
revoke execute on function public.ensure_wallet(uuid) from public, anon, authenticated, service_role;

commit;
