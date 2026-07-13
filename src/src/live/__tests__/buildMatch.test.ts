import { describe, it, expect } from "vitest";
import { buildMatch } from "../buildMatch";
import { MOCK, formatTimer } from "../../companion";
import type { GameTick, GsiStatus } from "../events";

function makeTick(overrides: Partial<GameTick> = {}): GameTick {
  return {
    in_game: true,
    clock_time: 730,
    game_state: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
    daytime: true,
    radiant_score: 12,
    dire_score: 8,
    gold: 2500,
    net_worth: 14800,
    gpm: 612,
    xpm: 721,
    kills: 5,
    deaths: 2,
    assists: 11,
    last_hits: 214,
    denies: 12,
    hero: "npc_dota_hero_crystal_maiden",
    team_name: "radiant",
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

function makeStatus(overrides: Partial<GsiStatus> = {}): GsiStatus {
  return {
    dota_running: true,
    gsi_active: true,
    in_game: true,
    display_exclusive: false,
    ...overrides
  };
}

describe("buildMatch", () => {
  it("returns base unchanged when tick and status are both null", () => {
    const result = buildMatch(null, null, MOCK.match);
    expect(result).toBe(MOCK.match);
    expect(result).toEqual(MOCK.match);
  });

  it("derives clock via formatTimer(max(0, clock_time)) for a positive clock", () => {
    const tick = makeTick({ clock_time: 730 });
    const result = buildMatch(tick, null, MOCK.match);
    expect(result.clock).toBe(formatTimer(730));
    expect(result.seconds).toBe(730);
  });

  it("clamps clock display to 00:00 on negative clock_time but keeps raw seconds", () => {
    const tick = makeTick({ clock_time: -30 });
    const result = buildMatch(tick, null, MOCK.match);
    expect(result.clock).toBe("00:00");
    expect(result.seconds).toBe(-30);
  });

  it("maps player.cs from tick.last_hits, not a 'cs' field on the tick", () => {
    const tick = makeTick({ last_hits: 214 });
    const result = buildMatch(tick, null, MOCK.match);
    expect(result.player.cs).toBe(tick.last_hits);
  });

  it("sets every *Avg to the flat live value (flat trend)", () => {
    const tick = makeTick();
    const result = buildMatch(tick, null, MOCK.match);
    expect(result.player.nwAvg).toBe(tick.net_worth);
    expect(result.player.gpmAvg).toBe(tick.gpm);
    expect(result.player.xpmAvg).toBe(tick.xpm);
    expect(result.player.kAvg).toBe(tick.kills);
    expect(result.player.dAvg).toBe(tick.deaths);
    expect(result.player.aAvg).toBe(tick.assists);
    expect(result.player.csAvg).toBe(tick.last_hits);
    expect(result.player.deniesAvg).toBe(tick.denies);
  });

  it("formats playerStats.net as a 'k' string for values >= 1000", () => {
    const tick = makeTick({ net_worth: 14800 });
    const result = buildMatch(tick, null, MOCK.match);
    expect(result.playerStats.net).toBe("14.8k");
  });

  it("sets phase 'live' when in_game is true", () => {
    const tick = makeTick({ in_game: true });
    const result = buildMatch(tick, null, MOCK.match);
    expect(result.phase).toBe("live");
  });

  it("sets phase 'pregame' when in_game is false", () => {
    const tick = makeTick({ in_game: false });
    const result = buildMatch(tick, null, MOCK.match);
    expect(result.phase).toBe("pregame");
  });

  it("with status only: gsiOnline mirrors status.gsi_active and other fields fall back to base", () => {
    const status = makeStatus({ gsi_active: true });
    const result = buildMatch(null, status, MOCK.match);
    expect(result.gsiOnline).toBe(true);
    expect(result.clock).toBe(MOCK.match.clock);
    expect(result.seconds).toBe(MOCK.match.seconds);
    expect(result.phase).toBe(MOCK.match.phase);
    expect(result.player).toEqual(MOCK.match.player);
    expect(result.playerStats).toEqual(MOCK.match.playerStats);
  });

  it("with status only and gsi_active false, gsiOnline is false", () => {
    const status = makeStatus({ gsi_active: false });
    const result = buildMatch(null, status, MOCK.match);
    expect(result.gsiOnline).toBe(false);
  });
});
