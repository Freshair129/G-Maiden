import { describe, it, expect } from "vitest";
import { buildHeroes } from "../buildHeroes";
import { MOCK } from "../../companion";
import type { GameTick } from "../events";

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

describe("buildHeroes", () => {
  it("returns base unchanged when tick is null and missing map is empty", () => {
    const result = buildHeroes(null, new Map(), null, MOCK.heroes);
    expect(result).toBe(MOCK.heroes);
  });

  it("updates index-0 ally hero's live stats from tick", () => {
    const tick = makeTick();
    const result = buildHeroes(tick, new Map(), null, MOCK.heroes);
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
    const result = buildHeroes(tick, new Map(), null, MOCK.heroes);
    expect(result[0].state).toBe("dead");
    expect(result[0].timer).toBe(21);
  });

  it("sets state 'visible' and timer=0 when alive is true", () => {
    const tick = makeTick({ alive: true, respawn_seconds: 0 });
    const result = buildHeroes(tick, new Map(), null, MOCK.heroes);
    expect(result[0].state).toBe("visible");
    expect(result[0].timer).toBe(0);
  });

  it("leaves the other nine hero slots unchanged from base", () => {
    const tick = makeTick();
    const result = buildHeroes(tick, new Map(), null, MOCK.heroes);
    for (let i = 1; i < MOCK.heroes.length; i++) {
      expect(result[i]).toEqual(MOCK.heroes[i]);
    }
  });

  it("only overwrites the live hero name on index-0 and preserves profile fields", () => {
    const tick = makeTick();
    const result = buildHeroes(tick, new Map(), null, MOCK.heroes);
    expect(result[0].hero).toBe("Crystal Maiden");
    expect(result[0].player).toBe(MOCK.heroes[0].player);
    expect(result[0].rank).toBe(MOCK.heroes[0].rank);
    expect(result[0].mmr).toBe(MOCK.heroes[0].mmr);
    expect(result[0].profile).toBe(MOCK.heroes[0].profile);
  });

  it("marks a hero 'missing' when a missing-map key's pretty name matches (case-insensitive)", () => {
    // MOCK.heroes[5] ("e1") has hero: "Warden"
    const missing = new Map<string, number>([["npc_dota_hero_warden", 14500]]);
    const result = buildHeroes(null, missing, null, MOCK.heroes);
    const wardenIndex = MOCK.heroes.findIndex((h) => h.hero === "Warden");
    expect(wardenIndex).toBeGreaterThanOrEqual(0);
    expect(result[wardenIndex].state).toBe("missing");
    expect(result[wardenIndex].timer).toBe(Math.round(14500 / 1000));
  });

  it("rounds a non-exact-second missing_for_ms value", () => {
    const missing = new Map<string, number>([["npc_dota_hero_warden", 8600]]);
    const result = buildHeroes(null, missing, null, MOCK.heroes);
    const wardenIndex = MOCK.heroes.findIndex((h) => h.hero === "Warden");
    expect(result[wardenIndex].state).toBe("missing");
    expect(result[wardenIndex].timer).toBe(9); // round(8600/1000) = round(8.6) = 9
  });

  it("does not mutate the base array; only changed entries differ by reference", () => {
    const missing = new Map<string, number>([["npc_dota_hero_warden", 14500]]);
    const result = buildHeroes(null, missing, null, MOCK.heroes);
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
