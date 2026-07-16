// CR-003 §3.4 — Inventory tab. Grid of items the signed-in GID owns
// (`inventory` joined to `catalog_items`, RLS scopes the rows to the caller —
// see the "own read" policy on `inventory` in the CR-003 migration). A top
// row lets the player redeem a code via `useWallet().redeem()`; a successful
// redeem drops the newly granted item into the grid with a brief highlight.
//
// Install/activate reuses the EXACT pipeline the rest of the app already
// ships (see src-tauri/src/gsi.rs `run_announcer_install` +
// src-tauri/src/voice_api.rs, and the frontend precedent in
// AudioSettings.tsx / VoiceInventory.tsx):
//   ติดตั้ง  -> pack-download Edge Fn (signed URL) -> download bytes
//            -> voice_api_import_archive (extracts on disk — the local
//               :3000 endpoint below never writes files itself)
//            -> POST http://127.0.0.1:3000/announcer/install
//               body {"packId": ..., "activate": true} (parse_install_request
//               in gsi.rs accepts exactly this shape)
//   ใช้งาน   -> invoke("voice_api_action", { action: "activate", packId })
//               (same call AudioSettings.tsx / VoiceInventory.tsx use to equip)
//   ✓ กำลังใช้งาน -> voiceState.activePackId === item.packId

import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { useWallet } from "./wallet";
import type { VoiceState } from "./voice-types";

type ItemSource = "purchase" | "grant" | "redeem" | "starter";

type CatalogItem = {
  id: string;
  sku: string;
  title: string;
  description: string | null;
  bannerUrl: string | null;
  packId: string | null;
  currency: "shard" | "wallet";
  price: number;
  itemType: string;
};

type InventoryRow = {
  id: string;
  source: ItemSource;
  refId: string | null;
  acquiredAt: string;
  item: CatalogItem;
};

// Raw shape returned by the Supabase embedded-resource select below —
// snake_case straight off the `inventory`/`catalog_items` tables.
type RawInventoryRow = {
  id: string;
  source: ItemSource;
  ref_id: string | null;
  acquired_at: string;
  catalog_items: {
    id: string;
    sku: string;
    title: string;
    description: string | null;
    banner_url: string | null;
    pack_id: string | null;
    currency: "shard" | "wallet";
    price: number;
    item_type: string;
  } | null;
};

const SOURCE_LABEL: Record<ItemSource, string> = {
  purchase: "ซื้อ",
  grant: "ของขวัญ",
  redeem: "แลกโค้ด",
  starter: "starter",
};

const PAGE_SIZE = 8;

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

type LocalStatus = "unsupported" | "not-installed" | "installed" | "active";

function localStatus(item: CatalogItem, voiceState: VoiceState | null): LocalStatus {
  if (item.itemType !== "announcer_pack" || !item.packId) return "unsupported";
  if (!voiceState) return "not-installed";
  if (voiceState.activePackId === item.packId) return "active";
  if (voiceState.packs.some((p) => p.id === item.packId)) return "installed";
  return "not-installed";
}

async function loadInventory(userId: string): Promise<InventoryRow[]> {
  const { data, error } = await supabase
    .from("inventory")
    .select(
      "id, source, ref_id, acquired_at, catalog_items:item_id ( id, sku, title, description, banner_url, pack_id, currency, price, item_type )"
    )
    .eq("user_id", userId)
    .order("acquired_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as RawInventoryRow[];
  return rows
    .filter((row): row is RawInventoryRow & { catalog_items: NonNullable<RawInventoryRow["catalog_items"]> } => !!row.catalog_items)
    .map((row) => ({
      id: row.id,
      source: row.source,
      refId: row.ref_id,
      acquiredAt: row.acquired_at,
      item: {
        id: row.catalog_items.id,
        sku: row.catalog_items.sku,
        title: row.catalog_items.title,
        description: row.catalog_items.description,
        bannerUrl: row.catalog_items.banner_url,
        packId: row.catalog_items.pack_id,
        currency: row.catalog_items.currency,
        price: row.catalog_items.price,
        itemType: row.catalog_items.item_type,
      },
    }));
}

export default function InventoryTab() {
  const { user } = useAuth();
  const { redeem } = useWallet();

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [voiceState, setVoiceState] = useState<VoiceState | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<string | null>(null);
  const [redeemErr, setRedeemErr] = useState<string | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  const [page, setPage] = useState(0);

  const refreshVoiceState = useCallback(async () => {
    try {
      const next = await invoke<VoiceState>("voice_api_state");
      if (next && typeof next === "object" && Array.isArray(next.packs)) setVoiceState(next);
    } catch {
      // Not under Tauri, or the local backend isn't up yet — install/activate
      // status just stays conservative ("not installed") until it answers.
    }
  }, []);

  const refreshInventory = useCallback(
    async (highlightNew: boolean) => {
      if (!user) {
        setRows([]);
        return;
      }
      setLoading(true);
      setLoadErr(null);
      try {
        const prevIds = new Set(rows.map((r) => r.item.id));
        const next = await loadInventory(user.id);
        if (highlightNew) {
          const added = new Set(next.filter((r) => !prevIds.has(r.item.id)).map((r) => r.item.id));
          if (added.size > 0) {
            setNewIds(added);
            setPage(0);
            setTimeout(() => setNewIds(new Set()), 2200);
          }
        }
        setRows(next);
      } catch (e) {
        setLoadErr(errMessage(e));
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id]
  );

  useEffect(() => {
    void refreshInventory(false);
    void refreshVoiceState();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onRedeem() {
    const trimmed = code.trim();
    if (!trimmed || redeeming) return;
    setRedeeming(true);
    setRedeemErr(null);
    setRedeemMsg(null);
    try {
      await redeem(trimmed);
      setCode("");
      setRedeemMsg("แลกโค้ดสำเร็จ! ไอเทมใหม่มาแล้ว");
      await refreshInventory(true);
    } catch (e) {
      setRedeemErr(errMessage(e));
    } finally {
      setRedeeming(false);
    }
  }

  async function installItem(item: CatalogItem) {
    if (!item.packId) return;
    setInstallingId(item.id);
    setRowError((r) => ({ ...r, [item.id]: "" }));
    try {
      const { data, error } = await supabase.functions.invoke<{
        url?: string;
        signedUrl?: string;
        downloadUrl?: string;
      }>("pack-download", { body: { item_id: item.id } });
      if (error) throw error;
      const url = data?.url || data?.signedUrl || data?.downloadUrl;
      if (!url) throw new Error("pack-download ไม่คืน URL สำหรับดาวน์โหลด");

      const res = await fetch(url);
      if (!res.ok) throw new Error(`ดาวน์โหลดล้มเหลว (${res.status})`);
      const bytes = Array.from(new Uint8Array(await res.arrayBuffer()));

      // Land the bundle on disk first — /announcer/install (below) never
      // writes files; it only activates + reports on a pack that's already
      // under voice-cache/packs/<id>/ (src-tauri/src/gsi.rs). This is the
      // same in-process zip extraction AudioSettings.tsx / VoiceInventory.tsx
      // use for drag-and-drop imports.
      await invoke("voice_api_import_archive", { name: `${item.packId}.zip`, bytes });

      // Now hit the real install endpoint — same pipeline G-AnnStudio uses,
      // same body shape `parse_install_request` expects.
      const resp = await fetch("http://127.0.0.1:3000/announcer/install", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: item.packId, activate: true }),
      });
      const json = (await resp.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!json.ok) throw new Error(json.error || "ติดตั้ง pack ไม่สำเร็จ");

      await refreshVoiceState();
    } catch (e) {
      setRowError((r) => ({ ...r, [item.id]: errMessage(e) }));
    } finally {
      setInstallingId(null);
    }
  }

  async function activateItem(item: CatalogItem) {
    if (!item.packId) return;
    setActivatingId(item.id);
    setRowError((r) => ({ ...r, [item.id]: "" }));
    try {
      const next = await invoke<VoiceState>("voice_api_action", { action: "activate", packId: item.packId });
      setVoiceState(next);
    } catch (e) {
      setRowError((r) => ({ ...r, [item.id]: errMessage(e) }));
    } finally {
      setActivatingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="wallet-inv-tab" style={styles.wrap}>
      <style>{cssBlock}</style>

      <div className="wallet-inv-redeem" style={styles.redeemRow}>
        <input
          className="wallet-inv-input"
          style={styles.input}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void onRedeem()}
          placeholder="กรอกโค้ดแลกไอเทม"
          spellCheck={false}
          disabled={!user}
        />
        <button
          type="button"
          className="wallet-inv-btn primary"
          style={{ ...styles.btn, ...styles.btnPrimary }}
          onClick={() => void onRedeem()}
          disabled={!user || redeeming || !code.trim()}
        >
          {redeeming ? "กำลังแลก…" : "แลกโค้ด"}
        </button>
        {redeemMsg ? <span style={styles.redeemOk}>{redeemMsg}</span> : null}
        {redeemErr ? <span style={styles.redeemErr}>{redeemErr}</span> : null}
      </div>

      {!user ? (
        <div style={styles.empty}>เข้าสู่ระบบเพื่อดูคลังไอเทมของคุณ</div>
      ) : loading && rows.length === 0 ? (
        <div style={styles.empty}>กำลังโหลดคลังไอเทม…</div>
      ) : loadErr ? (
        <div style={styles.emptyErr}>{loadErr}</div>
      ) : rows.length === 0 ? (
        <div style={styles.empty}>ยังไม่มีไอเทมในคลัง — ไปที่ร้านค้าเพื่อเลือกแพ็คแรกของคุณ</div>
      ) : (
        <>
          <div className="wallet-inv-grid" style={styles.grid}>
            {pageRows.map((row) => {
              const status = localStatus(row.item, voiceState);
              const busyInstall = installingId === row.item.id;
              const busyActivate = activatingId === row.item.id;
              const err = rowError[row.item.id];
              const isNew = newIds.has(row.item.id);
              return (
                <div
                  key={row.id}
                  className={"wallet-inv-card" + (isNew ? " is-new" : "")}
                  style={styles.card}
                >
                  <div style={styles.banner}>
                    {row.item.bannerUrl ? (
                      <img src={row.item.bannerUrl} alt={row.item.title} style={styles.bannerImg} />
                    ) : (
                      <div style={styles.bannerPlaceholder}>{row.item.title}</div>
                    )}
                    <span style={styles.sourceBadge}>{SOURCE_LABEL[row.source]}</span>
                  </div>
                  <div style={styles.cardBody}>
                    <div style={styles.cardTitle}>{row.item.title}</div>
                    <div style={styles.cardMeta}>ได้มาเมื่อ {formatDate(row.acquiredAt)}</div>
                    {status === "unsupported" ? (
                      <div style={styles.cardMeta}>ไอเทมประเภทนี้ยังไม่รองรับการติดตั้งอัตโนมัติ</div>
                    ) : status === "active" ? (
                      <button type="button" disabled style={{ ...styles.btn, ...styles.btnActive }}>
                        ✓ กำลังใช้งาน
                      </button>
                    ) : status === "installed" ? (
                      <button
                        type="button"
                        style={{ ...styles.btn, ...styles.btnPrimary }}
                        disabled={busyActivate}
                        onClick={() => void activateItem(row.item)}
                      >
                        {busyActivate ? "กำลังเปิดใช้งาน…" : "ใช้งาน"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={{ ...styles.btn, ...styles.btnPrimary }}
                        disabled={busyInstall}
                        onClick={() => void installItem(row.item)}
                      >
                        {busyInstall ? "กำลังติดตั้ง…" : "ติดตั้ง"}
                      </button>
                    )}
                    {err ? <div style={styles.cardErr}>{err}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 ? (
            <div style={styles.pager}>
              <button
                type="button"
                style={{ ...styles.btn, ...styles.btnGhost }}
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← ก่อนหน้า
              </button>
              <span style={styles.pagerLabel}>
                หน้า {page + 1}/{totalPages}
              </span>
              <button
                type="button"
                style={{ ...styles.btn, ...styles.btnGhost }}
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                ถัดไป →
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// Fixed-height frame + page-forward pagination, never page-level scroll
// (CR-003 §3.0 hard constraint). 2 rows x 4 cards covers PAGE_SIZE=8.
const styles: Record<string, React.CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", gap: 14, height: "100%", minHeight: 0 },
  redeemRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
  input: {
    flex: "0 1 320px",
    background: "var(--g-instrument)",
    border: "1px solid var(--g-hairline-2)",
    borderRadius: 10,
    color: "var(--g-text)",
    padding: "9px 12px",
    fontSize: 13,
  },
  btn: {
    borderRadius: 10,
    fontSize: 12.5,
    border: "1px solid var(--g-hairline-2)",
    background: "var(--g-instrument-2)",
    color: "var(--g-text)",
    padding: "9px 14px",
    cursor: "pointer",
  },
  btnPrimary: { borderColor: "var(--g-ice-600)", color: "var(--g-ice-300)" },
  btnGhost: { background: "transparent" },
  btnActive: { borderColor: "var(--g-ok)", color: "var(--g-ok)", cursor: "default", opacity: 0.9 },
  redeemOk: { color: "var(--g-ok)", fontSize: 12.5 },
  redeemErr: { color: "var(--g-danger)", fontSize: 12.5 },
  empty: { color: "var(--g-text-dim)", padding: "24px 4px", fontSize: 13 },
  emptyErr: { color: "var(--g-danger)", padding: "24px 4px", fontSize: 13 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gridAutoRows: "192px",
    gap: 12,
    height: 400,
    overflow: "hidden",
  },
  card: {
    background: "var(--g-instrument)",
    border: "1px solid var(--g-hairline)",
    borderRadius: 14,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  banner: { position: "relative", height: 92, background: "var(--g-instrument-2)" },
  bannerImg: { width: "100%", height: "100%", objectFit: "cover" },
  bannerPlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "0 8px",
    fontSize: 12,
    fontWeight: 700,
    color: "var(--g-ice-300)",
    background:
      "linear-gradient(135deg, color-mix(in srgb, var(--g-ice-600) 22%, transparent), var(--g-instrument-2) 65%, var(--g-void) 100%)",
  },
  sourceBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    fontSize: 9.5,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    background: "color-mix(in srgb, var(--g-void) 78%, transparent)",
    border: "1px solid var(--g-hairline-2)",
    borderRadius: 999,
    padding: "2px 7px",
    color: "var(--g-text-dim)",
  },
  cardBody: { padding: 10, display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0 },
  cardTitle: { fontSize: 12.5, fontWeight: 700, color: "var(--g-text)", lineHeight: 1.2 },
  cardMeta: { fontSize: 10.5, color: "var(--g-text-dim)" },
  cardErr: { fontSize: 10, color: "var(--g-danger)" },
  pager: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12 },
  pagerLabel: { fontSize: 12, color: "var(--g-text-dim)" },
};

const cssBlock = `
@keyframes walletInvPop {
  0% { transform: scale(.92); box-shadow: 0 0 0 0 color-mix(in srgb, var(--g-ice-600) 50%, transparent); }
  60% { transform: scale(1.015); box-shadow: 0 0 0 6px color-mix(in srgb, var(--g-ice-600) 12%, transparent); }
  100% { transform: scale(1); box-shadow: 0 0 0 0 transparent; }
}
.wallet-inv-card.is-new { animation: walletInvPop 900ms ease-out; border-color: var(--g-ice-600) !important; }
.wallet-inv-input:focus { outline: none; border-color: var(--g-ice-600) !important; }
`;
