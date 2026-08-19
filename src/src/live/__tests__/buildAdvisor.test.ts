import { describe, it, expect } from "vitest";
import { buildAdvisor } from "../buildAdvisor";
import type { GameTick } from "../events";

const BASE = { hero: "—", lane: "—", itemPath: [] as string[], nextItem: "—", notes: [] as string[] };

function tick(overrides: Partial<GameTick> = {}): GameTick {
  return {
    in_game: true,
    clock_time: 600,
    game_state: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
    daytime: true,
    radiant_score: 5,
    dire_score: 3,
    gold: 1200,
    net_worth: 8000,
    gpm: 450,
    xpm: 520,
    kills: 3,
    deaths: 1,
    assists: 4,
    last_hits: 80,
    denies: 4,
    hero: "npc_dota_hero_crystal_maiden",
    team_name: "radiant",
    level: 11,
    alive: true,
    hp_percent: 80,
    mana_percent: 60,
    buyback_cost: 0,
    respawn_seconds: 0,
    kill_list_len: 3,
    last_victim_slot: 7,
    item_names: [],
    ...overrides
  };
}

describe("buildAdvisor", () => {
  it("returns the base untouched when there is neither a tick nor advice", () => {
    expect(buildAdvisor(null, null, BASE)).toEqual(BASE);
  });

  // The defect this builder exists to remove: the page had NO producer, so it
  // rendered FALLBACK's hardcoded hero/lane as if they were the player's.
  it("never claims a hero or lane it was not told", () => {
    const out = buildAdvisor(null, null, BASE);
    expect(out.hero).toBe("—");
    expect(out.lane).toBe("—");
    expect(out.hero).not.toBe("Maiden");
    expect(out.lane).not.toBe("Support");
  });

  it("uses the REAL hero from the tick", () => {
    expect(buildAdvisor(tick(), null, BASE).hero).toBe("Crystal Maiden");
  });

  it("shows the player's real current items", () => {
    const out = buildAdvisor(tick({ item_names: ["Blink Dagger", "Force Staff"] }), null, BASE);
    expect(out.itemPath).toEqual(["Blink Dagger", "Force Staff"]);
  });

  it("drops empty item slots rather than rendering blank chips", () => {
    const out = buildAdvisor(tick({ item_names: ["Blink Dagger", "", ""] }), null, BASE);
    expect(out.itemPath).toEqual(["Blink Dagger"]);
  });

  // The field is optional on purpose, mirroring Rust's `#[serde(default)]`:
  // a tick round-tripped from an older build legitimately omits it.
  it("survives a tick with no item_names at all (older payloads)", () => {
    const t = tick();
    delete t.item_names;
    expect(buildAdvisor(t, null, BASE).itemPath).toEqual([]);
  });

  it("carries G-Master's real advice into notes", () => {
    const out = buildAdvisor(tick(), "ซื้อ Force Staff ก่อนนะคะ", BASE);
    expect(out.notes).toEqual(["ซื้อ Force Staff ก่อนนะคะ"]);
  });

  // lane and nextItem are genuinely not derivable — GSI has no lane assignment,
  // and G-Master answers in prose. They must stay sentinels even with full data,
  // rather than being back-filled with a plausible guess.
  it("keeps lane and nextItem as sentinels even with a full tick and advice", () => {
    const out = buildAdvisor(tick({ item_names: ["Blink Dagger"] }), "some advice", BASE);
    expect(out.lane).toBe("—");
    expect(out.nextItem).toBe("—");
  });
});
