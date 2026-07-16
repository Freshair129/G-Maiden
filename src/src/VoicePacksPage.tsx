// Voice-tab wrapper (CR-011 §C/§E "Packs" — merges the pack inventory, the
// CR-003 owned-items Inventory, and the deep pack editor into one nav
// destination). Three modes behind a top pill row:
//   คลังของฉัน (VoiceInventory, default) · ไอเทม (InventoryTab) ·
//   ตัวแก้ไข (AudioSettings editor).
//
// CR-013 W4-01 (§3.1/§5.3): the economy Store used to be a FOURTH mode here
// (an embedded <StorePage>), duplicating the page that now has its own nav
// seat (`tab === "store"` in CommandDeck.tsx, with the full ร้านค้า/กระเป๋า/
// คลัง/บันทึก tab set — §5.1). That embedded copy is gone; "หาแพ็กเพิ่ม →"
// below is a pure cross-link that switches the WHOLE deck to the Store nav
// tab via `onNavigate`, per CR-013 §3.1's "เหตุผลแยก Voice/Store" — Voice is
// what you *have* (local-first, works offline), Store is a *transaction*
// (Supabase, needs sign-in), so Voice never re-hosts Store's own UI.
//
// CR011-P5-01 layout choice (unchanged): InventoryTab is its OWN mode rather
// than being stacked below VoiceInventory inside "คลังของฉัน". VoiceInventory
// already fills the page with an unbounded-height split (pack grid + detail
// panel, styles.css `.voice-split`/`.voice-grid` has no fixed height — it
// grows with however many packs are on disk), while InventoryTab is authored
// as its own fixed-height frame + pager (CR-003 §3.0's no-page-scroll rule —
// see its `styles.grid` `height: 400` in InventoryTab.tsx). Stacking the two
// would either (a) force page-level scroll to see InventoryTab below a tall
// VoiceInventory grid — which the CR-003 components are explicitly built to
// avoid — or (b) require capping VoiceInventory's height, which isn't this
// wave's scope (VoicePacksPage may only be edited additively). A separate
// mode keeps each surface's own no-scroll contract intact.

import { useState } from "react";
import VoiceInventory from "./VoiceInventory";
import AudioSettings from "./AudioSettings";
import InventoryTab from "./InventoryTab";

type Mode = "inventory" | "items" | "editor";

const MODE_TABS: Array<{ key: Mode; label: string }> = [
  { key: "inventory", label: "คลังของฉัน" },
  { key: "items", label: "ไอเทม" },
  { key: "editor", label: "ตัวแก้ไข" },
];

export interface VoicePacksPageProps {
  /** CR011-P5-01 (re-scoped CR-013 W4-01): lets this page jump the WHOLE deck
   *  to another nav tab — used for the "หาแพ็กเพิ่ม →" cross-link to G-Store
   *  (was previously also used to send StorePage's sign-in/insufficient-funds
   *  actions to Account; that embedded StorePage copy is gone, see above).
   *  CommandDeck is the only place that owns `tab` state, so this page needs
   *  it passed down, same shape as the profile dropdown's setTab calls. */
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
        <button
          type="button"
          className="gm-packs-tab gm-packs-tab-link"
          onClick={() => onNavigate?.("store")}
        >
          หาแพ็กเพิ่ม →
        </button>
      </div>

      <div className="gm-packs-body">
        {mode === "inventory" ? <VoiceInventory onOpenEditor={() => setMode("editor")} /> : null}
        {mode === "items" ? <InventoryTab /> : null}
        {mode === "editor" ? <AudioSettings onBack={() => setMode("inventory")} /> : null}
      </div>
    </div>
  );
}
