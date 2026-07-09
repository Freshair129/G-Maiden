import { describe, expect, it } from "vitest";
import { FALLBACK, MOCK, formatKda } from "../companion";

// CR-007 WP-4 Fix 2 (gate WARN): CompanionPages.tsx used to interpolate
// hero.kills/deaths/assists directly (`{hero.kills}/{hero.deaths}/{hero.assists}`).
// FALLBACK.heroes' 10 honest "empty" slots have all three fields `undefined`,
// so that line rendered a literal "undefined/undefined/undefined" collapsing
// visually to "//" once React drops `undefined` children. formatKda() is the
// single guarded formatter both CommandDeck's HeroSlot and CompanionPages'
// enemy-visibility row now go through.
describe("formatKda", () => {
  it("renders '—' when any of kills/deaths/assists is undefined", () => {
    expect(formatKda({})).toBe("—");
    expect(formatKda({ kills: 3 })).toBe("—");
    expect(formatKda({ kills: 3, deaths: 1 })).toBe("—");
    expect(formatKda({ deaths: 1, assists: 2 })).toBe("—");
  });

  it("formats all three fields with the default ' / ' separator when all are defined (incl. zero)", () => {
    expect(formatKda({ kills: 0, deaths: 0, assists: 0 })).toBe([0, 0, 0].join(" / "));
    expect(formatKda({ kills: 8, deaths: 2, assists: 11 })).toBe("8 / 2 / 11");
  });

  it("accepts a custom separator (CompanionPages' tight '/' style)", () => {
    expect(formatKda({ kills: 8, deaths: 2, assists: 11 }, "/")).toBe("8/2/11");
    expect(formatKda({}, "/")).toBe("—");
  });
});

// Render/derive-style regression: walk the FALLBACK path's hero list (the
// pure data the Live tab / dashboard consume when no match is running yet)
// through formatKda and assert nothing produces a bare "//", "NaN", or
// "undefined" string — the exact failure mode the gate caught.
describe("FALLBACK.heroes KDA rendering — no bare '//'/'NaN'/'undefined' (CR-007 WP-4 regression)", () => {
  it("every honest-empty FALLBACK hero slot formats to '—', never '//'", () => {
    expect(FALLBACK.heroes).toHaveLength(10);
    for (const hero of FALLBACK.heroes) {
      const rendered = formatKda(hero, "/");
      expect(rendered).toBe("—");
      expect(rendered).not.toContain("//");
      expect(rendered).not.toMatch(/NaN/);
      expect(rendered).not.toMatch(/undefined/);
    }
  });

  it("MOCK.heroes (all fields defined) never renders '//'/'NaN'/'undefined' either", () => {
    for (const hero of MOCK.heroes) {
      const rendered = formatKda(hero, "/");
      expect(rendered).not.toContain("//");
      expect(rendered).not.toMatch(/NaN/);
      expect(rendered).not.toMatch(/undefined/);
    }
  });
});
