// Wallet tab (CR-003 §3.2) — shows both balances separately per ADR-16 (shard
// = earned/prestige, wallet = purchased G-Coins), the shard daily-cap/expiry
// transparency line, and a 3-row recent-transactions preview pulled straight
// from `wallet_ledger` via `useWallet().ledger()`. All numbers come from
// `wallet.ts`'s Realtime-backed snapshot — this file never writes wallet
// columns itself.

import { useEffect, useState } from "react";
import { useAuth } from "./auth";
import { useWallet, type LedgerEntry } from "./wallet";
import TopupModal from "./TopupModal";

function errText(e: unknown): string {
  return (e as { message?: string })?.message ?? String(e) ?? "เกิดข้อผิดพลาด";
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function entryIcon(e: LedgerEntry): string {
  if (e.currency === "shard") return "💎";
  switch (e.entryType) {
    case "topup": return "↑";
    case "purchase": return "↓";
    case "tip_sent": return "↓";
    case "tip_received": return "↑";
    default: return "★";
  }
}

function entryLabel(e: LedgerEntry): string {
  switch (e.entryType) {
    case "topup": return "เติมเหรียญ";
    case "purchase": return e.note ?? "ซื้อไอเทม";
    case "grant": return e.note ?? "ได้รับของขวัญ";
    case "redeem": return "แลกโค้ด";
    case "earn_share": return "แชร์แมตช์ (verified)";
    case "tip_sent": return "ส่งทิป";
    case "tip_received": return "ได้รับทิป";
    case "adjust": return "ปรับยอดโดยแอดมิน";
    case "refund": return "คืนเงิน";
    default: return e.entryType;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

export interface WalletTabProps {
  /** Stub — no History/LedgerTab.tsx exists yet (CR-003 §3.7 lists it as a
   *  separate not-yet-built file), and this page isn't handed CommandDeck's
   *  `tab` state, so there's no established way to switch tabs from here.
   *  Wire this to whatever tab-switch mechanism lands with LedgerTab.tsx. */
  onViewAllTransactions?: () => void;
}

export default function WalletTab({ onViewAllTransactions }: WalletTabProps) {
  const { user } = useAuth();
  const wallet = useWallet();
  const {
    shardBalance,
    walletBalance,
    lifetimeTopup,
    lifetimeSpend,
    shardExpiresAt,
    shardDailyEarnCap,
    shardEarnedToday,
    loading,
    ledger,
  } = wallet;

  const [recent, setRecent] = useState<LedgerEntry[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupPending, setTopupPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setRecent([]); setRecentLoading(false); return; }
      setRecentLoading(true);
      try {
        const rows = await ledger({ limit: 3 });
        if (!cancelled) setRecent(rows);
      } catch (e) {
        if (!cancelled) setMsg(errText(e));
      } finally {
        if (!cancelled) setRecentLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // Re-pull the preview whenever a balance moves (topup/purchase/tip/share)
    // so the "recent" list stays in sync without polling the ledger itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, shardBalance, walletBalance]);

  function handleViewAll() {
    if (onViewAllTransactions) { onViewAllTransactions(); return; }
    setMsg("ดูทั้งหมด — ยังไม่ได้ต่อแท็บ History (TODO)");
  }

  const expiresInDays = daysUntil(shardExpiresAt);
  const capLabel = shardDailyEarnCap != null ? `${shardEarnedToday.toLocaleString()}/${shardDailyEarnCap.toLocaleString()}` : null;

  return (
    <div className="wallet-tab">
      <div className="wallet-hero">
        <div className="wallet-balance-row">
          <div className="wallet-balance shard">
            <span className="wallet-balance-icon">💎</span>
            <span className="wallet-balance-num">{shardBalance.toLocaleString()}</span>
            <span className="wallet-balance-label">Shard</span>
          </div>
          <div className="wallet-balance coin">
            <span className="wallet-balance-icon">🪙</span>
            <span className="wallet-balance-num">{walletBalance.toLocaleString()}</span>
            <span className="wallet-balance-label">G-Coins</span>
          </div>
          <button type="button" className="wallet-topup-btn" onClick={() => setTopupOpen(true)}>
            + เติมเหรียญ
            {topupPending ? <span className="wallet-pending-badge">รอชำระ 1 รายการ</span> : null}
          </button>
        </div>

        {user ? (
          <>
            <div className="wallet-shard-meta">
              {capLabel ? <span>แชร์แมตช์วันนี้ {capLabel}</span> : null}
              {expiresInDays != null ? <span> · หมดอายุใน {expiresInDays} วัน</span> : null}
            </div>
            <div className="wallet-lifetime-meta">
              เติมสะสม {lifetimeTopup.toLocaleString()} · ใช้ไป {lifetimeSpend.toLocaleString()}
            </div>
          </>
        ) : (
          <div className="wallet-hint">เข้าสู่ระบบเพื่อดู Wallet ของคุณ</div>
        )}
      </div>

      <div className="wallet-ledger-preview">
        <div className="wallet-ledger-head">
          <span>ธุรกรรมล่าสุด ({recent.length} รายการ)</span>
          <button type="button" className="wallet-view-all" onClick={handleViewAll}>ดูทั้งหมด →</button>
        </div>
        {!user ? null : loading || recentLoading ? (
          <div className="wallet-hint">กำลังโหลด…</div>
        ) : recent.length === 0 ? (
          <div className="wallet-hint">ยังไม่มีธุรกรรม — เริ่มจากเหรียญต้อนรับของคุณ ❄</div>
        ) : (
          <ul className="wallet-ledger-list">
            {recent.map((entry) => (
              <li className="wallet-ledger-row" key={entry.id}>
                <span className="wallet-ledger-icon">{entryIcon(entry)}</span>
                <span className="wallet-ledger-desc">{entryLabel(entry)}</span>
                <span className={`wallet-ledger-amount ${entry.amount >= 0 ? "positive" : "negative"}`}>
                  {entry.amount >= 0 ? "+" : ""}
                  {entry.amount.toLocaleString()}
                </span>
                <span className="wallet-ledger-date">{formatDate(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {msg ? <div className="wallet-msg">{msg}</div> : null}

      <TopupModal open={topupOpen} onClose={() => setTopupOpen(false)} onPendingChange={setTopupPending} />
    </div>
  );
}
