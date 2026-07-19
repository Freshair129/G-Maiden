import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { MatchPhase } from "./live/phase";
import { PAGES } from "./shortcuts";
import type { DeckActions, DeckQuality } from "./shortcuts";

// CR-011 §M "Maiden Line" — the command palette. Follows the spec exactly:
// floats in WINDOW space (fixed, above the scaled stage — mounted as a
// sibling of `.g-deck-stage` in CommandDeck.tsx, never inside it), console
// glass material, verb-first bilingual entries in three sections, phase-aware
// ranking, and a two-step arm/confirm destructive flow (Quit) — no modal.

type PaletteSection = "actions" | "pages" | "settings";

type PaletteEntry = {
  id: string;
  section: PaletteSection;
  label: string;
  labelTh: string;
  hotkey?: string;
  destructive?: boolean;
  /** CR011-P6-01: a visible-but-inert row (e.g. the CURRENT quality tier —
   *  shown so the user can see which tier is active, but selecting it would
   *  be a no-op so it never runs/closes). */
  disabled?: boolean;
  run: () => void;
};

const SECTION_ORDER: PaletteSection[] = ["actions", "pages", "settings"];
const SECTION_LABEL: Record<PaletteSection, string> = {
  actions: "Actions",
  pages: "Pages",
  settings: "Settings",
};


/** Phase-aware ranking (CR-011 §M) as a simple additive score, not a
 *  rewrite of the list: entries that should "lead" for the current phase get
 *  a large negative offset so they sort first WITHIN their own section
 *  (both boosted ids below already live in the section rendered earliest —
 *  "เปิด debrief" in Actions, "ทดสอบเสียง"/"ไปที่ Settings" in Actions/Pages —
 *  so leading their section also means leading the whole list). Ties keep
 *  the original (stable) order. */
function rankBoost(id: string, phase: MatchPhase): number {
  if (phase === "debrief" && id === "open-debrief") return -1000;
  if (phase === "standby" && (id === "test-voice" || id === "goto-settings")) return -1000;
  return 0;
}

export type MaidenLineProps = {
  open: boolean;
  onClose: () => void;
  onOpenSheet: () => void;
  actions: DeckActions;
  matchPhase: MatchPhase;
  /** CR011-P6-01: current quality tier (gm-deck-prefs) — the matching
   *  "คุณภาพกราฟิก: …" entry renders disabled so the active tier is visible
   *  but not re-selectable. */
  quality: DeckQuality;
};

export default function MaidenLine({ open, onClose, onOpenSheet, actions, matchPhase, quality }: MaidenLineProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [armedId, setArmedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Reset transient UI state every time the palette opens, and move focus
  // into the filter input (a fresh open never inherits a stale query/arm).
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    setArmedId(null);
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    setSelected(0);
    // An armed destructive row must not survive a filter edit — the row can
    // filter out and silently reappear later still armed (Opus gate, CR011-P4a).
    setArmedId(null);
  }, [query]);

  // NOTE: everything below (entries/groups/flat, the scrollIntoView effect,
  // runEntry/onInputKeyDown) is computed even while `open` is false — the
  // `if (!open) return null` guard sits AFTER the last hook call, never
  // before it, so hook call order/count stays identical across renders
  // (rules-of-hooks). The extra work while closed is cheap (a dozen plain
  // objects, no DOM reads) and this component only exists at all while
  // mounted by CommandDeck, which keeps it mounted across open/close so its
  // internal state (query/selected/armedId) resets cleanly via the effect
  // above instead of remounting.
  const entries: PaletteEntry[] = [
    {
      id: "open-debrief",
      section: "actions",
      label: "Open debrief",
      labelTh: "เปิด debrief",
      run: () => actions.setTab("dashboard"),
    },
    {
      id: "toggle-ann",
      section: "actions",
      label: "Toggle ANN announcer voice",
      labelTh: "เปิด/ปิด เสียงประกาศ ANN",
      run: () => actions.toggleAnn(),
    },
    {
      id: "toggle-signal",
      section: "actions",
      label: "Toggle G-Signal",
      labelTh: "เปิด/ปิด G-Signal",
      run: () => actions.toggleSignal(),
    },
    {
      id: "test-voice",
      section: "actions",
      label: "Test voice (ทดสอบเสียง)",
      labelTh: "ทดสอบเสียง (Test voice)",
      run: () => {
        void invoke("speak_event", { event: "advice", fallback: "ทดสอบเสียงค่ะ" }).catch(() => {});
      },
    },
    {
      id: "goto-updates",
      section: "actions",
      // Verb must match what really happens: this NAVIGATES to the updater in
      // Settings, it does not run the check itself (Opus gate, CR011-P4a).
      label: "Go to updates (Settings)",
      labelTh: "ไปที่หน้าอัปเดต (Settings)",
      run: () => actions.setTab("settings"),
    },
    // Single source: the page list + Thai labels come from shortcuts.ts PAGES —
    // this file had its own third hand-copy and the labels had already drifted
    // (Opus gate, CR011-P4a).
    ...PAGES.map(
      (page, i): PaletteEntry => ({
        id: `goto-${page.key}`,
        section: "pages",
        label: `Go to ${page.label}`,
        labelTh: `ไปที่ ${page.labelTh}`,
        hotkey: `Ctrl+${i + 1}`,
        run: () => actions.setTab(page.key),
      })
    ),
    {
      id: "switch-settings",
      section: "settings",
      label: "Switch to Settings",
      labelTh: "สลับหน้า Settings",
      run: () => actions.setTab("settings"),
    },
    // CR011-P6-01: quality tiers + density — same gm-deck-prefs store as the
    // Settings deck card / Ctrl+D (DeckActions.setQuality / toggleDensity).
    // The CURRENT tier renders disabled (visible marker, inert row).
    ...(["cinematic", "balanced", "eco"] as const).map(
      (q): PaletteEntry => ({
        id: `quality-${q}`,
        section: "settings",
        label: `Graphics quality: ${q.charAt(0).toUpperCase()}${q.slice(1)}`,
        labelTh: `คุณภาพกราฟิก: ${q.charAt(0).toUpperCase()}${q.slice(1)}`,
        disabled: quality === q,
        run: () => actions.setQuality(q),
      })
    ),
    {
      id: "toggle-density",
      section: "settings",
      label: "Toggle density",
      labelTh: "สลับความหนาแน่น",
      hotkey: "Ctrl+D",
      run: () => actions.toggleDensity(),
    },
    {
      id: "open-shortcut-sheet",
      section: "settings",
      label: "Open shortcut sheet",
      labelTh: "เปิด shortcut sheet",
      hotkey: "Ctrl+Shift+/",
      run: onOpenSheet,
    },
    {
      id: "quit-app",
      section: "settings",
      label: "Quit (ออกจากแอป)",
      labelTh: "ออกจากแอป (Quit)",
      destructive: true,
      run: () => {
        void invoke("quit_application").catch(() => {});
      },
    },
  ];

  const q = query.trim().toLowerCase();
  const filtered = q.length === 0
    ? entries
    : entries.filter((e) => e.label.toLowerCase().includes(q) || e.labelTh.toLowerCase().includes(q));

  const groups = SECTION_ORDER
    .map((section) => ({
      section,
      items: filtered
        .map((e, i) => ({ e, i }))
        .filter((x) => x.e.section === section)
        .sort((a, b) => rankBoost(a.e.id, matchPhase) - rankBoost(b.e.id, matchPhase) || a.i - b.i)
        .map((x) => x.e),
    }))
    .filter((g) => g.items.length > 0);

  const flat = groups.flatMap((g) => g.items);
  const activeEntry = flat[selected] ?? null;

  // Disarm when the selection leaves the armed row (covers arrow-move and
  // mixed mouse/keyboard paths — every miss direction stays fail-safe).
  // Deliberately `[selected]` only, NOT `[armedId, activeEntry]`: `entries`
  // (and everything derived from it — `groups`/`flat`/`activeEntry`) is
  // rebuilt as fresh object literals every render (see the NOTE above), so
  // `activeEntry` never has a stable identity — depending on it would fire
  // this effect on every render of the whole component (any query keystroke,
  // any parent re-render), not just on an actual arrow-key/hover move. The
  // guard body is keyed by VALUE (`armedId`, `activeEntry?.id`) read fresh
  // each run, so the check is still always correct at the one moment that
  // matters — when `selected` itself changes.
  useEffect(() => {
    if (armedId !== null && activeEntry?.id !== armedId) setArmedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  const activeId = activeEntry?.id ?? null;

  useEffect(() => {
    if (!activeId) return;
    rowRefs.current.get(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  function runEntry(entry: PaletteEntry) {
    // Disabled rows (the current quality tier) are visible markers only —
    // Enter/click on one neither runs nor closes the palette.
    if (entry.disabled) return;
    if (entry.destructive) {
      if (armedId === entry.id) {
        entry.run();
        setArmedId(null);
        onClose();
      } else {
        setArmedId(entry.id);
      }
      return;
    }
    entry.run();
    onClose();
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setSelected((s) => (flat.length === 0 ? 0 : (s + 1) % flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setSelected((s) => (flat.length === 0 ? 0 : (s - 1 + flat.length) % flat.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (activeEntry) runEntry(activeEntry);
    } else if (e.key === "Escape") {
      // Disarm a destructive row first (one Esc = "never mind, don't quit");
      // only a second Esc (nothing armed) closes the whole palette. Stops
      // propagation so CommandDeck's single global keydown listener never
      // ALSO processes this Escape via the registry's "close-overlay" entry —
      // this component owns Escape whenever its input has focus.
      e.stopPropagation();
      if (armedId) {
        setArmedId(null);
      } else {
        onClose();
      }
    }
  }

  if (!open) return null;

  return (
    <div className="gm-palette-backdrop" onClick={onClose}>
      <div
        className="gm-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Maiden Line"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          type="text"
          className="gm-palette-input"
          placeholder="ให้ช่วยอะไรดีคะ?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          onBlur={() => setArmedId(null)}
          role="combobox"
          aria-expanded="true"
          aria-controls="gm-palette-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeEntry ? `gm-palette-opt-${activeEntry.id}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="gm-palette-list" role="listbox" id="gm-palette-listbox" aria-label="Maiden Line results">
          {flat.length === 0 ? (
            <div className="gm-palette-empty">ไม่พบคำสั่งที่ตรงกัน</div>
          ) : (
            groups.map((group) => (
              <div className="gm-palette-section" key={group.section}>
                <div className="gm-palette-section-label">{SECTION_LABEL[group.section]}</div>
                {group.items.map((entry) => {
                  const isSelected = activeEntry?.id === entry.id;
                  const isArmed = armedId === entry.id;
                  return (
                    <div
                      key={entry.id}
                      id={`gm-palette-opt-${entry.id}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={entry.disabled || undefined}
                      ref={(el) => {
                        if (el) rowRefs.current.set(entry.id, el);
                        else rowRefs.current.delete(entry.id);
                      }}
                      className={`gm-palette-row${isSelected ? " selected" : ""}${isArmed ? " danger" : ""}${entry.disabled ? " disabled" : ""}`}
                      onMouseEnter={() => setSelected(flat.indexOf(entry))}
                      onClick={() => runEntry(entry)}
                    >
                      <span className="gm-palette-row-label">
                        {isArmed ? `ยืนยัน — ${entry.labelTh}` : entry.labelTh}
                      </span>
                      {entry.hotkey ? <span className="gm-palette-row-hotkey">{entry.hotkey}</span> : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
