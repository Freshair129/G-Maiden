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
// Each mode owns the remaining canvas height; the voice catalog paginates
// independently of the economy inventory and the editor sections.

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
