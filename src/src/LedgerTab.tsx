// CR-003 §3.5 — History / Ledger tab. Reads `wallet_ledger` (source of truth,
// D4) via `useWallet().ledger()`. No page-level scroll (CR-003 §3.0 hard
// constraint): a fixed-height frame shows one page of rows at a time with
// page-forward/back controls, instead of an ever-growing scrollable list.

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth";
import { useWallet, type LedgerEntry } from "./wallet";

type FilterKey = "all" | "topup" | "purchase" | "grant" | "earn_share" | "tip";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "topup", label: "เติมเหรียญ" },
  { key: "purchase", label: "ซื้อ" },
  { key: "grant", label: "รับฟรี" },
  { key: "earn_share", label: "แชร์แมตช์" },
  { key: "tip", label: "ทิป" },
];

function matchesFilter(entry: LedgerEntry, filter: FilterKey): boolean {
  switch (filter) {
    case "all":
      return true;
    case "topup":
      return entry.entryType === "topup";
    case "purchase":
      return entry.entryType === "purchase";
    case "grant":
      return entry.entryType === "grant" || entry.entryType === "redeem";
    case "earn_share":
      return entry.entryType === "earn_share";
    case "tip":
      return entry.entryType === "tip_sent" || entry.entryType === "tip_received";
    default:
      return true;
  }
}

const ENTRY_ICON: Record<string, string> = {
  topup: "⬆",
  purchase: "🛒",
  refund: "↩",
  grant: "🎁",
  redeem: "🎟",
  adjust: "⚙",
  earn_share: "💎",
  tip_sent: "💌",
  tip_received: "💌",
};

const ENTRY_LABEL: Record<string, string> = {
  topup: "เติมเหรียญ",
  purchase: "ซื้อไอเทม",
  refund: "คืนเงิน",
  grant: "ได้รับของขวัญ",
  redeem: "แลกโค้ด",
  adjust: "ปรับยอดโดยแอดมิน",
  earn_share: "แชร์แมตช์ (verified)",
  tip_sent: "ส่งทิป",
  tip_received: "รับทิป",
};

const CURRENCY_ICON: Record<LedgerEntry["currency"], string> = { shard: "💎", wallet: "🪙" };

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const PAGE_SIZE = 20;

export default function LedgerTab() {
  const { user } = useAuth();
  const { ledger } = useWallet();

  const [filter, setFilter] = useState<FilterKey>("all");
  const [rows, setRows] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // cursorStack[i] = the `before` cursor used to fetch page i. Page 0 always
  // fetches with `before: undefined`.
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [receipt, setReceipt] = useState<LedgerEntry | null>(null);

  const loadPage = useCallback(
    async (before: string | undefined) => {
      setLoading(true);
      setErr(null);
      try {
        // NOTE: `ledger()` (src/src/wallet.ts) only accepts a `currency`
        // filter server-side, not `entryType` — the filter chips below are
        // applied client-side over whatever page came back. That means a
        // narrow chip (e.g. "ทิป") can render fewer than PAGE_SIZE rows even
        // though more matching rows exist further back; a server-side
        // entry_type filter would remove this caveat. Deferred for phase 1.
        const next = await ledger({ limit: PAGE_SIZE, before });
        setRows(next);
        setHasMore(next.length === PAGE_SIZE);
      } catch (e) {
        setErr(errMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [ledger]
  );

  useEffect(() => {
    if (!user) {
      setRows([]);
      return;
    }
    setCursorStack([undefined]);
    setPageIndex(0);
    void loadPage(undefined);
    // Deliberately `[user?.id]` only, NOT `[user, loadPage]`: this must reset
    // to page 0 exactly on THIS component's own account transition. `loadPage`
    // comes from `useWallet().ledger` (deps `[user?.id]` inside wallet.ts),
    // but that's a SEPARATE `useAuth()` instance (its own listener) from the
    // `user` used here — the two settle in independent renders, so keying off
    // `loadPage`'s identity risks an extra desynced reset+refetch instead of
    // exactly one per real sign-in/out here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function goNext() {
    if (!hasMore || rows.length === 0) return;
    const cursor = rows[rows.length - 1].createdAt;
    setCursorStack((stack) => [...stack.slice(0, pageIndex + 1), cursor]);
    setPageIndex((i) => i + 1);
    void loadPage(cursor);
  }

  function goPrev() {
    if (pageIndex === 0) return;
    const prevIndex = pageIndex - 1;
    setPageIndex(prevIndex);
    void loadPage(cursorStack[prevIndex]);
  }

  const visibleRows = rows.filter((r) => matchesFilter(r, filter));
  const isFirstPageEmpty = pageIndex === 0 && rows.length === 0 && !loading;

  return (
    <div className="wallet-ledger-tab" style={styles.wrap}>
      <div style={styles.chipRow}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            style={{ ...styles.chip, ...(filter === f.key ? styles.chipActive : null) }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {!user ? (
        <div style={styles.empty}>เข้าสู่ระบบเพื่อดูประวัติธุรกรรมของคุณ</div>
      ) : (
        <div style={styles.frame}>
          {loading && rows.length === 0 ? (
            <div style={styles.empty}>กำลังโหลดประวัติธุรกรรม…</div>
          ) : err ? (
            <div style={styles.emptyErr}>{err}</div>
          ) : isFirstPageEmpty ? (
            <div style={styles.empty}>ยังไม่มีธุรกรรม — เริ่มจากเหรียญต้อนรับของคุณ ❄</div>
          ) : visibleRows.length === 0 ? (
            <div style={styles.empty}>ไม่มีรายการประเภทนี้ในหน้านี้ — ลองหน้าอื่นหรือเลือก &quot;ทั้งหมด&quot;</div>
          ) : (
            <div style={styles.list}>
              {visibleRows.map((entry) => {
                const positive = entry.amount > 0;
                const clickable = entry.refType === "topup_order";
                return (
                  <button
                    type="button"
                    key={entry.id}
                    onClick={() => clickable && setReceipt(entry)}
                    style={{
                      ...styles.row,
                      cursor: clickable ? "pointer" : "default",
                    }}
                  >
                    <span style={styles.rowIcon}>{ENTRY_ICON[entry.entryType] || "•"}</span>
                    <span style={styles.rowDesc}>
                      {ENTRY_LABEL[entry.entryType] || entry.entryType}
                      {entry.note ? <span style={styles.rowNote}> — {entry.note}</span> : null}
                    </span>
                    <span style={{ ...styles.rowAmount, color: positive ? "var(--g-ok)" : "var(--g-danger)" }}>
                      {positive ? "+" : ""}
                      {entry.amount.toLocaleString()} {CURRENCY_ICON[entry.currency]}
                    </span>
                    <span style={styles.rowBalance}>คงเหลือ {entry.balanceAfter.toLocaleString()}</span>
                    <span style={styles.rowWhen}>{formatWhen(entry.createdAt)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {user ? (
        <div style={styles.pager}>
          <button type="button" style={styles.pagerBtn} disabled={pageIndex === 0 || loading} onClick={goPrev}>
            ← ก่อนหน้า
          </button>
          <span style={styles.pagerLabel}>หน้า {pageIndex + 1}</span>
          <button type="button" style={styles.pagerBtn} disabled={!hasMore || loading} onClick={goNext}>
            ถัดไป →
          </button>
        </div>
      ) : null}

      {receipt ? (
        <div style={styles.overlay} onClick={() => setReceipt(null)}>
          <div style={styles.receipt} onClick={(e) => e.stopPropagation()}>
            <div style={styles.receiptTitle}>ใบเสร็จอย่างง่าย</div>
            <div style={styles.receiptRow}>
              <span>เลขที่ order</span>
              <code>{receipt.refId || "—"}</code>
            </div>
            <div style={styles.receiptRow}>
              <span>ช่องทาง</span>
              {/* Best-effort: `note` on the ledger entry is what the credit
                  function stamped at write time. A full receipt would join
                  back to `topup_orders` for `provider`/`provider_charge_id`,
                  but RLS + this contract only exposes the ledger row itself
                  here, so a full order lookup is deferred to a later pass. */}
              <span>{receipt.note || "ไม่ระบุ"}</span>
            </div>
            <div style={styles.receiptRow}>
              <span>ยอด</span>
              <span>
                {receipt.amount > 0 ? "+" : ""}
                {receipt.amount.toLocaleString()} {CURRENCY_ICON[receipt.currency]}
              </span>
            </div>
            <div style={styles.receiptRow}>
              <span>คงเหลือหลังรายการ</span>
              <span>{receipt.balanceAfter.toLocaleString()}</span>
            </div>
            <div style={styles.receiptRow}>
              <span>เวลา</span>
              <span>{formatWhen(receipt.createdAt)}</span>
            </div>
            <button
              type="button"
              style={styles.receiptCopy}
              onClick={() => {
                if (receipt.refId) navigator.clipboard?.writeText(receipt.refId).catch(() => {});
              }}
              disabled={!receipt.refId}
            >
              คัดลอกเลขที่ order
            </button>
            <button type="button" style={styles.receiptClose} onClick={() => setReceipt(null)}>
              ปิด
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 },
  chipRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: {
    borderRadius: 999,
    fontSize: 11.5,
    border: "1px solid var(--g-hairline-2)",
    background: "var(--g-instrument-2)",
    color: "var(--g-text-dim)",
    padding: "6px 12px",
    cursor: "pointer",
  },
  // Active fill must differ from the base chip's (both mapped to instrument-2
  // during the token migration, collapsing the active state — Opus gate, CR011-P5).
  chipActive: { borderColor: "var(--g-ice-600)", color: "var(--g-ice-300)", background: "color-mix(in srgb, var(--g-ice-600) 10%, var(--g-instrument-2))" },
  // Fixed-height frame — this is the load-bearing part of the no-page-scroll
  // rule: content never grows the page, pagination replaces what's shown.
  frame: { height: 400, overflow: "hidden", display: "flex", flexDirection: "column" },
  list: { display: "flex", flexDirection: "column", gap: 6, overflow: "hidden" },
  row: {
    display: "grid",
    gridTemplateColumns: "22px minmax(0, 1.6fr) 110px 130px 120px",
    alignItems: "center",
    gap: 10,
    background: "var(--g-instrument)",
    border: "1px solid var(--g-hairline)",
    borderRadius: 10,
    padding: "9px 12px",
    textAlign: "left",
    color: "var(--g-text)",
    font: "inherit",
  },
  rowIcon: { fontSize: 14, textAlign: "center" },
  rowDesc: { fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  rowNote: { color: "var(--g-text-dim)" },
  rowAmount: { fontSize: 12.5, fontWeight: 700, textAlign: "right" },
  rowBalance: { fontSize: 11, color: "var(--g-text-dim)", textAlign: "right" },
  rowWhen: { fontSize: 11, color: "var(--g-text-dim)", textAlign: "right" },
  empty: { color: "var(--g-text-dim)", padding: "24px 4px", fontSize: 13 },
  emptyErr: { color: "var(--g-danger)", padding: "24px 4px", fontSize: 13 },
  pager: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12 },
  pagerBtn: {
    borderRadius: 10,
    fontSize: 12.5,
    border: "1px solid var(--g-hairline-2)",
    background: "transparent",
    color: "var(--g-text)",
    padding: "8px 14px",
    cursor: "pointer",
  },
  pagerLabel: { fontSize: 12, color: "var(--g-text-dim)" },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "color-mix(in srgb, var(--g-void) 60%, transparent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  receipt: {
    width: 320,
    background: "var(--g-instrument)",
    border: "1px solid var(--g-hairline)",
    borderRadius: 14,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  receiptTitle: { fontSize: 13, fontWeight: 700, color: "var(--g-ice-300)", textTransform: "uppercase", letterSpacing: 0.4 },
  receiptRow: { display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--g-text)", gap: 10 },
  receiptCopy: {
    marginTop: 6,
    borderRadius: 10,
    fontSize: 12,
    border: "1px solid var(--g-ice-600)",
    background: "var(--g-instrument-2)",
    color: "var(--g-ice-300)",
    padding: "8px 12px",
    cursor: "pointer",
  },
  receiptClose: {
    borderRadius: 10,
    fontSize: 12,
    border: "1px solid var(--g-hairline-2)",
    background: "transparent",
    color: "var(--g-text-dim)",
    padding: "8px 12px",
    cursor: "pointer",
  },
};
