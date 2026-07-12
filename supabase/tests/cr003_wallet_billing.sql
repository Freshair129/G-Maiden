-- Doc: CR-003-account-phase1-wallet-billing.md §2 (schema/RLS/RPC, v0.3.0 ADR-16 split) +
-- §5.2 Layer-1 DB test matrix (DB-01..DB-13). Assumes the CR-003 §2 migration (wallets w/
-- shard_balance/wallet_balance, wallet_ledger, catalog_items, purchases, inventory,
-- topup_orders, coin_packages, match_submissions, tips, economy_config, redeem_codes +
-- RLS policies + RPCs purchase_item/credit_topup/mint_shard_from_match/tip/redeem_code)
-- has been applied.
--
-- Style follows supabase/tests/sec001_identity_lock.sql: seed via auth.users/profiles with
-- fixed test UUIDs, `set local role authenticated` + `request.jwt.claims` to act as a given
-- user, assert with pgTAP, `select * from finish(); rollback;` to discard all seed data.
-- Run: supabase test db
--
-- CONCURRENCY CAVEAT (DB-05, DB-12): a single pgTAP file runs inside one Postgres session/
-- transaction, so it cannot open two genuinely simultaneous sessions. DB-05 and DB-12 below
-- are written as SEQUENTIAL double-calls that prove the *logical* guard (SELECT ... FOR
-- UPDATE row lock + unique constraints / cap aggregates) rejects the second call once the
-- first has consumed the balance/cap. That is necessary but not sufficient: it does NOT
-- prove the guard holds when two transactions race and both read the pre-update balance
-- before either commits. A true concurrency check needs a separate harness that opens two
-- real `psql`/client connections (e.g. two `psql` processes issuing BEGIN, then both firing
-- the RPC, one held with pg_sleep to widen the race window) and is out of scope for this file.

begin;
select plan(63);

-- ============================================================================
-- Seed: fixed-UUID test users
-- ============================================================================
-- a1=A a2=B a3=C a4=D a5=E(creator ref only) a6=F a7=G a8=H a9=I aa=J ab=K
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'dbtest-a@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'dbtest-b@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'dbtest-c@example.com'),
  ('00000000-0000-0000-0000-0000000000a4', 'dbtest-d@example.com'),
  ('00000000-0000-0000-0000-0000000000a5', 'dbtest-e@example.com'),
  ('00000000-0000-0000-0000-0000000000a6', 'dbtest-f@example.com'),
  ('00000000-0000-0000-0000-0000000000a7', 'dbtest-g@example.com'),
  ('00000000-0000-0000-0000-0000000000a8', 'dbtest-h@example.com'),
  ('00000000-0000-0000-0000-0000000000a9', 'dbtest-i@example.com'),
  ('00000000-0000-0000-0000-0000000000aa', 'dbtest-j@example.com'),
  ('00000000-0000-0000-0000-0000000000ab', 'dbtest-k@example.com')
on conflict (id) do nothing;

insert into public.profiles (id, email, generation, cohort_seq) values
  ('00000000-0000-0000-0000-0000000000a1', 'dbtest-a@example.com', 'F', 999901),
  ('00000000-0000-0000-0000-0000000000a2', 'dbtest-b@example.com', 'F', 999902),
  ('00000000-0000-0000-0000-0000000000a3', 'dbtest-c@example.com', 'F', 999903),
  ('00000000-0000-0000-0000-0000000000a4', 'dbtest-d@example.com', 'F', 999904),
  ('00000000-0000-0000-0000-0000000000a5', 'dbtest-e@example.com', 'F', 999905),
  ('00000000-0000-0000-0000-0000000000a6', 'dbtest-f@example.com', 'F', 999906),
  ('00000000-0000-0000-0000-0000000000a7', 'dbtest-g@example.com', 'F', 999907),
  ('00000000-0000-0000-0000-0000000000a8', 'dbtest-h@example.com', 'F', 999908),
  ('00000000-0000-0000-0000-0000000000a9', 'dbtest-i@example.com', 'F', 999909),
  ('00000000-0000-0000-0000-0000000000aa', 'dbtest-j@example.com', 'F', 999910),
  ('00000000-0000-0000-0000-0000000000ab', 'dbtest-k@example.com', 'F', 999911)
on conflict (id) do nothing;

-- Wipe anything a signup trigger (handle_new_user) may have auto-created for these test
-- users (wallet row, welcome-grant ledger row) so we start every wallet from a known,
-- ledger-consistent baseline instead of guessing what the trigger did.
delete from public.wallet_ledger where user_id in (
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4',
  '00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a6',
  '00000000-0000-0000-0000-0000000000a7','00000000-0000-0000-0000-0000000000a8',
  '00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-0000000000aa',
  '00000000-0000-0000-0000-0000000000ab');
delete from public.purchases where user_id in (
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4',
  '00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a6',
  '00000000-0000-0000-0000-0000000000a7','00000000-0000-0000-0000-0000000000a8',
  '00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-0000000000aa',
  '00000000-0000-0000-0000-0000000000ab');
delete from public.inventory where user_id in (
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4',
  '00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a6',
  '00000000-0000-0000-0000-0000000000a7','00000000-0000-0000-0000-0000000000a8',
  '00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-0000000000aa',
  '00000000-0000-0000-0000-0000000000ab');
delete from public.wallets where user_id in (
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2',
  '00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000a4',
  '00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000a6',
  '00000000-0000-0000-0000-0000000000a7','00000000-0000-0000-0000-0000000000a8',
  '00000000-0000-0000-0000-0000000000a9','00000000-0000-0000-0000-0000000000aa',
  '00000000-0000-0000-0000-0000000000ab');

-- Known baseline balances (chosen to line up with DB-03..DB-12 scenarios below).
insert into public.wallets (user_id, shard_balance, wallet_balance) values
  ('00000000-0000-0000-0000-0000000000a1', 1200, 2450),  -- A
  ('00000000-0000-0000-0000-0000000000a2',  300,  500),  -- B
  ('00000000-0000-0000-0000-0000000000a3',    0,  100),  -- C
  ('00000000-0000-0000-0000-0000000000a4',    0,    0),  -- D
  ('00000000-0000-0000-0000-0000000000a5',    0,    0),  -- E (creator ref only)
  ('00000000-0000-0000-0000-0000000000a6',    0,    0),  -- F
  ('00000000-0000-0000-0000-0000000000a7',    0,    0),  -- G
  ('00000000-0000-0000-0000-0000000000a8',    0,   50),  -- H
  ('00000000-0000-0000-0000-0000000000a9',    0,    0),  -- I
  ('00000000-0000-0000-0000-0000000000aa', 1000,    0),  -- J
  ('00000000-0000-0000-0000-0000000000ab',    0,    0);  -- K

-- Back every non-zero starting balance with a matching ledger row so DB-08's
-- "balance == sum(ledger.amount)" invariant holds from t=0, not just after RPC calls.
insert into public.wallet_ledger (user_id, currency, entry_type, amount, balance_after, note) values
  ('00000000-0000-0000-0000-0000000000a1', 'shard',  'adjust', 1200, 1200, 'seed baseline'),
  ('00000000-0000-0000-0000-0000000000a1', 'wallet', 'adjust', 2450, 2450, 'seed baseline'),
  ('00000000-0000-0000-0000-0000000000a2', 'shard',  'adjust',  300,  300, 'seed baseline'),
  ('00000000-0000-0000-0000-0000000000a2', 'wallet', 'adjust',  500,  500, 'seed baseline'),
  ('00000000-0000-0000-0000-0000000000a3', 'wallet', 'adjust',  100,  100, 'seed baseline'),
  ('00000000-0000-0000-0000-0000000000a8', 'wallet', 'adjust',   50,   50, 'seed baseline'),
  ('00000000-0000-0000-0000-0000000000aa', 'shard',  'adjust', 1000, 1000, 'seed baseline');

-- coin_packages (billing SKU) + one pending topup_order for D (DB-06)
insert into public.coin_packages (id, title, coins, bonus_coins, price_satang, active, sort)
values ('test_pkg_m', 'DBTEST Package M', 1000, 0, 10000, true, 1)
on conflict (id) do update set coins = excluded.coins, bonus_coins = excluded.bonus_coins,
  price_satang = excluded.price_satang, active = excluded.active;

delete from public.topup_orders where id = '20000000-0000-0000-0000-000000000001';
insert into public.topup_orders (id, user_id, package_id, coins, price_satang, provider, status)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4',
        'test_pkg_m', 1000, 10000, 'promptpay', 'pending');

-- catalog_items: one wallet-priced item for A, one shard-priced (official) item for B,
-- one deliberately-overpriced wallet item (DB-04), two 60-cost wallet items (DB-05).
insert into public.catalog_items (id, sku, item_type, title, currency, price, creator_id, status) values
  ('10000000-0000-0000-0000-000000000001', 'test.wallet-item-a', 'announcer_pack', 'DBTEST Wallet Item A', 'wallet',       550, null, 'active'),
  ('10000000-0000-0000-0000-000000000002', 'test.shard-item-a',  'announcer_pack', 'DBTEST Shard Item A',  'shard',        100, null, 'active'),
  ('10000000-0000-0000-0000-000000000003', 'test.pricey-item',   'announcer_pack', 'DBTEST Pricey Item',   'wallet', 999999999, null, 'active'),
  ('10000000-0000-0000-0000-000000000004', 'test.dbl-item-a',    'announcer_pack', 'DBTEST Double Item A', 'wallet',        60, null, 'active'),
  ('10000000-0000-0000-0000-000000000005', 'test.dbl-item-b',    'announcer_pack', 'DBTEST Double Item B', 'wallet',        60, null, 'active')
on conflict (id) do update set sku = excluded.sku, title = excluded.title, currency = excluded.currency,
  price = excluded.price, creator_id = excluded.creator_id, status = excluded.status;

-- A "starter" inventory row for B, used only as an RLS fixture for DB-02 (does not
-- collide with B's later purchase of item_id ...0002 in DB-03).
insert into public.inventory (user_id, item_id, source)
values ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', 'starter')
on conflict (user_id, item_id) do nothing;

-- economy_config: the two caps DB-11/DB-12 exercise, plus expiry (referenced by
-- mint_shard_from_match even though this file doesn't assert on shard_expires_at directly).
insert into public.economy_config (key, value) values
  ('shard_daily_earn_cap', '500'::jsonb),
  ('shard_daily_tip_receive_cap', '300'::jsonb),
  ('shard_expiry_days', '180'::jsonb)
on conflict (key) do update set value = excluded.value;

-- redeem_codes for DB-07: one single-use code, one already-expired code.
insert into public.redeem_codes (code, grant_type, coins, max_uses, used_count, expires_at) values
  ('TESTCODE1', 'coins', 100, 1, 0, null),
  ('TESTEXPIRED', 'coins', 50, 10, 0, now() - interval '1 day')
on conflict (code) do update set grant_type = excluded.grant_type, coins = excluded.coins,
  max_uses = excluded.max_uses, used_count = 0, expires_at = excluded.expires_at;

-- ============================================================================
-- DB-01 — authenticated cannot write wallets/wallet_ledger directly
-- (no INSERT/UPDATE/DELETE policy or grant; server-only via SECURITY DEFINER RPCs)
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$ update public.wallets set shard_balance = shard_balance + 1000000
       where user_id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null,
  'DB-01: authenticated cannot UPDATE wallets directly');

select throws_ok(
  $$ insert into public.wallet_ledger (user_id, currency, entry_type, amount, balance_after)
       values ('00000000-0000-0000-0000-0000000000a1', 'wallet', 'adjust', 1000000, 999999999) $$,
  '42501', null,
  'DB-01: authenticated cannot INSERT wallet_ledger directly');

-- ============================================================================
-- DB-02 — user A cannot read user B's / user D's wallet-scoped rows (RLS row scope)
-- ============================================================================
select is_empty(
  $$ select 1 from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a2' $$,
  'DB-02: user A cannot see user B''s wallets row (RLS)');

select is_empty(
  $$ select 1 from public.wallet_ledger where user_id = '00000000-0000-0000-0000-0000000000a2' $$,
  'DB-02: user A cannot see user B''s wallet_ledger rows (RLS)');

select is_empty(
  $$ select 1 from public.topup_orders where user_id = '00000000-0000-0000-0000-0000000000a4' $$,
  'DB-02: user A cannot see user D''s topup_orders row (RLS)');

select is_empty(
  $$ select 1 from public.inventory where user_id = '00000000-0000-0000-0000-0000000000a2' $$,
  'DB-02: user A cannot see user B''s inventory row (RLS)');

-- ============================================================================
-- DB-03 — purchase_item succeeds when balance is sufficient, for both a shard-priced
-- and a wallet-priced item; purchases+inventory+ledger land together, balance_after
-- is continuous, and the *other* currency is left untouched.
-- ============================================================================
-- still acting as A (wallet item)
select lives_ok(
  $$ select public.purchase_item('10000000-0000-0000-0000-000000000001') $$,
  'DB-03: purchase_item succeeds for A buying a wallet-priced item with sufficient balance');

select is(
  (select wallet_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a1'),
  1900::bigint,
  'DB-03: A wallet_balance decreased by the item price (2450-550)');

select is(
  (select shard_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a1'),
  1200::bigint,
  'DB-03: A shard_balance untouched by a wallet-currency purchase');

select ok(
  (select count(*) from public.purchases
     where user_id = '00000000-0000-0000-0000-0000000000a1'
       and item_id = '10000000-0000-0000-0000-000000000001'
       and currency = 'wallet' and price = 550) = 1
  and (select count(*) from public.inventory
         where user_id = '00000000-0000-0000-0000-0000000000a1'
           and item_id = '10000000-0000-0000-0000-000000000001'
           and source = 'purchase') = 1
  and exists (
        select 1 from public.wallet_ledger
         where user_id = '00000000-0000-0000-0000-0000000000a1'
           and currency = 'wallet' and entry_type = 'purchase'
           and amount = -550 and balance_after = 1900 and ref_type = 'purchase'
      ),
  'DB-03: wallet-item purchase produced matching purchases+inventory+ledger rows for A');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select lives_ok(
  $$ select public.purchase_item('10000000-0000-0000-0000-000000000002') $$,
  'DB-03: purchase_item succeeds for B buying a shard-priced item with sufficient balance');

select is(
  (select shard_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a2'),
  200::bigint,
  'DB-03: B shard_balance decreased by the item price (300-100)');

select is(
  (select wallet_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a2'),
  500::bigint,
  'DB-03: B wallet_balance untouched by a shard-currency purchase');

select ok(
  (select count(*) from public.purchases
     where user_id = '00000000-0000-0000-0000-0000000000a2'
       and item_id = '10000000-0000-0000-0000-000000000002'
       and currency = 'shard' and price = 100) = 1
  and (select count(*) from public.inventory
         where user_id = '00000000-0000-0000-0000-0000000000a2'
           and item_id = '10000000-0000-0000-0000-000000000002'
           and source = 'purchase') = 1
  and exists (
        select 1 from public.wallet_ledger
         where user_id = '00000000-0000-0000-0000-0000000000a2'
           and currency = 'shard' and entry_type = 'purchase'
           and amount = -100 and balance_after = 200 and ref_type = 'purchase'
      ),
  'DB-03: shard-item purchase produced matching purchases+inventory+ledger rows for B');

-- ============================================================================
-- DB-04 — purchase_item with insufficient balance: exception, no rows inserted at all
-- (whole transaction rolls back, not just the balance update).
-- ============================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a3","role":"authenticated"}';

select throws_ok(
  $$ select public.purchase_item('10000000-0000-0000-0000-000000000003') $$,
  null, null,
  'DB-04: purchase_item rejects when balance is insufficient');

select is_empty(
  $$ select 1 from public.purchases
       where user_id = '00000000-0000-0000-0000-0000000000a3'
         and item_id = '10000000-0000-0000-0000-000000000003' $$,
  'DB-04: no purchases row inserted after a failed (insufficient-balance) purchase');

select is(
  (select wallet_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a3'),
  100::bigint,
  'DB-04: C wallet_balance unchanged after failed purchase');

select ok(
  not exists (select 1 from public.inventory
                where user_id = '00000000-0000-0000-0000-0000000000a3'
                  and item_id = '10000000-0000-0000-0000-000000000003')
  and not exists (select 1 from public.wallet_ledger
                    where user_id = '00000000-0000-0000-0000-0000000000a3'
                      and note = 'DBTEST Pricey Item'),
  'DB-04: no inventory/ledger row leaked from the failed purchase (full tx rollback)');

-- ============================================================================
-- DB-05 — "concurrency": two 60-cost purchases against a 100 balance. Written as a
-- SEQUENTIAL double-call (see file header) proving the row lock + per-call balance
-- check never let the wallet go negative and never allow both to succeed.
-- ============================================================================
select lives_ok(
  $$ select public.purchase_item('10000000-0000-0000-0000-000000000004') $$,
  'DB-05 (seq. call 1/2): first 60-cost purchase succeeds against a 100 balance');

select is(
  (select wallet_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a3'),
  40::bigint,
  'DB-05: balance after call 1 is 40 (100-60)');

select throws_ok(
  $$ select public.purchase_item('10000000-0000-0000-0000-000000000005') $$,
  null, null,
  'DB-05 (seq. call 2/2): second 60-cost purchase is rejected against a 40 balance');

select is(
  (select wallet_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a3'),
  40::bigint,
  'DB-05: balance never goes negative after the rejected second call');

select is_empty(
  $$ select 1 from public.purchases
       where user_id = '00000000-0000-0000-0000-0000000000a3'
         and item_id = '10000000-0000-0000-0000-000000000005' $$,
  'DB-05: the second (would-be double-spend) purchase never committed');

-- ============================================================================
-- DB-06 — credit_topup called 3x on the same order: credited exactly once
-- (status guard makes repeat calls a no-op), one wallet_ledger row.
-- Called as the seed/owner role: credit_topup is service_role-only (see DB-13).
-- ============================================================================
reset role;

select lives_ok(
  $$ select public.credit_topup('20000000-0000-0000-0000-000000000001') $$,
  'DB-06 (call 1/3): credit_topup succeeds on a pending order');

select lives_ok(
  $$ select public.credit_topup('20000000-0000-0000-0000-000000000001') $$,
  'DB-06 (call 2/3): repeat call is a no-op (status guard)');

select lives_ok(
  $$ select public.credit_topup('20000000-0000-0000-0000-000000000001') $$,
  'DB-06 (call 3/3): repeat call is a no-op (status guard)');

select is(
  (select status from public.topup_orders where id = '20000000-0000-0000-0000-000000000001'),
  'paid',
  'DB-06: order status is paid after credit_topup');

select is(
  (select wallet_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a4'),
  1000::bigint,
  'DB-06: D credited exactly once (1000 coins), not 3x');

select is(
  (select count(*) from public.wallet_ledger
     where ref_type = 'topup_order' and ref_id = '20000000-0000-0000-0000-000000000001'),
  1::bigint,
  'DB-06: exactly one wallet_ledger row for the order despite 3 calls');

-- ============================================================================
-- DB-07 — redeem_code: same-user repeat, max_uses exceeded, and expired code are
-- all rejected; used_count is never incremented by a rejected attempt.
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select lives_ok(
  $$ select public.redeem_code('TESTCODE1') $$,
  'DB-07: A redeems a valid, unused code');

select is(
  (select wallet_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a1'),
  2000::bigint,
  'DB-07: A wallet_balance credited by the redeemed code (1900+100)');

-- redeem_codes has no client SELECT policy at all (by design — codes are never
-- readable by clients, validated entirely server-side inside redeem_code()); reset to
-- the seed/owner role before reading it directly, matching DB-08's pattern below.
reset role;
select is(
  (select used_count from public.redeem_codes where code = 'TESTCODE1'),
  1,
  'DB-07: TESTCODE1 used_count incremented to 1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$ select public.redeem_code('TESTCODE1') $$,
  null, null,
  'DB-07: same user cannot redeem the same code twice');

-- redeem_codes has no client SELECT policy at all (by design — codes are never
-- readable by clients, validated entirely server-side inside redeem_code()); reset to
-- the seed/owner role before reading it directly, matching DB-08's pattern below.
reset role;
select is(
  (select used_count from public.redeem_codes where code = 'TESTCODE1'),
  1,
  'DB-07: used_count unchanged after the rejected repeat redemption');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_ok(
  $$ select public.redeem_code('TESTCODE1') $$,
  null, null,
  'DB-07: a different user cannot redeem a code that is already at max_uses');

reset role;
select is(
  (select used_count from public.redeem_codes where code = 'TESTCODE1'),
  1,
  'DB-07: used_count still 1 after the max_uses-exceeded rejection');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}';

select throws_ok(
  $$ select public.redeem_code('TESTEXPIRED') $$,
  null, null,
  'DB-07: an expired code is rejected');

reset role;
select is(
  (select used_count from public.redeem_codes where code = 'TESTEXPIRED'),
  0,
  'DB-07: used_count for the expired code stays 0');

-- ============================================================================
-- DB-08 — invariant: shard_balance/wallet_balance == sum(ledger.amount) per currency,
-- for every wallet, after everything above. Run as the seed/owner role (unrestricted read).
-- ============================================================================
reset role;

select is(
  (select count(*) from public.wallets w
     where w.shard_balance <> coalesce(
             (select sum(amount) from public.wallet_ledger l
                where l.user_id = w.user_id and l.currency = 'shard'), 0)
        or w.wallet_balance <> coalesce(
             (select sum(amount) from public.wallet_ledger l
                where l.user_id = w.user_id and l.currency = 'wallet'), 0)
  )::bigint,
  0::bigint,
  'DB-08: shard_balance/wallet_balance equal the ledger sum per currency for every wallet');

-- ============================================================================
-- DB-09 — catalog_items schema-level guard: currency='shard' with a non-null
-- creator_id is rejected by the check constraint, independent of the RPC layer.
-- ============================================================================
select throws_ok(
  $$ insert into public.catalog_items (sku, item_type, title, currency, price, creator_id, status)
       values ('test.bad-shard-creator', 'announcer_pack', 'DBTEST Bad Shard Creator', 'shard', 10,
               '00000000-0000-0000-0000-0000000000a5', 'draft') $$,
  '23514', null,
  'DB-09: catalog_items rejects currency=shard with a non-null creator_id (check constraint)');

-- ============================================================================
-- DB-10 — mint_shard_from_match called twice with the same match_ref: the second
-- call fails on unique(user_id, match_ref); shard is not minted twice.
-- ============================================================================
select lives_ok(
  $$ select public.mint_shard_from_match(
       '00000000-0000-0000-0000-0000000000a6', 'matchref-f-1', 50, 'sig-f-1') $$,
  'DB-10 (call 1/2): mint_shard_from_match succeeds for a new match_ref');

select is(
  (select shard_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a6'),
  50::bigint,
  'DB-10: F shard_balance credited by the mint');

select is(
  (select count(*) from public.match_submissions
     where user_id = '00000000-0000-0000-0000-0000000000a6' and match_ref = 'matchref-f-1'),
  1::bigint,
  'DB-10: exactly one match_submissions row for the match_ref');

select throws_ok(
  $$ select public.mint_shard_from_match(
       '00000000-0000-0000-0000-0000000000a6', 'matchref-f-1', 50, 'sig-f-2') $$,
  '23505', null,
  'DB-10 (call 2/2): repeat mint on the same (user, match_ref) is rejected (unique constraint)');

select is(
  (select shard_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a6'),
  50::bigint,
  'DB-10: F shard_balance not double-minted');

select is(
  (select count(*) from public.match_submissions
     where user_id = '00000000-0000-0000-0000-0000000000a6' and match_ref = 'matchref-f-1'),
  1::bigint,
  'DB-10: still exactly one match_submissions row after the rejected repeat');

-- ============================================================================
-- DB-11 — mint_shard_from_match once the user is already at today's shard_daily_earn_cap:
-- rejected, no match_submissions row inserted.
-- ============================================================================
select lives_ok(
  $$ select public.mint_shard_from_match(
       '00000000-0000-0000-0000-0000000000a7', 'matchref-g-1', 500, 'sig-g-1') $$,
  'DB-11: mint exactly up to the daily cap (500) succeeds');

select is(
  (select shard_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a7'),
  500::bigint,
  'DB-11: G shard_balance reflects the cap-filling mint');

select throws_ok(
  $$ select public.mint_shard_from_match(
       '00000000-0000-0000-0000-0000000000a7', 'matchref-g-2', 1, 'sig-g-2') $$,
  null, null,
  'DB-11: minting even 1 more shard once at the daily cap is rejected');

select is_empty(
  $$ select 1 from public.match_submissions
       where user_id = '00000000-0000-0000-0000-0000000000a7' and match_ref = 'matchref-g-2' $$,
  'DB-11: no match_submissions row for the cap-rejected mint');

select is(
  (select shard_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a7'),
  500::bigint,
  'DB-11: G shard_balance unchanged by the rejected mint');

-- ============================================================================
-- DB-12 — tip(): sequential double-call proof (see file-header caveat) that (a) the
-- sender's balance never goes negative, and (b) the recipient's daily shard-tip cap is
-- never exceeded; both halves must also stay zero-sum (no partial debit on a rejected tip).
-- ============================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a8","role":"authenticated"}';

select lives_ok(
  $$ select public.tip('00000000-0000-0000-0000-0000000000a9', 40, 'wallet') $$,
  'DB-12a (call 1/2): H tips I 40 wallet coins, within balance');

select is(
  (select wallet_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a8'),
  10::bigint,
  'DB-12a: H wallet_balance decreased by the tip (50-40)');

select throws_ok(
  $$ select public.tip('00000000-0000-0000-0000-0000000000a9', 40, 'wallet') $$,
  null, null,
  'DB-12a (call 2/2): repeat tip is rejected once balance is insufficient (10<40)');

select is(
  (select wallet_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000a8'),
  10::bigint,
  'DB-12a: H balance never goes negative after the rejected second tip');

select is(
  (select count(*) from public.tips
     where from_user = '00000000-0000-0000-0000-0000000000a8'
       and to_user = '00000000-0000-0000-0000-0000000000a9'),
  1::bigint,
  'DB-12a: only the first tip committed');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}';

select lives_ok(
  $$ select public.tip('00000000-0000-0000-0000-0000000000ab', 200, 'shard') $$,
  'DB-12b (call 1/2): J tips K 200 shard, within the daily receive cap (300)');

-- wallet_ledger's RLS is "own read" (auth.uid() = user_id) — J (the acting role here) cannot
-- read K's ledger rows. Reset to the seed/owner role to inspect K's side, matching the
-- DB-07/DB-08 pattern, then restore J's session before the second tip() call.
reset role;
select is(
  (select coalesce(sum(amount),0)::bigint from public.wallet_ledger
     where user_id = '00000000-0000-0000-0000-0000000000ab'
       and currency = 'shard' and entry_type = 'tip_received'
       and created_at >= date_trunc('day', now())),
  200::bigint,
  'DB-12b: K received exactly 200 shard today so far');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000aa","role":"authenticated"}';

select throws_ok(
  $$ select public.tip('00000000-0000-0000-0000-0000000000ab', 200, 'shard') $$,
  null, null,
  'DB-12b (call 2/2): a second 200-shard tip is rejected (200+200 > 300 cap)');

reset role;
select is(
  (select coalesce(sum(amount),0)::bigint from public.wallet_ledger
     where user_id = '00000000-0000-0000-0000-0000000000ab'
       and currency = 'shard' and entry_type = 'tip_received'
       and created_at >= date_trunc('day', now())),
  200::bigint,
  'DB-12b: K''s daily received total never exceeds the cap');

select is(
  (select shard_balance from public.wallets where user_id = '00000000-0000-0000-0000-0000000000aa'),
  800::bigint,
  'DB-12b: J debited only once (1000-200), no partial debit on the rejected second tip');

-- ============================================================================
-- DB-13 — authenticated has no EXECUTE grant on the service-role-only functions
-- credit_topup / mint_shard_from_match (they're callable only via service_role from
-- an Edge Function, never directly by a signed-in client).
-- ============================================================================
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$ select public.credit_topup('20000000-0000-0000-0000-000000000001') $$,
  '42501', null,
  'DB-13: authenticated has no EXECUTE grant on credit_topup (service_role-only)');

select throws_ok(
  $$ select public.mint_shard_from_match(
       '00000000-0000-0000-0000-0000000000a1', 'matchref-db13', 10, 'sig-db13') $$,
  '42501', null,
  'DB-13: authenticated has no EXECUTE grant on mint_shard_from_match (service_role-only)');

reset role;
select * from finish();
rollback;
