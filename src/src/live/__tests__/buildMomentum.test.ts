import { describe, it, expect } from "vitest";
import { gamePhase, stepMomentum, momentumView, EMPTY_MOMENTUM } from "../buildMomentum";
import type { GameTick } from "../events";

function makeTick(overrides: Partial<GameTick> = {}): GameTick {
  return {
    in_game: true,
    clock_time: 300,
    game_state: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
    daytime: true,
    radiant_score: 0,
    dire_score: 0,
    gold: 0,
    net_worth: 0,
    gpm: 500,
    xpm: 500,
    kills: 0,
    deaths: 0,
    assists: 0,
    last_hits: 0,
    denies: 0,
    hero: "npc_dota_hero_crystal_maiden",
    team_name: "radiant",
    level: 1,
    alive: true,
    hp_percent: 100,
    mana_percent: 100,
    buyback_cost: 0,
    respawn_seconds: 0,
    kill_list_len: 0,
    last_victim_slot: 0,
    ...overrides,
  };
}

describe("gamePhase", () => {
  it("splits on clock: pregame / laning / mid / late", () => {
    expect(gamePhase(-1)).toBe("pregame");
    expect(gamePhase(0)).toBe("laning");
    expect(gamePhase(599)).toBe("laning");
    expect(gamePhase(600)).toBe("mid");
    expect(gamePhase(1499)).toBe("mid");
    expect(gamePhase(1500)).toBe("late");
  });
});

describe("stepMomentum", () => {
  it("is positive when our team leads in kills", () => {
    const m = stepMomentum(EMPTY_MOMENTUM, makeTick({ radiant_score: 10, dire_score: 3 }), 500);
    expect(m.ewma).toBeGreaterThan(0);
    expect(m.seeded).toBe(true);
  });

  it("is negative when our team is behind", () => {
    const m = stepMomentum(EMPTY_MOMENTUM, makeTick({ radiant_score: 3, dire_score: 10 }), 500);
    expect(m.ewma).toBeLessThan(0);
  });

  it("flips sign with team_name (dire perspective)", () => {
    const asDire = stepMomentum(
      EMPTY_MOMENTUM,
      makeTick({ team_name: "dire", radiant_score: 10, dire_score: 3 }),
      500
    );
    expect(asDire.ewma).toBeLessThan(0); // radiant ahead = bad for dire
  });

  it("resets to empty when not in game", () => {
    const seeded = stepMomentum(EMPTY_MOMENTUM, makeTick({ radiant_score: 10 }), 500);
    const out = stepMomentum(seeded, makeTick({ in_game: false }), 500);
    expect(out).toEqual(EMPTY_MOMENTUM);
  });

  it("rewards a fresh teamfight swing more than a stale equal lead", () => {
    // seed even, then jump +4 kills in one tick — the swing term should push high
    const even = stepMomentum(EMPTY_MOMENTUM, makeTick({ radiant_score: 5, dire_score: 5 }), 500);
    const swung = stepMomentum(even, makeTick({ radiant_score: 9, dire_score: 5 }), 500);
    expect(swung.ewma).toBeGreaterThan(even.ewma);
  });
});

describe("momentumView", () => {
  it("labels a strong lead as ahead (good tone)", () => {
    const state = { ewma: 60, lastDiff: 6, seeded: true };
    const v = momentumView(state, makeTick({ clock_time: 800 }));
    expect(v.tone).toBe("good");
    expect(v.phase).toBe("mid");
    expect(v.value).toBe(60);
  });

  it("labels a deficit as behind (danger tone)", () => {
    const v = momentumView({ ewma: -40, lastDiff: -4, seeded: true }, makeTick());
    expect(v.tone).toBe("danger");
  });

  it("stays neutral near even", () => {
    const v = momentumView({ ewma: 5, lastDiff: 0, seeded: true }, makeTick());
    expect(v.tone).toBe("info");
  });
});
