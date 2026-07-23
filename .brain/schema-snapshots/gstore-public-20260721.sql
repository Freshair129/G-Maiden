


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."alloc_cohort_seq"("gen" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare s bigint;
begin
  insert into public.gid_counters(generation, next_seq) values (gen, 2)
  on conflict (generation) do update set next_seq = gid_counters.next_seq + 1
  returning next_seq into s;
  return s - 1;  -- allocated value (insert path returns 2 -> 1; update returns old+1 -> old)
end $$;


ALTER FUNCTION "public"."alloc_cohort_seq"("gen" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."credit_topup"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_order topup_orders;
  v_bal   bigint;
begin
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


ALTER FUNCTION "public"."credit_topup"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_wallet"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into wallets (user_id) values (p_user_id) on conflict (user_id) do nothing;
end $$;


ALTER FUNCTION "public"."ensure_wallet"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare gen text := 'B';
begin
  insert into public.profiles (id, email, generation, cohort_seq)
  values (new.id, new.email, gen, public.alloc_cohort_seq(gen))
  on conflict (id) do nothing;
  return new;
end
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."match_submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "match_ref" "text" NOT NULL,
    "verified" boolean DEFAULT false NOT NULL,
    "shard_minted" bigint DEFAULT 0 NOT NULL,
    "receipt_sig" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "match_submissions_shard_minted_check" CHECK (("shard_minted" >= 0))
);


ALTER TABLE "public"."match_submissions" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mint_shard_from_match"("p_user_id" "uuid", "p_match_ref" "text", "p_shard" bigint, "p_receipt_sig" "text") RETURNS "public"."match_submissions"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_bal  bigint;
  v_cap  bigint;
  v_today_earned bigint;
  v_row  match_submissions;
begin
  if p_shard <= 0 then raise exception 'shard must be positive'; end if;
  perform ensure_wallet(p_user_id);

  select shard_balance into v_bal from wallets where user_id = p_user_id for update;

  select (value #>> '{}')::bigint into v_cap from economy_config where key = 'shard_daily_earn_cap';
  select coalesce(sum(amount), 0) into v_today_earned from wallet_ledger
   where user_id = p_user_id and currency = 'shard' and entry_type = 'earn_share'
     and created_at >= date_trunc('day', now());
  if v_cap is not null and v_today_earned + p_shard > v_cap then
    raise exception 'daily shard earn cap reached';
  end if;

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


ALTER FUNCTION "public"."mint_shard_from_match"("p_user_id" "uuid", "p_match_ref" "text", "p_shard" bigint, "p_receipt_sig" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "currency" "text" NOT NULL,
    "price" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "purchases_currency_check" CHECK (("currency" = ANY (ARRAY['shard'::"text", 'wallet'::"text"]))),
    CONSTRAINT "purchases_price_check" CHECK (("price" >= 0))
);


ALTER TABLE "public"."purchases" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purchase_item"("p_item_id" "uuid") RETURNS "public"."purchases"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  select case v_item.currency when 'shard' then shard_balance else wallet_balance end
    into v_bal from wallets where user_id = v_uid for update;
  if v_bal < v_item.price then raise exception 'insufficient balance'; end if;
  if v_item.currency = 'shard' and v_item.creator_id is not null then
    raise exception 'shard cannot purchase creator items';
  end if;

  insert into purchases (user_id, item_id, currency, price)
  values (v_uid, p_item_id, v_item.currency, v_item.price)
  returning * into v_row;

  insert into inventory (user_id, item_id, source, ref_id)
  values (v_uid, p_item_id, 'purchase', v_row.id::text);

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


ALTER FUNCTION "public"."purchase_item"("p_item_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."redeem_code"("p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_uid    uuid := auth.uid();
  v_code   text := upper(p_code);
  v_row    redeem_codes;
  v_bal    bigint;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;

  select * into v_row from redeem_codes where code = v_code for update;
  if not found then raise exception 'invalid code'; end if;

  if v_row.expires_at is not null and now() >= v_row.expires_at then
    raise exception 'code expired';
  end if;
  if v_row.used_count >= v_row.max_uses then
    raise exception 'code fully redeemed';
  end if;

  begin
    insert into redemptions (code, user_id) values (v_code, v_uid);
  exception when unique_violation then
    raise exception 'you have already redeemed this code';
  end;

  if v_row.grant_type = 'coins' then
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


ALTER FUNCTION "public"."redeem_code"("p_code" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tips" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_user" "uuid" NOT NULL,
    "to_user" "uuid" NOT NULL,
    "currency" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tips_amount_check" CHECK (("amount" > 0)),
    CONSTRAINT "tips_check" CHECK (("from_user" <> "to_user")),
    CONSTRAINT "tips_currency_check" CHECK (("currency" = ANY (ARRAY['shard'::"text", 'wallet'::"text"])))
);


ALTER TABLE "public"."tips" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tip"("p_to_user" "uuid", "p_amount" bigint, "p_currency" "text") RETURNS "public"."tips"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    into v_bal from wallets where user_id = v_uid;
  if v_bal < p_amount then raise exception 'insufficient balance'; end if;

  insert into tips (from_user, to_user, currency, amount)
  values (v_uid, p_to_user, p_currency, p_amount)
  returning * into v_row;

  if p_currency = 'shard' then
    update wallets set shard_balance = shard_balance - p_amount, updated_at = now() where user_id = v_uid;
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


ALTER FUNCTION "public"."tip"("p_to_user" "uuid", "p_amount" bigint, "p_currency" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin new.updated_at = now(); return new; end; $$;


ALTER FUNCTION "public"."touch_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalog_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text" NOT NULL,
    "item_type" "text" DEFAULT 'announcer_pack'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "currency" "text" NOT NULL,
    "price" bigint NOT NULL,
    "pack_id" "text",
    "banner_url" "text",
    "bundle_path" "text",
    "creator_id" "uuid",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "catalog_items_check" CHECK ((("currency" <> 'shard'::"text") OR ("creator_id" IS NULL))),
    CONSTRAINT "catalog_items_currency_check" CHECK (("currency" = ANY (ARRAY['shard'::"text", 'wallet'::"text"]))),
    CONSTRAINT "catalog_items_item_type_check" CHECK (("item_type" = ANY (ARRAY['announcer_pack'::"text", 'persona'::"text", 'advice_style'::"text"]))),
    CONSTRAINT "catalog_items_price_check" CHECK (("price" >= 0)),
    CONSTRAINT "catalog_items_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'delisted'::"text"])))
);


ALTER TABLE "public"."catalog_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."closed_beta_enrollments" (
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'registered'::"text" NOT NULL,
    "source" "text" DEFAULT 'landing'::"text" NOT NULL,
    "registered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "closed_beta_enrollments_source_check" CHECK (("source" = 'landing'::"text")),
    CONSTRAINT "closed_beta_enrollments_status_check" CHECK (("status" = ANY (ARRAY['registered'::"text", 'invited'::"text", 'revoked'::"text"])))
);


ALTER TABLE "public"."closed_beta_enrollments" OWNER TO "postgres";


COMMENT ON TABLE "public"."closed_beta_enrollments" IS 'CR-005 Closed Beta opt-in. Contains identity enrollment only; no match, CV, or G-Log data.';



CREATE TABLE IF NOT EXISTS "public"."coin_packages" (
    "id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "coins" bigint NOT NULL,
    "bonus_coins" bigint DEFAULT 0 NOT NULL,
    "price_satang" integer NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "coin_packages_coins_check" CHECK (("coins" > 0)),
    CONSTRAINT "coin_packages_price_satang_check" CHECK (("price_satang" > 0))
);


ALTER TABLE "public"."coin_packages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deletion_requests" (
    "user_id" "uuid" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone
);


ALTER TABLE "public"."deletion_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."economy_config" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."economy_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gid_counters" (
    "generation" "text" NOT NULL,
    "next_seq" bigint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."gid_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "item_id" "uuid" NOT NULL,
    "source" "text" NOT NULL,
    "ref_id" "text",
    "acquired_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_source_check" CHECK (("source" = ANY (ARRAY['purchase'::"text", 'grant'::"text", 'redeem'::"text", 'starter'::"text"])))
);


ALTER TABLE "public"."inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "phone" "text",
    "steamid64" "text",
    "account_id" bigint,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gid_code" "text",
    "generation" "text" DEFAULT 'F'::"text" NOT NULL,
    "cohort_seq" bigint,
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'creator'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."redeem_codes" (
    "code" "text" NOT NULL,
    "grant_type" "text" NOT NULL,
    "coins" bigint,
    "item_id" "uuid",
    "max_uses" integer DEFAULT 1 NOT NULL,
    "used_count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "redeem_codes_check" CHECK (("used_count" <= "max_uses")),
    CONSTRAINT "redeem_codes_check1" CHECK (((("grant_type" = 'coins'::"text") AND ("coins" IS NOT NULL)) OR (("grant_type" = 'item'::"text") AND ("item_id" IS NOT NULL)))),
    CONSTRAINT "redeem_codes_coins_check" CHECK (("coins" > 0)),
    CONSTRAINT "redeem_codes_grant_type_check" CHECK (("grant_type" = ANY (ARRAY['coins'::"text", 'item'::"text"])))
);


ALTER TABLE "public"."redeem_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."redemptions" (
    "code" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "redeemed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."redemptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."topup_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "package_id" "text" NOT NULL,
    "coins" bigint NOT NULL,
    "price_satang" integer NOT NULL,
    "provider" "text" NOT NULL,
    "provider_charge_id" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "qr_image_uri" "text",
    "authorize_uri" "text",
    "expires_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "topup_orders_coins_check" CHECK (("coins" > 0)),
    CONSTRAINT "topup_orders_price_satang_check" CHECK (("price_satang" > 0)),
    CONSTRAINT "topup_orders_provider_check" CHECK (("provider" = ANY (ARRAY['promptpay'::"text", 'truemoney'::"text"]))),
    CONSTRAINT "topup_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."topup_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_ledger" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "currency" "text" NOT NULL,
    "entry_type" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "balance_after" bigint NOT NULL,
    "ref_type" "text",
    "ref_id" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallet_ledger_amount_check" CHECK (("amount" <> 0)),
    CONSTRAINT "wallet_ledger_balance_after_check" CHECK (("balance_after" >= 0)),
    CONSTRAINT "wallet_ledger_check" CHECK (((("currency" = 'shard'::"text") AND ("entry_type" = ANY (ARRAY['earn_share'::"text", 'tip_sent'::"text", 'tip_received'::"text", 'purchase'::"text", 'adjust'::"text", 'grant'::"text", 'redeem'::"text"]))) OR (("currency" = 'wallet'::"text") AND ("entry_type" = ANY (ARRAY['topup'::"text", 'purchase'::"text", 'refund'::"text", 'grant'::"text", 'redeem'::"text", 'adjust'::"text", 'tip_sent'::"text", 'tip_received'::"text"]))))),
    CONSTRAINT "wallet_ledger_currency_check" CHECK (("currency" = ANY (ARRAY['shard'::"text", 'wallet'::"text"]))),
    CONSTRAINT "wallet_ledger_entry_type_check" CHECK (("entry_type" = ANY (ARRAY['topup'::"text", 'purchase'::"text", 'refund'::"text", 'grant'::"text", 'redeem'::"text", 'adjust'::"text", 'earn_share'::"text", 'tip_sent'::"text", 'tip_received'::"text"])))
);


ALTER TABLE "public"."wallet_ledger" OWNER TO "postgres";


ALTER TABLE "public"."wallet_ledger" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."wallet_ledger_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."wallets" (
    "user_id" "uuid" NOT NULL,
    "shard_balance" bigint DEFAULT 0 NOT NULL,
    "lifetime_shard_earned" bigint DEFAULT 0 NOT NULL,
    "lifetime_shard_spent" bigint DEFAULT 0 NOT NULL,
    "shard_expires_at" timestamp with time zone,
    "wallet_balance" bigint DEFAULT 0 NOT NULL,
    "lifetime_topup" bigint DEFAULT 0 NOT NULL,
    "lifetime_spend" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallets_shard_balance_check" CHECK (("shard_balance" >= 0)),
    CONSTRAINT "wallets_wallet_balance_check" CHECK (("wallet_balance" >= 0))
);


ALTER TABLE "public"."wallets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_events" (
    "provider" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhook_events" OWNER TO "postgres";


ALTER TABLE ONLY "public"."catalog_items"
    ADD CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalog_items"
    ADD CONSTRAINT "catalog_items_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."closed_beta_enrollments"
    ADD CONSTRAINT "closed_beta_enrollments_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."coin_packages"
    ADD CONSTRAINT "coin_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deletion_requests"
    ADD CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."economy_config"
    ADD CONSTRAINT "economy_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."gid_counters"
    ADD CONSTRAINT "gid_counters_pkey" PRIMARY KEY ("generation");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_user_id_item_id_key" UNIQUE ("user_id", "item_id");



ALTER TABLE ONLY "public"."match_submissions"
    ADD CONSTRAINT "match_submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."match_submissions"
    ADD CONSTRAINT "match_submissions_user_id_match_ref_key" UNIQUE ("user_id", "match_ref");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_gid_code_key" UNIQUE ("gid_code");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_user_id_item_id_key" UNIQUE ("user_id", "item_id");



ALTER TABLE ONLY "public"."redeem_codes"
    ADD CONSTRAINT "redeem_codes_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."redemptions"
    ADD CONSTRAINT "redemptions_pkey" PRIMARY KEY ("code", "user_id");



ALTER TABLE ONLY "public"."tips"
    ADD CONSTRAINT "tips_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topup_orders"
    ADD CONSTRAINT "topup_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."topup_orders"
    ADD CONSTRAINT "topup_orders_provider_charge_id_key" UNIQUE ("provider_charge_id");



ALTER TABLE ONLY "public"."wallet_ledger"
    ADD CONSTRAINT "wallet_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."webhook_events"
    ADD CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("provider", "event_id");



CREATE INDEX "inventory_user_idx" ON "public"."inventory" USING "btree" ("user_id");



CREATE INDEX "match_submissions_user_idx" ON "public"."match_submissions" USING "btree" ("user_id", "submitted_at" DESC);



CREATE INDEX "tips_to_user_idx" ON "public"."tips" USING "btree" ("to_user", "currency", "created_at" DESC);



CREATE INDEX "topup_orders_user_idx" ON "public"."topup_orders" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "wallet_ledger_currency_idx" ON "public"."wallet_ledger" USING "btree" ("user_id", "currency", "created_at" DESC);



CREATE INDEX "wallet_ledger_user_idx" ON "public"."wallet_ledger" USING "btree" ("user_id", "created_at" DESC);



CREATE OR REPLACE TRIGGER "profiles_touch_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();



ALTER TABLE ONLY "public"."catalog_items"
    ADD CONSTRAINT "catalog_items_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."closed_beta_enrollments"
    ADD CONSTRAINT "closed_beta_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deletion_requests"
    ADD CONSTRAINT "deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id");



ALTER TABLE ONLY "public"."inventory"
    ADD CONSTRAINT "inventory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."match_submissions"
    ADD CONSTRAINT "match_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."redeem_codes"
    ADD CONSTRAINT "redeem_codes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."redeem_codes"
    ADD CONSTRAINT "redeem_codes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id");



ALTER TABLE ONLY "public"."redemptions"
    ADD CONSTRAINT "redemptions_code_fkey" FOREIGN KEY ("code") REFERENCES "public"."redeem_codes"("code");



ALTER TABLE ONLY "public"."redemptions"
    ADD CONSTRAINT "redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tips"
    ADD CONSTRAINT "tips_from_user_fkey" FOREIGN KEY ("from_user") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tips"
    ADD CONSTRAINT "tips_to_user_fkey" FOREIGN KEY ("to_user") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."topup_orders"
    ADD CONSTRAINT "topup_orders_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."coin_packages"("id");



ALTER TABLE ONLY "public"."topup_orders"
    ADD CONSTRAINT "topup_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_ledger"
    ADD CONSTRAINT "wallet_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallets"
    ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "beta_enrollment_own_insert" ON "public"."closed_beta_enrollments" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ("status" = 'registered'::"text") AND ("source" = 'landing'::"text")));



CREATE POLICY "beta_enrollment_own_select" ON "public"."closed_beta_enrollments" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."catalog_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."closed_beta_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coin_packages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deletion_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."economy_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."gid_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."match_submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "own read" ON "public"."inventory" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own read" ON "public"."match_submissions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own read" ON "public"."purchases" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own read" ON "public"."redemptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own read" ON "public"."tips" FOR SELECT USING ((("auth"."uid"() = "from_user") OR ("auth"."uid"() = "to_user")));



CREATE POLICY "own read" ON "public"."topup_orders" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own read" ON "public"."wallet_ledger" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own read" ON "public"."wallets" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "own rw" ON "public"."deletion_requests" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "own_profile_select" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "own_profile_update" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "public read" ON "public"."catalog_items" FOR SELECT USING (("status" = 'active'::"text"));



CREATE POLICY "public read" ON "public"."coin_packages" FOR SELECT USING ("active");



CREATE POLICY "public read" ON "public"."economy_config" FOR SELECT USING (true);



ALTER TABLE "public"."purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."redeem_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."redemptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tips" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."topup_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."alloc_cohort_seq"("gen" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."alloc_cohort_seq"("gen" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."credit_topup"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."credit_topup"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ensure_wallet"("p_user_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."match_submissions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."match_submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."match_submissions" TO "service_role";



REVOKE ALL ON FUNCTION "public"."mint_shard_from_match"("p_user_id" "uuid", "p_match_ref" "text", "p_shard" bigint, "p_receipt_sig" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mint_shard_from_match"("p_user_id" "uuid", "p_match_ref" "text", "p_shard" bigint, "p_receipt_sig" "text") TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchases" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."purchases" TO "service_role";



REVOKE ALL ON FUNCTION "public"."purchase_item"("p_item_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purchase_item"("p_item_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."purchase_item"("p_item_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."redeem_code"("p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redeem_code"("p_code" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."redeem_code"("p_code" "text") TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tips" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tips" TO "authenticated";
GRANT ALL ON TABLE "public"."tips" TO "service_role";



REVOKE ALL ON FUNCTION "public"."tip"("p_to_user" "uuid", "p_amount" bigint, "p_currency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tip"("p_to_user" "uuid", "p_amount" bigint, "p_currency" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."tip"("p_to_user" "uuid", "p_amount" bigint, "p_currency" "text") TO "authenticated";



GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_updated_at"() TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."catalog_items" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."catalog_items" TO "authenticated";
GRANT ALL ON TABLE "public"."catalog_items" TO "service_role";



GRANT ALL ON TABLE "public"."closed_beta_enrollments" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."closed_beta_enrollments" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."coin_packages" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."coin_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."coin_packages" TO "service_role";



GRANT ALL ON TABLE "public"."deletion_requests" TO "anon";
GRANT ALL ON TABLE "public"."deletion_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."deletion_requests" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."economy_config" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."economy_config" TO "authenticated";
GRANT ALL ON TABLE "public"."economy_config" TO "service_role";



GRANT ALL ON TABLE "public"."gid_counters" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."inventory" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("steamid64") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("account_id") ON TABLE "public"."profiles" TO "authenticated";



GRANT UPDATE("display_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."redeem_codes" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."redeem_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."redeem_codes" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."redemptions" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."redemptions" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."topup_orders" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."topup_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."topup_orders" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."wallet_ledger" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."wallet_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_ledger" TO "service_role";



GRANT ALL ON SEQUENCE "public"."wallet_ledger_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."wallet_ledger_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."wallet_ledger_id_seq" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."wallets" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."wallets" TO "authenticated";
GRANT ALL ON TABLE "public"."wallets" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."webhook_events" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."webhook_events" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_events" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







