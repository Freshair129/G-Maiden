import { describe, it, expect } from "vitest";
import { buildWeekly } from "../buildWeekly";
import { MOCK } from "../../companion";
import type { OpenDotaProfile } from "../opendota";

const fallback = MOCK.weeklyReport;

function makeOd(over: Partial<OpenDotaProfile> = {}): OpenDotaProfile {
  return {
    accountId: 39734272,
    public: true,
    rank: "Legend IV",
    mmr: 5000,
    winRate: 57.36,
    games: 100,
    kda: 4.512,
    mainHero: { name: "Crystal Maiden", games: 88, winRate: 61.4 },
    baselines: null,
    ...over
  };
}

describe("buildWeekly", () => {
  it("od=null returns MOCK unchanged", () => {
    expect(buildWeekly(null, fallback)).toBe(fallback);
  });

  it("private profile returns MOCK unchanged", () => {
    expect(buildWeekly(makeOd({ public: false }), fallback)).toBe(fallback);
  });

  it("maps winRate and kd (rounded to 1dp) from OpenDota", () => {
    const r = buildWeekly(makeOd(), fallback);
    expect(r.winRate).toBe(57.4);
    expect(r.kd).toBe(4.5);
  });

  it("surfaces the single main hero, no fabricated pool", () => {
    const r = buildWeekly(makeOd(), fallback);
    expect(r.topHeroes).toHaveLength(1);
    expect(r.topHeroes[0].hero).toBe("Crystal Maiden");
    expect(r.topHeroes[0].games).toBe(88);
    expect(r.topHeroes[0].winRate).toBe(61); // rounded
  });

  it("falls back to MOCK heroes when main hero is unknown", () => {
    const r = buildWeekly(makeOd({ mainHero: { name: "", games: 0, winRate: 0 } }), fallback);
    expect(r.topHeroes).toBe(fallback.topHeroes);
  });
});
