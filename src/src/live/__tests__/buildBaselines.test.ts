import { describe, it, expect } from "vitest";
import { buildBaselines } from "../buildBaselines";
import { MOCK } from "../../companion";
import type { OpenDotaProfile } from "../opendota";

const base = MOCK.match.player;

function makeOd(baselines: OpenDotaProfile["baselines"]): OpenDotaProfile {
  return {
    accountId: 39734272,
    public: true,
    rank: "Legend IV",
    mmr: 5000,
    winRate: 60,
    games: 100,
    kda: 4.5,
    mainHero: { name: "hero5", games: 100, winRate: 60 },
    baselines
  };
}

describe("buildBaselines", () => {
  it("od=null returns base unchanged", () => {
    const result = buildBaselines(base, null);
    expect(result).toBe(base);
    expect(result).toEqual(base);
  });

  it("od.baselines=null returns base unchanged", () => {
    const od = makeOd(null);
    const result = buildBaselines(base, od);
    expect(result).toBe(base);
    expect(result).toEqual(base);
  });

  it("overrides *Avg fields from od.baselines, leaves nwAvg and live fields unchanged", () => {
    const od = makeOd({
      gpmAvg: 550,
      xpmAvg: 675,
      kAvg: 7,
      dAvg: 3,
      aAvg: 12,
      csAvg: 190,
      deniesAvg: 9,
      sampleSize: 3
    });
    const result = buildBaselines(base, od);

    expect(result.gpmAvg).toBe(550);
    expect(result.xpmAvg).toBe(675);
    expect(result.kAvg).toBe(7);
    expect(result.dAvg).toBe(3);
    expect(result.aAvg).toBe(12);
    expect(result.csAvg).toBe(190);
    expect(result.deniesAvg).toBe(9);

    // nwAvg untouched — OpenDota has no net-worth baseline
    expect(result.nwAvg).toBe(base.nwAvg);

    // live fields untouched
    expect(result.nw).toBe(base.nw);
    expect(result.gpm).toBe(base.gpm);
    expect(result.xpm).toBe(base.xpm);
    expect(result.k).toBe(base.k);
    expect(result.d).toBe(base.d);
    expect(result.a).toBe(base.a);
    expect(result.cs).toBe(base.cs);
    expect(result.denies).toBe(base.denies);
    expect(result.ping).toBe(base.ping);
  });

  it("does not mutate base", () => {
    const baseCopy = { ...base };
    const od = makeOd({
      gpmAvg: 1, xpmAvg: 1, kAvg: 1, dAvg: 1, aAvg: 1, csAvg: 1, deniesAvg: 1, sampleSize: 1
    });
    buildBaselines(base, od);
    expect(base).toEqual(baseCopy);
  });
});
