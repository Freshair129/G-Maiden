import { describe, it, expect } from "vitest";
import { rankTierToLabel, resolveAccountId, normalizeOpenDota } from "../opendota";

describe("rankTierToLabel", () => {
  it("54 -> Legend IV", () => {
    expect(rankTierToLabel(54)).toBe("Legend IV");
  });

  it("51 -> Legend I", () => {
    expect(rankTierToLabel(51)).toBe("Legend I");
  });

  it("80 -> Immortal (no star suffix)", () => {
    expect(rankTierToLabel(80)).toBe("Immortal");
  });

  it("15 -> Herald V", () => {
    expect(rankTierToLabel(15)).toBe("Herald V");
  });

  it("0 -> ''", () => {
    expect(rankTierToLabel(0)).toBe("");
  });

  it("null -> ''", () => {
    expect(rankTierToLabel(null)).toBe("");
  });

  it("undefined -> ''", () => {
    expect(rankTierToLabel(undefined)).toBe("");
  });
});

describe("resolveAccountId", () => {
  it("SteamID64 string resolves to 32-bit account id", () => {
    expect(resolveAccountId("76561198000000000")).toBe(39734272);
  });

  it("raw 32-bit id string resolves unchanged", () => {
    expect(resolveAccountId("39734272")).toBe(39734272);
  });

  it("steamcommunity profile URL resolves to 32-bit account id", () => {
    expect(
      resolveAccountId("https://steamcommunity.com/profiles/76561198000000000")
    ).toBe(39734272);
  });

  it("junk string 'abc' -> null", () => {
    expect(resolveAccountId("abc")).toBeNull();
  });

  it("empty string -> null", () => {
    expect(resolveAccountId("")).toBeNull();
  });

  it("number SteamID64 input normalizes to 32-bit id", () => {
    expect(resolveAccountId(76561198000000000)).toBe(39734272);
  });
});

describe("normalizeOpenDota", () => {
  it("player=null returns a locked, zeroed profile with the given accountId", () => {
    const result = normalizeOpenDota(12345, null, null, null, null, (id) => `hero${id}`);
    expect(result).toEqual({
      accountId: 12345,
      public: false,
      rank: "",
      mmr: 0,
      winRate: 0,
      games: 0,
      kda: 0,
      mainHero: { name: "", games: 0, winRate: 0 },
      baselines: null
    });
  });

  it("full inputs map correctly: rank, mmr, winRate, games, baselines, mainHero, kda", () => {
    const player = {
      profile: { account_id: 39734272 },
      rank_tier: 54,
      mmr_estimate: { estimate: 5000 }
    };
    const wl = { win: 60, lose: 40 };
    const recent = [
      { gold_per_min: 600, xp_per_min: 700, kills: 8, deaths: 3, assists: 10, last_hits: 200, denies: 10 },
      { gold_per_min: 500, xp_per_min: 650, kills: 6, deaths: 2, assists: 14, last_hits: 180, denies: 8 },
      { gold_per_min: 550, xp_per_min: 675, kills: 7, deaths: 4, assists: 12, last_hits: 190, denies: 9 }
    ];
    const heroes = [
      { hero_id: 5, games: 100, win: 60 },
      { hero_id: 1, games: 50, win: 20 }
    ];
    const heroName = (id: number) => `hero${id}`;

    const result = normalizeOpenDota(39734272, player, wl, recent, heroes, heroName);

    expect(result.public).toBe(true);
    expect(result.rank).toBe("Legend IV");
    expect(result.mmr).toBe(5000);
    expect(result.winRate).toBe(60);
    expect(result.games).toBe(100);

    // baselines averaged: gpm (600+500+550)/3 = 550
    expect(result.baselines).not.toBeNull();
    expect(result.baselines!.gpmAvg).toBe(550);
    expect(result.baselines!.xpmAvg).toBe(675);
    expect(result.baselines!.sampleSize).toBe(recent.length);

    // main hero = most-played (hero_id 5, 100 games), not first in the array
    expect(result.mainHero).toEqual({ name: "hero5", games: 100, winRate: 60 });

    // kda = round((kAvg + aAvg) / max(1, dAvg), 1)
    const kAvg = Math.round(((8 + 6 + 7) / 3) * 10) / 10; // 7
    const dAvg = Math.round(((3 + 2 + 4) / 3) * 10) / 10; // 3
    const aAvg = Math.round(((10 + 14 + 12) / 3) * 10) / 10; // 12
    const expectedKda = Math.round(((kAvg + aAvg) / Math.max(1, dAvg)) * 10) / 10;
    expect(result.kda).toBe(expectedKda);
  });

  it("recent=[] yields baselines:null", () => {
    const player = { profile: { account_id: 1 }, rank_tier: 54, mmr_estimate: { estimate: 100 } };
    const wl = { win: 1, lose: 1 };
    const result = normalizeOpenDota(1, player, wl, [], [], (id) => `hero${id}`);
    expect(result.baselines).toBeNull();
  });

  it("wl with win+lose=0 yields winRate 0", () => {
    const player = { profile: { account_id: 1 }, rank_tier: 54, mmr_estimate: { estimate: 100 } };
    const wl = { win: 0, lose: 0 };
    const result = normalizeOpenDota(1, player, wl, [], [], (id) => `hero${id}`);
    expect(result.winRate).toBe(0);
    expect(result.games).toBe(0);
  });
});
