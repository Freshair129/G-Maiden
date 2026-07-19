import { useEffect, useRef } from "react";
import type { ShortcutDef } from "../shortcuts";
import { GLOBAL_HOTKEYS } from "./prefs";

/** CR-011 §L: the shortcut sheet, generated FROM the shortcuts.ts registry
 *  (single source, no hand-copied list) plus the Rust-owned GLOBAL_HOTKEYS
 *  table above. Same console-glass material as Maiden Line; Esc closes it via
 *  CommandDeck's global keydown listener (registry's "close-overlay" entry —
 *  this component has no input to steal Escape, unlike MaidenLine). */
export function ShortcutSheet({ open, onClose, registry }: { open: boolean; onClose: () => void; registry: ShortcutDef[] }) {
  // Take focus on open: an aria-modal dialog that never receives focus leaves
  // keyboard/screen-reader users interacting with a background the a11y tree
  // claims is inert (Opus gate, CR011-P4a). Full focus trap = later polish.
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) sheetRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="gm-sheet-backdrop" onClick={onClose}>
      <div ref={sheetRef} tabIndex={-1} className="gm-sheet" role="dialog" aria-modal="true" aria-label="Shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="gm-sheet-head">
          <span>คีย์ลัด (Shortcuts)</span>
          <button type="button" className="gm-sheet-close" onClick={onClose} aria-label="ปิด">×</button>
        </div>
        <div>
          <div className="gm-sheet-section-label">In-app</div>
          {registry.map((def) => (
            <div key={def.id} className="gm-sheet-row">
              <span>{def.labelTh}</span>
              <span className="gm-sheet-row-combo">{def.combo}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="gm-sheet-section-label">Global (ทำงานแม้อยู่ในเกม)</div>
          {GLOBAL_HOTKEYS.map((hk) => (
            <div key={hk.combo} className="gm-sheet-row">
              <span>{hk.labelTh}</span>
              <span className="gm-sheet-row-combo">{hk.combo}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
