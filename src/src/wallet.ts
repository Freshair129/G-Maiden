// Wallet + billing (CR-003 Phase 1, v0.3.0) — shard (earned, prestige) and
// wallet (purchased, G-Coins) balances are tracked separately per ADR-16.
// Additive like the rest of the account layer: signed-out renders zeroed
// state and no-ops instead of crashing. Reads `wallets` (RLS-scoped to the
// caller's own row) + small aggregates (today's shard earn, daily cap), and
// subscribes to Realtime on that row so top-up/purchase/tip balances update
// live without polling (CR-003 §2.6). Writes go through `purchase_item` /
// `redeem_code` / `tip` RPCs and the `topup-create` / `match-share-submit`
// Edge Functions (§2.4/§2.5) — the client never writes wallet columns directly.

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export interface WalletSnapshot {
  shardBalance: number;
  walletBalance: number;
  lifetimeShardEarned: number;
  lifetimeShardSpent: number;
  lifetimeTopup: number;
  lifetimeSpend: number;
  shardExpiresAt: string | null; // ISO 8601, null if never earned any shard
  shardDailyEarnCap: number | null; // from economy_config('shard_daily_earn_cap'), null if unset
  shardEarnedToday: number; // sum of today's currency='shard' entry_type='earn_share' ledger amount
  loading: boolean;
}

export interface TopupResult {
  orderId: string;
  qrImageUri?: string;
  authorizeUri?: string;
  expiresAt: string;
}

export interface ShareMatchResult {
  shardMinted: number;
  reason?: string; // present when shardMinted === 0
}

export interface LedgerEntry {
  id: number;
  currency: "shard" | "wallet";
  entryType: string;
  amount: number;
  balanceAfter: number;
  refType: string | null;
  refId: string | null;
  note: string | null;
  createdAt: string;
}

const EMPTY_SNAPSHOT: WalletSnapshot = {
  shardBalance: 0,
  walletBalance: 0,
  lifetimeShardEarned: 0,
  lifetimeShardSpent: 0,
  lifetimeTopup: 0,
  lifetimeSpend: 0,
  shardExpiresAt: null,
  shardDailyEarnCap: null,
  shardEarnedToday: 0,
  loading: false,
};

type WalletRow = {
  shard_balance: number | string;
  lifetime_shard_earned: number | string;
  lifetime_shard_spent: number | string;
  lifetime_topup: number | string;
  lifetime_spend: number | string;
  shard_expires_at: string | null;
  wallet_balance: number | string;
};

type LedgerRow = {
  id: number;
  currency: "shard" | "wallet";
  entry_type: string;
  amount: number | string;
  balance_after: number | string;
  ref_type: string | null;
  ref_id: string | null;
  note: string | null;
  created_at: string;
};

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}

function toLedgerEntry(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    currency: row.currency,
    entryType: row.entry_type,
    amount: num(row.amount),
    balanceAfter: num(row.balance_after),
    refType: row.ref_type,
    refId: row.ref_id,
    note: row.note,
    createdAt: row.created_at,
  };
}

// UTC midnight, not local midnight: the DB enforces daily caps with `date_trunc('day', now())`,
// and Supabase Postgres sessions default to UTC — using local time here would make the "N/cap"
// display drift from actual server-side enforcement near either midnight (Opus review gate
// finding, 2026-07-11; display-only, the DB is always the source of truth for enforcement).
function startOfTodayIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export function useWallet(): WalletSnapshot & {
  purchase: (itemId: string) => Promise<void>;
  topup: (packageId: string, provider: "promptpay" | "truemoney") => Promise<TopupResult>;
  redeem: (code: string) => Promise<void>;
  tip: (toUserId: string, amount: number, currency: "shard" | "wallet") => Promise<void>;
  shareMatch: (matchId: string) => Promise<ShareMatchResult>;
  ledger: (opts?: { currency?: "shard" | "wallet"; limit?: number; before?: string }) => Promise<LedgerEntry[]>;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<WalletSnapshot>(EMPTY_SNAPSHOT);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }
    setSnapshot((s) => ({ ...s, loading: true }));

    const [walletRes, capRes, todayRes] = await Promise.all([
      supabase
        .from("wallets")
        .select(
          "shard_balance, lifetime_shard_earned, lifetime_shard_spent, lifetime_topup, lifetime_spend, shard_expires_at, wallet_balance",
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("economy_config").select("value").eq("key", "shard_daily_earn_cap").maybeSingle(),
      supabase
        .from("wallet_ledger")
        .select("amount")
        .eq("user_id", user.id)
        .eq("currency", "shard")
        .eq("entry_type", "earn_share")
        .gte("created_at", startOfTodayIso()),
    ]);

    const row = (walletRes.data as WalletRow | null) ?? null;
    const capValue = capRes.data?.value as number | string | null | undefined;
    const earnedToday = ((todayRes.data as { amount: number | string }[] | null) ?? []).reduce(
      (sum, r) => sum + num(r.amount),
      0,
    );

    setSnapshot({
      shardBalance: num(row?.shard_balance),
      walletBalance: num(row?.wallet_balance),
      lifetimeShardEarned: num(row?.lifetime_shard_earned),
      lifetimeShardSpent: num(row?.lifetime_shard_spent),
      lifetimeTopup: num(row?.lifetime_topup),
      lifetimeSpend: num(row?.lifetime_spend),
      shardExpiresAt: row?.shard_expires_at ?? null,
      shardDailyEarnCap: capValue === null || capValue === undefined ? null : num(capValue),
      shardEarnedToday: earnedToday,
      loading: false,
    });
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: keep balances live during top-up / purchase / tip (CR-003 §2.6)
  // without polling. Re-subscribes whenever the signed-in user changes.
  useEffect(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (!user) return;

    const channel = supabase
      .channel(`wallet-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user?.id, load]);

  const purchase = useCallback(
    async (itemId: string): Promise<void> => {
      if (!user) throw new Error("not signed in");
      const { error } = await supabase.rpc("purchase_item", { p_item_id: itemId });
      if (error) throw error;
      await load();
    },
    [user?.id, load],
  );

  const topup = useCallback(
    async (packageId: string, provider: "promptpay" | "truemoney"): Promise<TopupResult> => {
      if (!user) throw new Error("not signed in");
      const { data, error } = await supabase.functions.invoke<{
        order_id: string;
        qr_image_uri?: string;
        authorize_uri?: string;
        expires_at: string;
      }>("topup-create", { body: { package_id: packageId, provider } });
      if (error) throw error;
      if (!data) throw new Error("topup-create returned no data");
      return {
        orderId: data.order_id,
        qrImageUri: data.qr_image_uri,
        authorizeUri: data.authorize_uri,
        expiresAt: data.expires_at,
      };
    },
    [user?.id],
  );

  const redeem = useCallback(
    async (code: string): Promise<void> => {
      if (!user) throw new Error("not signed in");
      const { error } = await supabase.rpc("redeem_code", { p_code: code });
      if (error) throw error;
      await load();
    },
    [user?.id, load],
  );

  const tip = useCallback(
    async (toUserId: string, amount: number, currency: "shard" | "wallet"): Promise<void> => {
      if (!user) throw new Error("not signed in");
      const { error } = await supabase.rpc("tip", {
        p_to_user: toUserId,
        p_amount: amount,
        p_currency: currency,
      });
      if (error) throw error;
      await load();
    },
    [user?.id, load],
  );

  const shareMatch = useCallback(
    async (matchId: string): Promise<ShareMatchResult> => {
      if (!user) throw new Error("not signed in");
      const { data, error } = await supabase.functions.invoke<{ shard_minted: number; reason?: string }>(
        "match-share-submit",
        { body: { match_id: matchId } },
      );
      if (error) throw error;
      if (!data) throw new Error("match-share-submit returned no data");
      await load();
      return { shardMinted: data.shard_minted, reason: data.reason };
    },
    [user?.id, load],
  );

  const ledger = useCallback(
    async (opts?: { currency?: "shard" | "wallet"; limit?: number; before?: string }): Promise<LedgerEntry[]> => {
      if (!user) return [];
      let query = supabase
        .from("wallet_ledger")
        .select("id, currency, entry_type, amount, balance_after, ref_type, ref_id, note, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(opts?.limit ?? 20);
      if (opts?.currency) query = query.eq("currency", opts.currency);
      if (opts?.before) query = query.lt("created_at", opts.before);
      const { data, error } = await query;
      if (error) throw error;
      return ((data as LedgerRow[] | null) ?? []).map(toLedgerEntry);
    },
    [user?.id],
  );

  return { ...snapshot, purchase, topup, redeem, tip, shareMatch, ledger, refresh: load };
}
