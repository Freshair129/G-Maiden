import { describe, it, expect } from "vitest";
import { buildActivity, MAX_ACTIVITY } from "../buildActivity";
import type { EnemyMissing, SignalAlert } from "../events";
import type { CompanionData } from "../../companion";

type Entry = CompanionData["activity"][number];

describe("buildActivity", () => {
  it("returns prev unchanged (same reference) when event is null", () => {
    const prev: Entry[] = [{ id: "x", at: "00:00:00", text: "seed", tone: "info" }];
    expect(buildActivity(null, 0, 1, prev)).toBe(prev);
  });

  it("prepends a gank-alert entry naming the missing heroes with danger tone >= 65%", () => {
    const gank: SignalAlert = { probability: 0.7, missing_heroes: ["npc_dota_hero_warden"], eta_ms: 4000 };
    const result = buildActivity({ kind: "gank-alert", payload: gank }, 1_000, 1, []);
    expect(result).toHaveLength(1);
    expect(result[0].tone).toBe("danger");
    expect(result[0].text).toContain("70%");
    expect(result[0].text).toContain("Warden");
  });

  it("uses warn tone for gank-alert under 65% probability", () => {
    const gank: SignalAlert = { probability: 0.5, missing_heroes: [], eta_ms: 4000 };
    const result = buildActivity({ kind: "gank-alert", payload: gank }, 1_000, 1, []);
    expect(result[0].tone).toBe("warn");
    expect(result[0].text).toBe("Gank risk 50%");
  });

  it("gank-clear appends a 'good' tone entry", () => {
    const result = buildActivity({ kind: "gank-clear" }, 2_000, 2, []);
    expect(result[0].tone).toBe("good");
    expect(result[0].text).toBe("Gank risk cleared");
  });

  it("enemy-missing appends a 'warn' entry naming the hero", () => {
    const em: EnemyMissing = { hero: "npc_dota_hero_mirage", missing_for_ms: 6000, last_pos: [0.5, 0.5] };
    const result = buildActivity({ kind: "enemy-missing", payload: em }, 3_000, 3, []);
    expect(result[0].tone).toBe("warn");
    expect(result[0].text).toBe("Mirage missing from vision");
  });

  it("prepends new entries most-recent-first", () => {
    let log: Entry[] = [];
    log = buildActivity({ kind: "gank-clear" }, 1_000, 1, log);
    log = buildActivity(
      { kind: "enemy-missing", payload: { hero: "npc_dota_hero_mirage", missing_for_ms: 6000, last_pos: [0, 0] } },
      2_000,
      2,
      log
    );
    expect(log[0].text).toContain("Mirage");
    expect(log[1].text).toBe("Gank risk cleared");
  });

  it("caps the log at MAX_ACTIVITY entries", () => {
    let log: Entry[] = [];
    for (let i = 0; i < MAX_ACTIVITY + 5; i++) {
      log = buildActivity({ kind: "gank-clear" }, i, i, log);
    }
    expect(log).toHaveLength(MAX_ACTIVITY);
  });

  it("ids are deterministic from the seq argument (no Math.random/Date.now inside the builder)", () => {
    const result = buildActivity({ kind: "gank-clear" }, 0, 42, []);
    expect(result[0].id).toBe("act-42");
  });

  it("formats the clock label as HH:MM:SS from atMs", () => {
    const d = new Date(2026, 6, 9, 21, 5, 3);
    const result = buildActivity({ kind: "gank-clear" }, d.getTime(), 1, []);
    expect(result[0].at).toBe("21:05:03");
  });
});
