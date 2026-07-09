import { describe, it, expect } from "vitest";
import { buildHeroes, assignEnemySlot, ENEMY_SLOT_COUNT } from "../buildHeroes";
import { MOCK, FALLBACK } from "../../companion";
import type { GameTick, MinimapCv } from "../events";

function makeTick(overrides: Partial<GameTick> = {}): GameTick {
  return {
    in_game: true,
    clock_time: 730,
    game_state: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
    daytime: true,
    radiant_score: 12,
    dire_score: 8,
    gold: 2500,
    net_worth: 18200,
    gpm: 612,
    xpm: 721,
    kills: 8,
    deaths: 2,
    assists: 11,
    last_hits: 214,
    denies: 12,
    hero: "npc_dota_hero_crystal_maiden",
    level: 18,
    alive: true,
    hp_percent: 88,
    mana_percent: 60,
    buyback_cost: 0,
    respawn_seconds: 0,
    kill_list_len: 0,
    last_victim_slot: 0,
    ...overrides
  };
}

// Slot assignment for a name already known via the `missing` map / MOCK's
// baked-in enemy names — build the map the way companion.ts would after
// seeing those names via enemy-missing events, in insertion order.
function slotsFor(...npcNames: string[]): Map<string, number> {
  let m = new Map<string, number>();
  for (const n of npcNames) m = assignEnemySlot(m, n);
  return m;
}

describe("buildHeroes", () => {
  it("returns base unchanged when tick is null, missing empty, cv empty, and no slot assignments", () => {
    const result = buildHeroes(null, new Map(), null, MOCK.heroes, new Map());
    expect(result).toBe(MOCK.heroes);
  });

  it("updates index-0 ally hero's live stats from tick", () => {
    const tick = makeTick();
    const result = buildHeroes(tick, new Map(), null, MOCK.heroes, new Map());
    const hero0 = result[0];
    expect(hero0.level).toBe(tick.level);
    expect(hero0.kills).toBe(tick.kills);
    expect(hero0.deaths).toBe(tick.deaths);
    expect(hero0.assists).toBe(tick.assists);
    expect(hero0.nw).toBe(tick.net_worth);
    expect(hero0.gpm).toBe(tick.gpm);
    expect(hero0.xpm).toBe(tick.xpm);
    expect(hero0.lastHits).toBe(tick.last_hits);
    expect(hero0.denies).toBe(tick.denies);
    expect(hero0.hpPercent).toBe(tick.hp_percent);
  });

  it("sets state 'dead' and timer=round(respawn_seconds) when alive is false", () => {
    const tick = makeTick({ alive: false, respawn_seconds: 21.4 });
    const result = buildHeroes(tick, new Map(), null, MOCK.heroes, new Map());
    expect(result[0].state).toBe("dead");
    expect(result[0].timer).toBe(21);
  });

  it("sets state 'visible' and timer=0 when alive is true", () => {
    const tick = makeTick({ alive: true, respawn_seconds: 0 });
    const result = buildHeroes(tick, new Map(), null, MOCK.heroes, new Map());
    expect(result[0].state).toBe("visible");
    expect(result[0].timer).toBe(0);
  });

  it("leaves the other nine hero slots unchanged from base", () => {
    const tick = makeTick();
    const result = buildHeroes(tick, new Map(), null, MOCK.heroes, new Map());
    for (let i = 1; i < MOCK.heroes.length; i++) {
      expect(result[i]).toEqual(MOCK.heroes[i]);
    }
  });

  it("only overwrites the live hero name on index-0 and preserves profile fields", () => {
    const tick = makeTick();
    const result = buildHeroes(tick, new Map(), null, MOCK.heroes, new Map());
    expect(result[0].hero).toBe("Crystal Maiden");
    expect(result[0].player).toBe(MOCK.heroes[0].player);
    expect(result[0].rank).toBe(MOCK.heroes[0].rank);
    expect(result[0].mmr).toBe(MOCK.heroes[0].mmr);
    expect(result[0].profile).toBe(MOCK.heroes[0].profile);
  });

  it("marks a hero 'missing' when assigned + present in the missing map", () => {
    // MOCK.heroes[5] ("e1") has hero: "Warden"
    const missing = new Map<string, number>([["npc_dota_hero_warden", 14500]]);
    const enemySlots = slotsFor("npc_dota_hero_warden");
    const result = buildHeroes(null, missing, null, MOCK.heroes, enemySlots);
    const wardenIndex = MOCK.heroes.findIndex((h) => h.hero === "Warden");
    expect(wardenIndex).toBeGreaterThanOrEqual(0);
    expect(result[wardenIndex].state).toBe("missing");
    expect(result[wardenIndex].timer).toBe(Math.round(14500 / 1000));
  });

  it("rounds a non-exact-second missing_for_ms value", () => {
    const missing = new Map<string, number>([["npc_dota_hero_warden", 8600]]);
    const enemySlots = slotsFor("npc_dota_hero_warden");
    const result = buildHeroes(null, missing, null, MOCK.heroes, enemySlots);
    const wardenIndex = MOCK.heroes.findIndex((h) => h.hero === "Warden");
    expect(result[wardenIndex].state).toBe("missing");
    expect(result[wardenIndex].timer).toBe(9); // round(8600/1000) = round(8.6) = 9
  });

  it("does not mutate the base array; only changed entries differ by reference", () => {
    const missing = new Map<string, number>([["npc_dota_hero_warden", 14500]]);
    const enemySlots = slotsFor("npc_dota_hero_warden");
    const result = buildHeroes(null, missing, null, MOCK.heroes, enemySlots);
    const wardenIndex = MOCK.heroes.findIndex((h) => h.hero === "Warden");

    result.forEach((hero, i) => {
      if (i === wardenIndex) {
        expect(hero).not.toBe(MOCK.heroes[i]);
      } else {
        expect(hero).toBe(MOCK.heroes[i]);
      }
    });

    // MOCK itself must remain untouched.
    expect(MOCK.heroes[wardenIndex].state).toBe("missing");
    expect(MOCK.heroes[wardenIndex].timer).toBe(14);
  });
});

// CR-007 WP-4 regression: FALLBACK.heroes used to be `[]`, so every hero slot
// rendered the old Dashboard.tsx stub's placeholder label + all-zero KDA
// forever, even mid-match (buildHeroes(...).map() over an empty array is a
// no-op). These tests exercise the real (10-placeholder) FALLBACK.heroes shape.
describe("buildHeroes — honest FALLBACK base (CR-007 WP-4 regression)", () => {
  it("FALLBACK.heroes has 10 honestly-empty slots (5 ally, 5 enemy)", () => {
    expect(FALLBACK.heroes).toHaveLength(10);
    expect(FALLBACK.heroes.filter((h) => h.team === "ally")).toHaveLength(5);
    expect(FALLBACK.heroes.filter((h) => h.team === "enemy")).toHaveLength(5);
    FALLBACK.heroes.forEach((h) => {
      expect(h.hero).toBe("—");
      expect(h.state).toBe("empty");
      expect(h.kills).toBeUndefined();
    });
  });

  it("returns the FALLBACK base unchanged when there is no live data at all", () => {
    const result = buildHeroes(null, new Map(), null, FALLBACK.heroes, new Map());
    expect(result).toBe(FALLBACK.heroes);
  });

  it("fills ally slot 0 from tick but leaves ally slots 1-4 honestly '—' (GSI is local-player-only)", () => {
    const tick = makeTick();
    const result = buildHeroes(tick, new Map(), null, FALLBACK.heroes, new Map());
    expect(result[0].hero).toBe("Crystal Maiden");
    expect(result[0].state).toBe("visible");
    expect(result[0].kills).toBe(tick.kills);
    for (let i = 1; i <= 4; i++) {
      expect(result[i].hero).toBe("—");
      expect(result[i].state).toBe("empty");
      expect(result[i].kills).toBeUndefined();
    }
  });

  it("assigns a missing enemy's real name + state 'missing' to its permanently-assigned slot", () => {
    const missing = new Map<string, number>([["npc_dota_hero_warden", 14500]]);
    const enemySlots = slotsFor("npc_dota_hero_warden");
    const result = buildHeroes(null, missing, null, FALLBACK.heroes, enemySlots);
    expect(result[5].hero).toBe("Warden");
    expect(result[5].state).toBe("missing");
    expect(result[5].timer).toBe(Math.round(14500 / 1000));
    for (let i = 6; i <= 9; i++) {
      expect(result[i].hero).toBe("—");
      expect(result[i].state).toBe("empty");
    }
  });

  it("assigns two missing enemies to slots in the order their slots were claimed", () => {
    const missing = new Map<string, number>([
      ["npc_dota_hero_warden", 6000],
      ["npc_dota_hero_mirage", 8000]
    ]);
    const enemySlots = slotsFor("npc_dota_hero_warden", "npc_dota_hero_mirage");
    const result = buildHeroes(null, missing, null, FALLBACK.heroes, enemySlots);
    expect(result[5].hero).toBe("Warden");
    expect(result[6].hero).toBe("Mirage");
    expect(result[7].hero).toBe("—");
  });

  it("renders a CV-only (visible, never-missing) enemy identity honestly as 'visible'", () => {
    const cv: MinimapCv = {
      region: { x: 0, y: 0, side: 100 },
      icon: 0,
      candidates: [],
      count: 1,
      detections: [{ label: 1, name: "npc_dota_hero_oracle", x: 10, y: 10, score: 0.9 }],
      classifier: true
    };
    const enemySlots = slotsFor("npc_dota_hero_oracle");
    const result = buildHeroes(null, new Map(), cv, FALLBACK.heroes, enemySlots);
    expect(result[5].hero).toBe("Oracle");
    expect(result[5].state).toBe("visible");
    expect(result[5].timer).toBe(0);
  });

  it("a hero once assigned stays 'visible' in its slot even once CV stops re-detecting it", () => {
    // The slot table is the identity source of truth now — a hero doesn't
    // need to be present in *this tick's* cv.detections to keep rendering,
    // only to not be in the `missing` map.
    const enemySlots = slotsFor("npc_dota_hero_oracle");
    const result = buildHeroes(null, new Map(), null, FALLBACK.heroes, enemySlots);
    expect(result[5].hero).toBe("Oracle");
    expect(result[5].state).toBe("visible");
  });
});

describe("assignEnemySlot — permanent, order-preserving assignment (CR-007 WP-4 Fix 3)", () => {
  it("claims the first free slot (0) for the first name seen", () => {
    const m = assignEnemySlot(new Map(), "npc_dota_hero_zeus");
    expect(m.get("npc_dota_hero_zeus")).toBe(0);
  });

  it("returns the SAME map reference when the name already has a slot (no-op)", () => {
    const m1 = assignEnemySlot(new Map(), "npc_dota_hero_zeus");
    const m2 = assignEnemySlot(m1, "npc_dota_hero_zeus");
    expect(m2).toBe(m1);
  });

  it("returns the SAME map reference when the name is empty", () => {
    const m1 = new Map<string, number>();
    const m2 = assignEnemySlot(m1, "");
    expect(m2).toBe(m1);
  });

  it("never assigns past the 5-slot cap", () => {
    let m = new Map<string, number>();
    const names = ["a", "b", "c", "d", "e", "f"];
    for (const n of names) m = assignEnemySlot(m, n);
    expect(m.size).toBe(ENEMY_SLOT_COUNT);
    expect(m.has("f")).toBe(false);
  });

  it("Zeus/Axe counterexample from the gate: Zeus keeps slot e1 (0) across ticks even after Axe (alphabetically first) is seen later", () => {
    // tick1: CV sees only Zeus.
    let enemySlots = new Map<string, number>();
    enemySlots = assignEnemySlot(enemySlots, "npc_dota_hero_zeus");
    let result = buildHeroes(
      null,
      new Map(),
      { region: { x: 0, y: 0, side: 100 }, icon: 0, candidates: [], count: 1, classifier: true,
        detections: [{ label: 1, name: "npc_dota_hero_zeus", x: 1, y: 1, score: 0.9 }] },
      FALLBACK.heroes,
      enemySlots
    );
    expect(result[5].hero).toBe("Zeus"); // e1

    // tick2: CV now sees Axe (alphabetically before Zeus) AND Zeus.
    enemySlots = assignEnemySlot(enemySlots, "npc_dota_hero_axe");
    result = buildHeroes(
      null,
      new Map(),
      { region: { x: 0, y: 0, side: 100 }, icon: 0, candidates: [], count: 2, classifier: true,
        detections: [
          { label: 2, name: "npc_dota_hero_axe", x: 2, y: 2, score: 0.9 },
          { label: 1, name: "npc_dota_hero_zeus", x: 1, y: 1, score: 0.9 }
        ] },
      FALLBACK.heroes,
      enemySlots
    );
    // Zeus must NOT have moved to e2 — the old (buggy) alphabetical re-sort
    // would have put Axe in e1 and bumped Zeus to e2.
    expect(result[5].hero).toBe("Zeus"); // still e1
    expect(result[6].hero).toBe("Axe");  // e2 — the new slot Axe claims
  });
});
