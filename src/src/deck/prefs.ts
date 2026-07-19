import type { DeckQuality } from "../shortcuts";

/** CR-011 §L "Global (ทำงานแม้อยู่ในเกม)" table — the Rust-owned global
 *  shortcuts (tauri_plugin_global_shortcut, main.rs). These are NOT in the
 *  shortcuts.ts registry (that registry is in-app-only, routed through this
 *  component's own keydown listener) — they're listed here purely so the
 *  shortcut sheet can document them alongside the in-app ones, per CLAUDE.md's
 *  hotkey table. Never rebind these in-app. */
export const GLOBAL_HOTKEYS: Array<{ combo: string; labelTh: string }> = [
  { combo: "Ctrl+Alt+S", labelTh: "ซ่อน/แสดง overlay" },
  { combo: "Alt+↑ / Alt+↓", labelTh: "เพิ่ม/ลดระดับเสียง ±10%" },
  { combo: "Alt+M", labelTh: "ปิด/เปิดเสียง (mute toggle)" },
];

/** CR011-P6-01 (CR-011 §H/§J/§N): the deck comfort prefs — ONE localStorage
 *  key, same seed pattern as gm-deck-audio-rail (persisted value is the seed,
 *  loaded once on CommandDeck mount, written back on every change). */
export type DeckDensity = "comfortable" | "compact";
export type DeckPrefs = { quality: DeckQuality; density: DeckDensity; crisp: boolean; bigMode: boolean };
export const DECK_PREFS_KEY = "gm-deck-prefs";
// bigMode defaults ON (Boss 2026-07-19): with it OFF a window larger than the
// authored 1420×760 stage left a big black letterbox frame around the deck (the
// "never upscale past 1.0" lock). On, the stage snaps UP to a crisp step to fill
// the window (1.35 == edge-to-edge on 1920×1080). Users who want the locked
// native size can still turn it off in Settings → ทั่วไป.
export const DEFAULT_DECK_PREFS: DeckPrefs = { quality: "cinematic", density: "comfortable", crisp: false, bigMode: true };

export function loadDeckPrefs(): DeckPrefs {
  try {
    const raw = localStorage.getItem(DECK_PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Record<keyof DeckPrefs, unknown>>;
      return {
        quality: p.quality === "balanced" || p.quality === "eco" ? p.quality : "cinematic",
        density: p.density === "compact" ? "compact" : "comfortable",
        crisp: p.crisp === true,
        // Default-on: only an EXPLICIT false disables it, so users on an older
        // saved-prefs blob (no bigMode key) also get the window-filling default.
        bigMode: p.bigMode !== false
      };
    }
  } catch {
    /* noop — corrupt/absent storage falls through to defaults */
  }
  return DEFAULT_DECK_PREFS;
}

/** CR-011 §N crisp-text snap steps — s snaps DOWN to the nearest step so a
 *  fractional scale never blurs 1px hairlines/rims. Never snaps ABOVE the
 *  fit value; below the 0.5 floor (window smaller than the 710×398 minimum)
 *  the raw fit value is kept rather than upscaling to a step. */
export const CRISP_SCALE_STEPS = [1.0, 0.875, 0.75, 0.5];

export function snapScaleDown(s: number): number {
  let best: number | null = null;
  for (const step of CRISP_SCALE_STEPS) {
    if (step <= s + 1e-9 && (best === null || step > best)) best = step;
  }
  return best ?? s;
}

/** Boss 2026-07-16 "big mode": an opt-in override of the CR-007 "never
 *  upscale past 1.0" lock. The lock exists because a FREE/continuous scale
 *  factor above 1.0 softens 1px hairlines/rims (non-integer device-pixel
 *  hairlines anti-alias into a "chunky" line). Big mode does not remove that
 *  lock outright — it's an opt-OUT (default ON as of 2026-07-19, since a large
 *  window otherwise letterboxed the deck in a big black frame) — it adds a
 *  small set of fixed, deliberately-chosen upscale steps (same "snap to a named step"
 *  shape as CRISP_SCALE_STEPS below 1.0), so scaling up is still to a crisp
 *  ratio, never a random fractional one. 1.35 is the largest step that fits
 *  a 1920×1080 monitor edge-to-edge (measured: min(1920/1420,1080/760)
 *  ≈1.352); larger steps exist for bigger displays and are only ever
 *  selected when the window is actually large enough (the `<= fit` guard
 *  below can never overflow the window, on any monitor). */
export const BIG_SCALE_STEPS = [1.0, 1.15, 1.25, 1.35, 1.5, 1.75, 2.0];

export function snapScaleUp(fit: number): number {
  // Defensive fallback only — the call site guards `fit > 1.0` before calling
  // this, so BIG_SCALE_STEPS[0]=1.0 always qualifies in practice. But
  // initializing `best` to a STEP (not null) is exactly the bug that shipped
  // once already: if this is ever called with fit < 1.0, every step fails the
  // `<=` check, `best` never updates, and the un-clamped 1.0 default gets
  // returned as the scale — overflowing a window smaller than 1420×760. Bare
  // `fit` (no upscale, no cap needed since fit<1.0 here) is the correct
  // fallback, matching snapScaleDown's `best ?? s` shape.
  let best: number | null = null;
  for (const step of BIG_SCALE_STEPS) {
    if (step <= fit + 1e-9) best = step;
  }
  return best ?? fit;
}

export const FUNG_PANEL_PATH =
  "M 40,12 H 800 A 20 20 0 0 1 820,32 V 54 A 20 20 0 0 0 840,74 H 1248 A 20 20 0 0 1 1268,94 V 688 A 20 20 0 0 1 1248,708 H 112 A 20 20 0 0 1 92,688 V 350 A 20 20 0 0 0 72,330 H 32 A 20 20 0 0 1 12,310 V 40 A 28 28 0 0 1 40,12 Z";

// dashboard-only variant — CR-007 WP-1: adds the bottom-right subtract notch so the
// G-Signal cluster (D/E/F/G) sits in a real void instead of floating on solid glass.
// Same 12px-margin rhythm as the top-right topbar notch; 20px fillets throughout.
// Only used while tab === "dashboard" (the only tab that renders the signal cluster) —
// every other tab keeps the plain FUNG_PANEL_PATH so no stray hole appears.
export const FUNG_PANEL_PATH_SIGNALS =
  "M 40,12 H 800 A 20 20 0 0 1 820,32 V 54 A 20 20 0 0 0 840,74 H 1248 A 20 20 0 0 1 1268,94 V 488 A 20 20 0 0 1 1248,508 H 836 A 20 20 0 0 0 816,528 V 688 A 20 20 0 0 1 796,708 H 112 A 20 20 0 0 1 92,688 V 350 A 20 20 0 0 0 72,330 H 32 A 20 20 0 0 1 12,310 V 40 A 28 28 0 0 1 40,12 Z";
