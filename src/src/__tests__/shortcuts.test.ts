import { describe, expect, it } from "vitest";
import { buildRegistry, matchCombo } from "../shortcuts";

/** Minimal KeyboardEvent stand-in — matchCombo only reads these five fields,
 *  so a plain object literal (not a real DOM event) keeps the test pure and
 *  independent of jsdom/browser globals. */
function key(
  k: string,
  overrides: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; code: string }> = {}
): KeyboardEvent {
  return {
    key: k,
    code: overrides.code ?? "",
    ctrlKey: overrides.ctrlKey ?? false,
    shiftKey: overrides.shiftKey ?? false,
    altKey: overrides.altKey ?? false,
    metaKey: overrides.metaKey ?? false,
  } as KeyboardEvent;
}

describe("matchCombo", () => {
  it("matches a plain letter combo case-insensitively", () => {
    expect(matchCombo(key("k", { ctrlKey: true }), "Ctrl+K")).toBe(true);
    expect(matchCombo(key("K", { ctrlKey: true }), "Ctrl+K")).toBe(true);
    expect(matchCombo(key("K", { ctrlKey: true }), "ctrl+k")).toBe(true);
  });

  it("rejects when a required modifier is missing", () => {
    expect(matchCombo(key("k"), "Ctrl+K")).toBe(false);
  });

  it("rejects when an EXTRA modifier is held that the combo doesn't want", () => {
    expect(matchCombo(key("k", { ctrlKey: true, shiftKey: true }), "Ctrl+K")).toBe(false);
  });

  it("matches digit combos via e.code, ignoring e.key (Thai/non-US layouts)", () => {
    // A layout that remaps the number row's `key` (e.g. to a Thai glyph) still
    // reports the physical key via `code` — Ctrl+1 must still fire.
    const thaiLayoutDigit1 = key("ๅ", { ctrlKey: true, code: "Digit1" });
    expect(matchCombo(thaiLayoutDigit1, "Ctrl+1")).toBe(true);
  });

  it("does not match the wrong digit code", () => {
    expect(matchCombo(key("2", { ctrlKey: true, code: "Digit2" }), "Ctrl+1")).toBe(false);
  });

  it("matches all eight Ctrl+1..8 page combos by digit code", () => {
    for (let n = 1; n <= 8; n++) {
      const e = key(String(n), { ctrlKey: true, code: `Digit${n}` });
      expect(matchCombo(e, `Ctrl+${n}`)).toBe(true);
    }
  });

  it("treats 'Esc' as an alias for the DOM 'Escape' key", () => {
    expect(matchCombo(key("Escape"), "Esc")).toBe(true);
    expect(matchCombo(key("Escape"), "esc")).toBe(true);
  });

  it("matches Ctrl+/ via physical Slash code regardless of layout glyph", () => {
    // with Ctrl held, layouts disagree on e.key for the slash key — the
    // physical code (or either glyph) must all match (Opus gate, CR011-P4a)
    expect(matchCombo(key("/", { ctrlKey: true, code: "Slash" }), "Ctrl+/")).toBe(true);
    expect(matchCombo(key("?", { ctrlKey: true, code: "Slash" }), "Ctrl+/")).toBe(true);
    expect(matchCombo(key("/", { ctrlKey: true }), "Ctrl+/")).toBe(true);
    expect(matchCombo(key("/", {}), "Ctrl+/")).toBe(false);
  });

  it("bare '?' matches WITH shiftKey set — producing the glyph requires Shift", () => {
    // Shift+/ arrives as key="?" + shiftKey=true on standard layouts; demanding
    // shiftKey=false made the binding unreachable (Opus gate, CR011-P4a)
    expect(matchCombo(key("?", { shiftKey: true }), "?")).toBe(true);
    expect(matchCombo(key("?"), "?")).toBe(true);
    expect(matchCombo(key("?", { ctrlKey: true, shiftKey: true }), "?")).toBe(false);
  });

  // CR011-P4b-01: F-keys are multi-character `e.key` values ("F6", "F10"),
  // never single digit chars, so DIGIT_PATTERN (which only matches a lone
  // "0".."9" keyPart) can never mistake "F6" for the digit "6" — verified
  // rather than assumed, per the task's "fix ONLY if needed" instruction.
  // No change to matchCombo was needed.
  it("matches a plain F-key combo without confusing it with the digit rule", () => {
    expect(matchCombo(key("F6"), "F6")).toBe(true);
    expect(matchCombo(key("F10"), "F10")).toBe(true);
  });

  it("matches Shift+F6 and Shift+F10", () => {
    expect(matchCombo(key("F6", { shiftKey: true }), "Shift+F6")).toBe(true);
    expect(matchCombo(key("F10", { shiftKey: true }), "Shift+F10")).toBe(true);
  });

  it("rejects F6 when Shift is unexpectedly held (and vice versa)", () => {
    expect(matchCombo(key("F6", { shiftKey: true }), "F6")).toBe(false);
    expect(matchCombo(key("F6"), "Shift+F6")).toBe(false);
  });

  it("does not cross-match an F-key combo against the plain digit it contains", () => {
    // "F6" the keyPart must never satisfy a "6" (Ctrl+6 digit-code) combo or
    // vice versa — they are unrelated bindings that happen to share a glyph.
    expect(matchCombo(key("6", { ctrlKey: true, code: "Digit6" }), "F6")).toBe(false);
    expect(matchCombo(key("F6"), "Ctrl+6")).toBe(false);
  });

  // CR011-P6-01: Ctrl+D (density toggle)
  it("matches Ctrl+D case-insensitively and rejects it without Ctrl or with extra Shift", () => {
    expect(matchCombo(key("d", { ctrlKey: true }), "Ctrl+D")).toBe(true);
    expect(matchCombo(key("D", { ctrlKey: true }), "Ctrl+D")).toBe(true);
    expect(matchCombo(key("d"), "Ctrl+D")).toBe(false);
    expect(matchCombo(key("d", { ctrlKey: true, shiftKey: true }), "Ctrl+D")).toBe(false);
  });
});

describe("buildRegistry", () => {
  it("includes Ctrl+K, all eight Ctrl+1..8 page shortcuts, the sheet openers, and Esc", () => {
    const registry = buildRegistry();
    const combos = registry.map((r) => r.combo);
    expect(combos).toContain("Ctrl+K");
    for (let n = 1; n <= 8; n++) expect(combos).toContain(`Ctrl+${n}`);
    expect(combos).toContain("Ctrl+/");
    expect(combos).toContain("?");
    expect(combos).toContain("Esc");
  });

  it("gates the plain '?' entry to when the palette is closed", () => {
    const registry = buildRegistry();
    const bare = registry.find((r) => r.combo === "?");
    expect(bare?.when).toBe("palette-closed");
  });

  it("every entry id is unique (no accidental duplicate bindings)", () => {
    const registry = buildRegistry();
    const ids = registry.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes F6, Shift+F6, and Shift+F10 (CR011-P4b-01)", () => {
    const registry = buildRegistry();
    const combos = registry.map((r) => r.combo);
    expect(combos).toContain("F6");
    expect(combos).toContain("Shift+F6");
    expect(combos).toContain("Shift+F10");
  });

  it("F6/Shift+F6 call focusSeat with the right direction, Shift+F10 calls openContextMenuAtFocus", () => {
    const registry = buildRegistry();
    const calls: string[] = [];
    const ctx = {
      setTab: () => {},
      openPalette: () => {},
      openSheet: () => {},
      closeOverlays: () => {},
      toggleAnn: () => {},
      toggleSignal: () => {},
      focusSeat: (dir: 1 | -1) => calls.push(`focusSeat(${dir})`),
      openContextMenuAtFocus: () => calls.push("openContextMenuAtFocus"),
      setQuality: () => {},
      toggleDensity: () => {},
    };
    registry.find((r) => r.combo === "F6")?.run(ctx);
    registry.find((r) => r.combo === "Shift+F6")?.run(ctx);
    registry.find((r) => r.combo === "Shift+F10")?.run(ctx);
    expect(calls).toEqual(["focusSeat(1)", "focusSeat(-1)", "openContextMenuAtFocus"]);
  });

  // CR011-P6-01: Ctrl+D density toggle rides the same single-source registry.
  it("includes Ctrl+D and its entry calls toggleDensity (CR011-P6-01)", () => {
    const registry = buildRegistry();
    const entry = registry.find((r) => r.combo === "Ctrl+D");
    expect(entry).toBeDefined();
    expect(entry?.id).toBe("toggle-density");
    const calls: string[] = [];
    const ctx = {
      setTab: () => {},
      openPalette: () => {},
      openSheet: () => {},
      closeOverlays: () => {},
      toggleAnn: () => {},
      toggleSignal: () => {},
      focusSeat: () => {},
      openContextMenuAtFocus: () => {},
      setQuality: () => {},
      toggleDensity: () => calls.push("toggleDensity"),
    };
    entry?.run(ctx);
    expect(calls).toEqual(["toggleDensity"]);
  });
});
