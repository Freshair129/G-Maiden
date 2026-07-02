import { describe, it, expect } from "vitest";
import { buildProfile } from "../buildProfile";
import { MOCK } from "../../companion";
import type { OpenDotaProfile } from "../opendota";

const base = MOCK.heroes[0].profile;

function makeOd(overrides: Partial<OpenDotaProfile> = {}): OpenDotaProfile {
  return {
    accountId: 39734272,
    public: true,
    rank: "Legend IV",
    mmr: 5000,
    winRate: 60,
    games: 100,
    kda: 4.5,
    mainHero: { name: "hero5", games: 100, winRate: 60 },
    baselines: null,
    ...overrides
  };
}

describe("buildProfile", () => {
  it("od=null returns base unchanged", () => {
    const result = buildProfile(null, base);
    expect(result).toBe(base);
    expect(result).toEqual(base);
  });

  it("od.public=false locks the card but keeps other base fields intact", () => {
    const od = makeOd({ public: false });
    const result = buildProfile(od, base);
    expect(result).toEqual({ ...base, public: false });
    expect(result.behavior).toBe(base.behavior);
    expect(result.role).toBe(base.role);
  });

  it("od.public=true overlays winRate/games/kda/mainHero from od, keeps behavior/role from base", () => {
    const od = makeOd();
    const result = buildProfile(od, base);
    expect(result.public).toBe(true);
    expect(result.winRate).toBe(od.winRate);
    expect(result.games).toBe(od.games);
    expect(result.kda).toBe(od.kda);
    expect(result.mainHero).toEqual(od.mainHero);
    expect(result.behavior).toBe(base.behavior);
    expect(result.role).toBe(base.role);
  });

  it("hours falls back to base.hours when od.hours is undefined", () => {
    const od = makeOd(); // hours left undefined
    const result = buildProfile(od, base);
    expect(result.hours).toBe(base.hours);
  });

  it("does not mutate base", () => {
    const baseCopy = { ...base, mainHero: { ...base.mainHero } };
    const od = makeOd();
    buildProfile(od, base);
    expect(base).toEqual(baseCopy);
  });
});
