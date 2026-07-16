// Voice-tab wrapper (CR-011 §C/§E "Packs" — merges the pack inventory, the
// CR-003 economy Store, the CR-003 owned-items Inventory, and the deep pack
// editor into one nav destination). Four modes behind a top pill row:
//   คลังของฉัน (VoiceInventory, default) · ร้านค้า (StorePage) ·
//   ไอเทม (InventoryTab) · ตัวแก้ไข (AudioSettings editor).
//
// CR011-P5-01 layout choice: InventoryTab is its OWN mode rather than being
// stacked below VoiceInventory inside "คลังของฉัน". VoiceInventory already
// fills the page with an unbounded-height split (pack grid + detail panel,
// styles.css `.voice-split`/`.voice-grid` has no fixed height — it grows with
// however many packs are on disk), while InventoryTab is authored as its own
// fixed-height frame + pager (CR-003 §3.0's no-page-scroll rule — see its
// `styles.grid` `height: 400` in InventoryTab.tsx). Stacking the two would
// either (a) force page-level scroll to see InventoryTab below a tall
// VoiceInventory grid — which the CR-003 components are explicitly built to
// avoid — or (b) require capping VoiceInventory's height, which isn't this
// wave's scope (VoicePacksPage may only be edited additively). A fourth mode
// keeps each surface's own no-scroll contract intact.

import { useState } from "react";
import VoiceInventory from "./VoiceInventory";
import AudioSettings from "./AudioSettings";
import StorePage from "./StorePage";
import InventoryTab from "./InventoryTab";

type Mode = "inventory" | "store" | "items" | "editor";

const MODE_TABS: Array<{ key: Mode; label: string }> = [
  { key: "inventory", label: "คลังของฉัน" },
  { key: "store", label: "ร้านค้า" },
  { key: "items", label: "ไอเทม" },
  { key: "editor", label: "ตัวแก้ไข" },
];

export interface VoicePacksPageProps {
  /** CR011-P5-01: lets StorePage's "เข้าสู่ระบบเพื่อซื้อ" / "Shard ไม่พอ" actions
   *  jump the WHOLE deck to the Account tab (where Wallet/Ledger now live —
   *  see AccountPage.tsx) — CommandDeck is the only place that owns `tab`
   *  state, so this page needs it passed down, same shape as the profile
   *  dropdown's setTab calls. */
  onNavigate?: (tab: string, sub?: string) => void;
}

export default function VoicePacksPage({ onNavigate }: VoicePacksPageProps = {}) {
  const [mode, setMode] = useState<Mode>("inventory");

  return (
    <div className="gm-packs-page">
      <div className="gm-packs-tabs" role="tablist" aria-label="Voice Packs sections">
        {MODE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={mode === t.key}
            className={`gm-packs-tab${mode === t.key ? " active" : ""}`}
            onClick={() => setMode(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="gm-packs-body">
        {mode === "inventory" ? <VoiceInventory onOpenEditor={() => setMode("editor")} /> : null}
        {mode === "store" ? (
          <StorePage
            onNavigateToWallet={() => onNavigate?.("account", "wallet")}
            onRequestSignIn={() => onNavigate?.("account")}
          />
        ) : null}
        {mode === "items" ? <InventoryTab /> : null}
        {mode === "editor" ? <AudioSettings onBack={() => setMode("inventory")} /> : null}
      </div>
    </div>
  );
}
