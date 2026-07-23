// Store (CR-003 §3.3) — catalog grid backed by Supabase `catalog_items`
// (RLS: `public read` for status='active', so this works signed-out too, per
// ADR-14's additive rule). Buying goes through `useWallet().purchase()`,
// which calls the atomic `purchase_item` RPC (§2.4) — this file never touches
// wallet columns directly. No page-level scroll (§3.0): the catalog sits in a
// fixed-height frame and paginates via the pure `rowsThatFit` helper instead
// of a hardcoded row count.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { useWallet } from "./wallet";
import TopupModal from "./TopupModal";

interface CatalogItem {
  id: string;
  sku: string;
  title: string;
  description: string | null;
  currency: "shard" | "wallet";
  price: number;
  bannerUrl: string | null;
}

type CatalogRow = {
  id: string;
  sku: string;
  title: string;
  description: string | null;
  currency: "shard" | "wallet";
  price: number | string;
  banner_url: string | null;
};

function errText(e: unknown): string {
  return (e as { message?: string })?.message ?? String(e);
}

// CR-013 W5-01: CR-003 wallet/store isn't deployed live yet (§5.4 degrade
// ladder) — until then, `catalog_items` doesn't exist and every query fails
// with Postgres' undefined_table (42P01) / PostgREST's "schema cache" wording.
// That's an expected, honest "not live yet" state, not a bug — surface it as
// the store's normal empty-state in friendly Thai instead of the raw
// Supabase/Postgres string. Any OTHER error still surfaces via `msg` below
// (never swallowed).
const CATALOG_UNAVAILABLE_MSG = "ร้านค้ายังไม่เปิดให้บริการ — เร็ว ๆ นี้";

function isTableMissingError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null | undefined;
  if (!err) return false;
  if (err.code === "42P01") return true; // Postgres: undefined_table
  const msg = (err.message ?? "").toLowerCase();
  // CR-013 W5 gate fix (Opus F1): keep "does not exist" scoped to the TABLE/
  // RELATION being absent. A bare `.includes("does not exist")` also matched
  // Postgres 42703 `column ... does not exist` — a real deploy/schema bug —
  // and swallowed it into the friendly "coming soon" state. Column/other
  // "does not exist" errors now fall through to `setMsg` and surface honestly.
  return (
    msg.includes("could not find the table") ||
    msg.includes("schema cache") ||
    ((msg.includes("relation") || msg.includes("table")) && msg.includes("does not exist"))
  );
}

function toCatalogItem(row: CatalogRow): CatalogItem {
  return {
    id: row.id,
    sku: row.sku,
    title: row.title,
    description: row.description,
    currency: row.currency,
    price: typeof row.price === "number" ? row.price : Number(row.price),
    bannerUrl: row.banner_url,
  };
}

// CR-003 §3.0: content that grows (the catalog) paginates within a fixed-height
// frame — the row count is always derived through this pure fn, never a magic
// number assigned straight to "rows per page".
function rowsThatFit(viewportH: number, chromeH: number, rowH: number): number {
  if (rowH <= 0) return 1;
  return Math.max(1, Math.floor((viewportH - chromeH) / rowH));
}

const STORE_COLUMNS = 2;
const STORE_ROW_H = 236; // card height + row gap, used to derive rows-per-page
const STORE_FRAME_DEFAULT_H = 3 * STORE_ROW_H; // pre-measurement fallback fed into rowsThatFit — not a row count itself

// TODO(scope: audio playback wiring — outside StorePage.tsx): a real preview
// should resolve one sample clip for this *catalog* item (before purchase) and
// play it. The existing preview path in AudioSettings.tsx —
// `invoke("preview_announcer_event", { packId, event })` — only works for
// packs already unpacked into voice-cache (i.e. after purchase+install), so it
// can't be reused as-is here. This likely needs either a new Tauri command
// that streams a bundled sample clip by `catalog_items.sku`, or a signed
// Storage URL to a short preview asset alongside `banner_url`. Stubbed.
function previewListen(_item: CatalogItem): string {
  return `ลองฟัง "${_item.title}" — ยังไม่ได้ต่อเสียงตัวอย่าง (TODO: ดู previewListen ใน StorePage.tsx)`;
}

export interface StorePageProps {
  /** Stub navigation hook — no Wallet sub-tab routing exists yet from this
   *  standalone page (AccountPage.tsx doesn't expose Wallet/Inventory/History
   *  sub-tabs per CR-003 §3.1 yet, and CommandDeck.tsx's `tab` state isn't
   *  passed in here). Wire this once that shell lands; falls back to an
   *  inline message so the UI still explains itself. */
  onNavigateToWallet?: () => void;
  /** Stub sign-in hook, same reasoning — AuthPanel/useAuth own the actual
   *  Google sign-in flow (see auth.ts `signInWithGoogle`), but this page has
   *  no prop wired to trigger it from the parent shell yet. */
  onRequestSignIn?: () => void;
}

export default function StorePage({ onNavigateToWallet, onRequestSignIn }: StorePageProps) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { shardBalance, walletBalance, purchase } = useWallet();

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<CatalogItem | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameH, setFrameH] = useState(STORE_FRAME_DEFAULT_H);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("catalog_items")
        .select("id, sku, title, description, currency, price, banner_url")
        .eq("status", "active")
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        if (isTableMissingError(error)) {
          setCatalogUnavailable(true);
        } else {
          setMsg(errText(error));
        }
        setItems([]);
      } else {
        setCatalogUnavailable(false);
        setItems(((data as CatalogRow[] | null) ?? []).map(toCatalogItem));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const loadOwned = useCallback(async () => {
    if (!userId) { setOwnedIds(new Set()); return; }
    const { data } = await supabase.from("inventory").select("item_id").eq("user_id", userId);
    setOwnedIds(new Set(((data as { item_id: string }[] | null) ?? []).map((r) => r.item_id)));
  }, [userId]);

  useEffect(() => { void loadOwned(); }, [loadOwned]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrameH(el.clientHeight || STORE_FRAME_DEFAULT_H);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = rowsThatFit(frameH, 0, STORE_ROW_H);
  const perPage = Math.max(STORE_COLUMNS, rows * STORE_COLUMNS);
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages - 1));
  }, [totalPages]);

  const pageItems = items.slice(page * perPage, page * perPage + perPage);

  function balanceFor(currency: "shard" | "wallet"): number {
    return currency === "shard" ? shardBalance : walletBalance;
  }

  async function confirmPurchase() {
    if (!confirmItem) return;
    setPurchasingId(confirmItem.id);
    setMsg(null);
    try {
      await purchase(confirmItem.id);
      setOwnedIds((prev) => new Set(prev).add(confirmItem.id));
      setMsg(`ซื้อ "${confirmItem.title}" สำเร็จ — เพิ่มเข้า Inventory แล้ว`);
      setConfirmItem(null);
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setPurchasingId(null);
    }
  }

  function renderAction(item: CatalogItem) {
    if (!user) {
      return (
        <button
          type="button"
          className="store-buy-btn signin"
          onClick={() => (onRequestSignIn ? onRequestSignIn() : setMsg("เข้าสู่ระบบเพื่อซื้อ — ไปที่แท็บ Account & Steam"))}
        >
          เข้าสู่ระบบเพื่อซื้อ
        </button>
      );
    }
    if (ownedIds.has(item.id)) {
      return <span className="store-owned-badge">✓ เป็นเจ้าของ</span>;
    }
    const have = balanceFor(item.currency);
    const icon = item.currency === "shard" ? "💎" : "🪙";
    if (have < item.price) {
      if (item.currency === "wallet") {
        return (
          <div className="store-insufficient">
            <span className="store-buy-btn insufficient" aria-disabled="true">เหรียญไม่พอ</span>
            <button type="button" className="store-link-btn" onClick={() => setTopupOpen(true)}>เติมเลย</button>
          </div>
        );
      }
      return (
        <div className="store-insufficient">
          <span className="store-buy-btn insufficient" aria-disabled="true">Shard ไม่พอ</span>
          <button
            type="button"
            className="store-link-btn"
            onClick={() => (onNavigateToWallet ? onNavigateToWallet() : setMsg("แชร์แมตช์เพื่อได้ Shard เพิ่ม — ไปที่แท็บ Wallet"))}
          >
            แชร์แมตช์เพื่อได้ Shard เพิ่ม
          </button>
        </div>
      );
    }
    return (
      <button
        type="button"
        className="store-buy-btn"
        disabled={purchasingId === item.id}
        onClick={() => setConfirmItem(item)}
      >
        {purchasingId === item.id ? "กำลังซื้อ…" : `ซื้อ ${icon}${item.price.toLocaleString()}`}
      </button>
    );
  }

  return (
    <div className="store-page">
      <h2 className="store-title">ร้านค้า</h2>
      <p className="store-lead">
        Announcer packs อย่างเป็นทางการ — ซื้อครั้งเดียว ใช้ได้ตลอด ติดตั้งเข้า Voice Packs ทันที
      </p>

      <div className="store-frame" ref={frameRef}>
        {loading ? (
          <div className="store-hint">กำลังโหลดร้านค้า…</div>
        ) : catalogUnavailable ? (
          <div className="store-hint">{CATALOG_UNAVAILABLE_MSG}</div>
        ) : pageItems.length === 0 ? (
          <div className="store-hint">ยังไม่มีสินค้าในร้านค้าตอนนี้</div>
        ) : (
          <div className="store-grid" style={{ gridTemplateColumns: `repeat(${STORE_COLUMNS}, 1fr)` }}>
            {pageItems.map((item) => (
              <div className="store-card" key={item.id}>
                {item.currency === "shard" ? (
                  <span className="store-card-badge">💎 แลกด้วย Shard เท่านั้น</span>
                ) : null}
                <div
                  className="store-card-banner"
                  style={item.bannerUrl ? { backgroundImage: `url(${item.bannerUrl})` } : undefined}
                />
                <div className="store-card-body">
                  <div className="store-card-title">{item.title}</div>
                  {item.description ? <div className="store-card-desc">{item.description}</div> : null}
                </div>
                <div className="store-card-footer">
                  <button type="button" className="store-preview-btn" onClick={() => setMsg(previewListen(item))}>
                    ▶ ลองฟัง
                  </button>
                  {renderAction(item)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="store-pager">
        <button type="button" className="store-pager-btn" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
          ‹ ก่อนหน้า
        </button>
        <span className="store-pager-label">หน้า {page + 1} / {totalPages}</span>
        <button
          type="button"
          className="store-pager-btn"
          disabled={page >= totalPages - 1}
          onClick={() => setPage((p) => p + 1)}
        >
          ถัดไป ›
        </button>
      </div>

      {msg ? <div className="store-msg">{msg}</div> : null}

      {confirmItem ? (
        <div className="store-confirm-overlay" onClick={() => setConfirmItem(null)}>
          <div className="store-confirm-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="store-confirm-title">
              หัก {confirmItem.price.toLocaleString()} {confirmItem.currency === "shard" ? "Shard" : "เหรียญ"} — ยืนยัน?
            </div>
            <div className="store-confirm-item">{confirmItem.title}</div>
            <div className="store-confirm-actions">
              <button type="button" className="store-confirm-cancel" onClick={() => setConfirmItem(null)}>ยกเลิก</button>
              <button
                type="button"
                className="store-confirm-ok"
                disabled={purchasingId === confirmItem.id}
                onClick={() => void confirmPurchase()}
              >
                {purchasingId === confirmItem.id ? "กำลังซื้อ…" : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <TopupModal open={topupOpen} onClose={() => setTopupOpen(false)} />
    </div>
  );
}
