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
});
