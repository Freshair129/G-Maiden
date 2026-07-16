// Single-source in-app keyboard-shortcut registry (CR-011 §L "single source, no
// drift" — the shortcut sheet in CommandDeck.tsx is generated FROM this list,
// never a hand-copied table). Pure/testable, no React/Tauri imports — same
// house pattern as live/phase.ts and buildMomentum.ts.
//
// Scope note: this registry only carries the bindings actually wired in
// CR011-P4a-01 (Ctrl+K, Ctrl+1..8, Ctrl+/ + "?", Esc) PLUS, as of
// CR011-P4b-01, F6/Shift+F6 (seat focus cycling) and Shift+F10 (context
// menu at focus), PLUS, as of CR011-P6-01, Ctrl+D (density toggle — the
// gm-deck-prefs store in CommandDeck). The remaining §L rows (Ctrl+Tab,
// Space, F2) still belong to later waves (inspector, row navigation) that
// don't exist yet — the sheet should never claim a binding this build
// doesn't honor.

/** CR011-P6-01: the three quality tiers of the `gm-deck-prefs` store
 *  (CR-011 §H). "cinematic" is the :root DEFAULT — it maps to NO gq-* class
 *  on <html> (owner decision 2026-07-14); balanced/eco add gq-balanced /
 *  gq-eco respectively. */
export type DeckQuality = "cinematic" | "balanced" | "eco";

/** Actions the registry can invoke, supplied by CommandDeck (the single owner
 *  of tab/palette/sheet state and the existing volume/ann/signal handlers —
 *  this contract intentionally reuses those handlers instead of duplicating
 *  their logic). */
export type DeckActions = {
  setTab(tab: string): void;
  openPalette(): void;
  openSheet(): void;
  closeOverlays(): void;
  toggleAnn(): void;
  toggleSignal(): void;
  /** CR011-P4b-01: move focus to the next (`1`) or previous (`-1`) `[data-seat]`
   *  section on the current page, wrapping at either end. No-op when no seats
   *  are mounted (e.g. a non-dashboard tab). */
  focusSeat(dir: 1 | -1): void;
  /** CR011-P4b-01: best-effort fallback for the Shift+F10 registry entry — the
   *  real menu targets (hero seat / utterance row / annunciator) handle
   *  Shift+F10 locally the instant they have focus (see ContextMenu.tsx's
   *  `openFromKeyboard`, which stops propagation so this never double-fires
   *  for them). This only runs when focus sits somewhere with no menu wired,
   *  where correctly doing nothing IS the honest behavior. */
  openContextMenuAtFocus(): void;
  /** CR011-P6-01: set the graphics-quality tier (gm-deck-prefs `quality`) —
   *  CommandDeck persists it and swaps the gq-* class on <html>. */
  setQuality(q: DeckQuality): void;
  /** CR011-P6-01: flip gm-deck-prefs `density` between comfortable and
   *  compact (the `.g-deck.gm-compact` interior-only tightening) — Ctrl+D. */
  toggleDensity(): void;
};

export type ShortcutDef = {
  id: string;
  combo: string;
  label: string;
  labelTh: string;
  /** "always" (default) or "palette-closed" — gates entries (like the plain
   *  "?" binding) that must not fire while Maiden Line is already open, since
   *  its own filter input owns plain-character keystrokes there. */
  when?: "always" | "palette-closed";
  run: (ctx: DeckActions) => void;
};

/** THE page list — the single source. CommandDeck's NAV is DERIVED from this
 *  array (PAGES.map + an icon lookup, CR011-P5 gate fix), MaidenLine consumes
 *  it directly, and Ctrl+1..8 index into it — rail/palette/sheet/hotkeys
 *  cannot drift because there is exactly one array. */
// CR-013 W1-01: ONE CANVAS nav consolidation — Build folds into Live as an
// in-page segmented tab ("สด"/"บิลด์"), History folds into Insights the same
// way ("ภาพรวม"/"รายสัปดาห์"/"ประวัติ"), and G-Store gets its own rail seat
// (routes to the existing StorePage catalog). 8 pages -> 7. Order: dashboard,
// live, voice, store, insights, account, settings.
export const PAGES: Array<{ key: string; label: string; labelTh: string }> = [
  { key: "dashboard", label: "Dashboard", labelTh: "บูธ (Dashboard)" },
  { key: "live", label: "Live", labelTh: "แมตช์สด (Live)" },
  { key: "voice", label: "Voice", labelTh: "แพ็กเสียง (Voice)" },
  { key: "store", label: "Store", labelTh: "G-Store" },
  { key: "insights", label: "Insights", labelTh: "สถิติ (Insights)" },
  { key: "account", label: "Account", labelTh: "บัญชี (Account)" },
  { key: "settings", label: "Settings", labelTh: "ตั้งค่า (Settings)" },
];

const DIGIT_PATTERN = /^[0-9]$/;

/**
 * Pure combo matcher — ctrl/shift/alt/meta + key, case-insensitive. Digit keys
 * ("1".."9") match via `e.code` (`Digit1`..`Digit9`) instead of `e.key`, so a
 * Thai (or any non-US) keyboard layout that remaps the number row's `key`
 * value still fires the physical Ctrl+1..8 page shortcuts. `"Esc"` is an alias
 * for the DOM `"Escape"` key name (kept short in registry combos for the
 * shortcut-sheet display). No DOM globals besides the passed-in event are
 * touched, so this is unit-testable with a plain object literal.
 */
export function matchCombo(e: KeyboardEvent, combo: string): boolean {
  const parts = combo
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;

  const keyPart = parts[parts.length - 1];
  const mods = parts.slice(0, -1).map((p) => p.toLowerCase());

  const wantCtrl = mods.includes("ctrl");
  const wantShift = mods.includes("shift");
  const wantAlt = mods.includes("alt");
  const wantMeta = mods.includes("meta");

  // Shifted-glyph keys ("?", "/"): producing the glyph REQUIRES Shift on most
  // layouts, so KeyboardEvent arrives as key="?" + shiftKey=true — demanding
  // shiftKey=false made the bare "?" combo unreachable (Opus gate, CR011-P4a).
  // For these keyParts the shift flag is ignored: the glyph itself is the intent.
  const shiftedGlyph = keyPart.length === 1 && !/^[a-z0-9]$/i.test(keyPart);

  if (e.ctrlKey !== wantCtrl) return false;
  if (!shiftedGlyph && e.shiftKey !== wantShift) return false;
  if (e.altKey !== wantAlt) return false;
  if (e.metaKey !== wantMeta) return false;

  if (DIGIT_PATTERN.test(keyPart)) {
    return e.code === `Digit${keyPart}`;
  }
  if (keyPart.toLowerCase() === "esc") {
    return e.key === "Escape";
  }
  // "/" matches the physical slash key regardless of what glyph the layout
  // emits (spec §L binds Ctrl+/ — with Ctrl held, layouts disagree on e.key).
  if (keyPart === "/") {
    return e.code === "Slash" || e.key === "/" || e.key === "?";
  }
  return e.key.toLowerCase() === keyPart.toLowerCase();
}

/** Builds the registry fresh each call — cheap (a dozen plain objects), no
 *  shared mutable state, so callers can safely memoize the result once
 *  (`useMemo(() => buildRegistry(), [])` in CommandDeck) without worrying
 *  about staleness; nothing in here closes over component state. */
export function buildRegistry(): ShortcutDef[] {
  const pageEntries: ShortcutDef[] = PAGES.map((page, i) => ({
    id: `goto-${page.key}`,
    combo: `Ctrl+${i + 1}`,
    label: `Go to ${page.label}`,
    labelTh: `ไปที่ ${page.labelTh}`,
    when: "always",
    run: (ctx) => ctx.setTab(page.key),
  }));

  return [
    {
      id: "open-maiden-line",
      combo: "Ctrl+K",
      label: "Open Maiden Line",
      labelTh: "เปิด Maiden Line",
      when: "always",
      run: (ctx) => ctx.openPalette(),
    },
    ...pageEntries,
    {
      id: "open-shortcut-sheet",
      combo: "Ctrl+/",
      label: "Open shortcut sheet",
      labelTh: "เปิดผังคีย์ลัด",
      when: "always",
      run: (ctx) => ctx.openSheet(),
    },
    {
      id: "open-shortcut-sheet-alt",
      combo: "?",
      label: "Open shortcut sheet",
      labelTh: "เปิดผังคีย์ลัด",
      // Never fires while Maiden Line is open — that surface's filter input
      // owns plain "?" keystrokes (its own onKeyDown never sees this
      // registry at all; this flag guards the *global* listener path).
      when: "palette-closed",
      run: (ctx) => ctx.openSheet(),
    },
    {
      id: "close-overlay",
      combo: "Esc",
      label: "Close palette / sheet",
      labelTh: "ปิดหน้าต่างคำสั่ง",
      when: "always",
      run: (ctx) => ctx.closeOverlays(),
    },
    {
      id: "focus-next-seat",
      combo: "F6",
      label: "Focus next seat",
      labelTh: "โฟกัสช่องถัดไป",
      when: "always",
      run: (ctx) => ctx.focusSeat(1),
    },
    {
      id: "focus-prev-seat",
      combo: "Shift+F6",
      label: "Focus previous seat",
      labelTh: "โฟกัสช่องก่อนหน้า",
      when: "always",
      run: (ctx) => ctx.focusSeat(-1),
    },
    {
      id: "open-context-menu",
      combo: "Shift+F10",
      label: "Open context menu",
      labelTh: "เมนูบริบท",
      when: "always",
      run: (ctx) => ctx.openContextMenuAtFocus(),
    },
    {
      id: "toggle-density",
      combo: "Ctrl+D",
      label: "Toggle density",
      labelTh: "สลับความหนาแน่น",
      when: "always",
      run: (ctx) => ctx.toggleDensity(),
    },
  ];
}
