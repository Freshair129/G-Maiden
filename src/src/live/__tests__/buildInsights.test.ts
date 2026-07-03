import { describe, it, expect } from "vitest";
import { buildInsights } from "../buildInsights";
import { NO_SENSOR } from "../buildTelemetry";
import { MOCK } from "../../companion";
import type { OpenDotaProfile } from "../opendota";

const fallback = MOCK.insights;

function makeOd(over: Partial<OpenDotaProfile> = {}): OpenDotaProfile {
  return {
    accountId: 39734272,
    public: true,
    rank: "Legend IV",
    mmr: 5230,
    winRate: 54.2,
    games: 100,
    kda: 3.9,
    mainHero: { name: "Crystal Maiden", games: 88, winRate: 61 },
    baselines: null,
    ...over
  };
}

describe("buildInsights", () => {
  it("od=null returns MOCK unchanged", () => {
    expect(buildInsights(null, fallback)).toBe(fallback);
  });

  it("private profile returns MOCK unchanged", () => {
    expect(buildInsights(makeOd({ public: false }), fallback)).toBe(fallback);
  });

  it("maps MMR -> powerScore and winRate from OpenDota", () => {
    const r = buildInsights(makeOd(), fallback);
    expect(r.powerScore).toBe(5230);
    expect(r.winRate).toBe(54.2);
  });

  it("marks objectiveControl/wardEfficiency as NO_SENSOR (no source)", () => {
    const r = buildInsights(makeOd(), fallback);
    expect(r.objectiveControl).toBe(NO_SENSOR);
    expect(r.wardEfficiency).toBe(NO_SENSOR);
  });

  it("powerScore is NO_SENSOR when MMR is unknown", () => {
    const r = buildInsights(makeOd({ mmr: 0 }), fallback);
    expect(r.powerScore).toBe(NO_SENSOR);
  });

  it("leaves learnedMatches on the fallback (folded in from match logs elsewhere)", () => {
    const r = buildInsights(makeOd(), fallback);
    expect(r.learnedMatches).toBe(fallback.learnedMatches);
  });
});
