import { describe, it, expect } from "vitest";
import { buildSignals } from "../buildSignals";
import { MOCK } from "../../companion";
import type { SignalAlert } from "../events";

function makeGank(overrides: Partial<SignalAlert> = {}): SignalAlert {
  return {
    probability: 0.5,
    missing_heroes: [],
    eta_ms: 3000,
    ...overrides
  };
}

describe("buildSignals", () => {
  it("always returns a 4-item array with the expected labels", () => {
    const result = buildSignals(null, new Map(), MOCK.signals);
    expect(result).toHaveLength(4);
    expect(result.map((s) => s.label)).toEqual([
      "Enemy Missing",
      "Gank Risk",
      "Vision Pressure",
      "Safe Push"
    ]);
  });

  describe("Enemy Missing", () => {
    it("0 missing -> tone 'good', value 'Clear'", () => {
      const result = buildSignals(null, new Map(), MOCK.signals);
      const sig = result.find((s) => s.label === "Enemy Missing")!;
      expect(sig.tone).toBe("good");
      expect(sig.value).toBe("Clear");
    });

    it("1 missing -> tone 'warn', value '1 hero'", () => {
      const missing = new Map<string, number>([["npc_dota_hero_warden", 6000]]);
      const result = buildSignals(null, missing, MOCK.signals);
      const sig = result.find((s) => s.label === "Enemy Missing")!;
      expect(sig.tone).toBe("warn");
      expect(sig.value).toBe("1 hero");
    });

    it("2 missing -> tone 'danger', value '2 heroes'", () => {
      const missing = new Map<string, number>([
        ["npc_dota_hero_warden", 6000],
        ["npc_dota_hero_mirage", 8000]
      ]);
      const result = buildSignals(null, missing, MOCK.signals);
      const sig = result.find((s) => s.label === "Enemy Missing")!;
      expect(sig.tone).toBe("danger");
      expect(sig.value).toBe("2 heroes");
    });
  });

  describe("Gank Risk", () => {
    it("gank=null -> tone 'good', value 'Low'", () => {
      const result = buildSignals(null, new Map(), MOCK.signals);
      const sig = result.find((s) => s.label === "Gank Risk")!;
      expect(sig.tone).toBe("good");
      expect(sig.value).toBe("Low");
    });

    it("probability 0.7 -> tone 'danger', value '70%'", () => {
      const gank = makeGank({ probability: 0.7 });
      const result = buildSignals(gank, new Map(), MOCK.signals);
      const sig = result.find((s) => s.label === "Gank Risk")!;
      expect(sig.tone).toBe("danger");
      expect(sig.value).toBe("70%");
    });

    it("probability 0.5 -> tone 'warn', value '50%'", () => {
      const gank = makeGank({ probability: 0.5 });
      const result = buildSignals(gank, new Map(), MOCK.signals);
      const sig = result.find((s) => s.label === "Gank Risk")!;
      expect(sig.tone).toBe("warn");
      expect(sig.value).toBe("50%");
    });

    it("probability 0.2 -> tone 'good', value '20%'", () => {
      const gank = makeGank({ probability: 0.2 });
      const result = buildSignals(gank, new Map(), MOCK.signals);
      const sig = result.find((s) => s.label === "Gank Risk")!;
      expect(sig.tone).toBe("good");
      expect(sig.value).toBe("20%");
    });
  });

  describe("Vision Pressure", () => {
    it("gank with eta_ms=3000 -> 'ETA 3s'", () => {
      const gank = makeGank({ eta_ms: 3000 });
      const result = buildSignals(gank, new Map(), MOCK.signals);
      const sig = result.find((s) => s.label === "Vision Pressure")!;
      expect(sig.value).toBe("ETA 3s");
    });

    it("gank=null -> 'Stable'", () => {
      const result = buildSignals(null, new Map(), MOCK.signals);
      const sig = result.find((s) => s.label === "Vision Pressure")!;
      expect(sig.value).toBe("Stable");
    });
  });

  describe("Safe Push", () => {
    it("missing.size >= 2 -> tone 'good', value 'Window open'", () => {
      const missing = new Map<string, number>([
        ["npc_dota_hero_warden", 6000],
        ["npc_dota_hero_mirage", 8000]
      ]);
      const result = buildSignals(null, missing, MOCK.signals);
      const sig = result.find((s) => s.label === "Safe Push")!;
      expect(sig.tone).toBe("good");
      expect(sig.value).toBe("Window open");
    });

    it("missing.size < 2 -> tone 'info', value 'Hold'", () => {
      const missing = new Map<string, number>([["npc_dota_hero_warden", 6000]]);
      const result = buildSignals(null, missing, MOCK.signals);
      const sig = result.find((s) => s.label === "Safe Push")!;
      expect(sig.tone).toBe("info");
      expect(sig.value).toBe("Hold");
    });
  });
});
