import { describe, it, expect } from "vitest";
import { buildSignals } from "../buildSignals";
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
  it("always returns a 4-item array with the D/E/F/G labels in order", () => {
    const result = buildSignals(null, new Map(), true);
    expect(result).toHaveLength(4);
    expect(result.map((s) => s.label)).toEqual(["Enemy Missing", "Gank Risk", "Risk Level", "Gank ETA"]);
  });

  describe("D — Enemy Missing", () => {
    it("0 missing -> tone 'good', value 'Clear', bar 0", () => {
      const sig = buildSignals(null, new Map(), true)[0];
      expect(sig.tone).toBe("good");
      expect(sig.value).toBe("Clear");
      expect(sig.barPct).toBe(0);
    });

    it("1 missing -> tone 'warn', value '1 hero'", () => {
      const missing = new Map<string, number>([["npc_dota_hero_warden", 6000]]);
      const sig = buildSignals(null, missing, true)[0];
      expect(sig.tone).toBe("warn");
      expect(sig.value).toBe("1 hero");
      expect(sig.barPct).toBe(20);
    });

    it("2 missing -> tone 'danger', value '2 heroes'", () => {
      const missing = new Map<string, number>([
        ["npc_dota_hero_warden", 6000],
        ["npc_dota_hero_mirage", 8000]
      ]);
      const sig = buildSignals(null, missing, true)[0];
      expect(sig.tone).toBe("danger");
      expect(sig.value).toBe("2 heroes");
      expect(sig.barPct).toBe(40);
    });
  });

  describe("E — Gank Risk", () => {
    it("no alert -> value '—', bar 0 (no invented baseline)", () => {
      const sig = buildSignals(null, new Map(), true)[1];
      expect(sig.value).toBe("—");
      expect(sig.barPct).toBe(0);
    });

    it("probability 0.7 -> tone 'danger', value '70%'", () => {
      const gank = makeGank({ probability: 0.7 });
      const sig = buildSignals(gank, new Map(), true)[1];
      expect(sig.tone).toBe("danger");
      expect(sig.value).toBe("70%");
      expect(sig.barPct).toBe(70);
    });

    it("probability 0.5 -> tone 'warn', value '50%'", () => {
      const gank = makeGank({ probability: 0.5 });
      const sig = buildSignals(gank, new Map(), true)[1];
      expect(sig.tone).toBe("warn");
      expect(sig.value).toBe("50%");
    });

    it("probability 0.2 -> tone 'good', value '20%'", () => {
      const gank = makeGank({ probability: 0.2 });
      const sig = buildSignals(gank, new Map(), true)[1];
      expect(sig.tone).toBe("good");
      expect(sig.value).toBe("20%");
    });
  });

  describe("F — Risk Level (must mirror overlay gmeterLevel tiers)", () => {
    it("no gank, 0 missing -> tier 0 ปลอดภัย, tone good", () => {
      const sig = buildSignals(null, new Map(), true)[2];
      expect(sig.value).toBe("ปลอดภัย");
      expect(sig.tone).toBe("good");
      expect(sig.barPct).toBe(0);
    });

    it("1 missing (no gank) -> tier 1 ระวัง", () => {
      const missing = new Map<string, number>([["npc_dota_hero_warden", 6000]]);
      const sig = buildSignals(null, missing, true)[2];
      expect(sig.value).toBe("ระวัง");
    });

    it("2 missing (no gank) -> tier 2 เสี่ยง", () => {
      const missing = new Map<string, number>([
        ["npc_dota_hero_warden", 6000],
        ["npc_dota_hero_mirage", 8000]
      ]);
      const sig = buildSignals(null, missing, true)[2];
      expect(sig.value).toBe("เสี่ยง");
    });

    it("3 missing (no gank) -> tier 3 อันตราย", () => {
      const missing = new Map<string, number>([
        ["npc_dota_hero_warden", 6000],
        ["npc_dota_hero_mirage", 8000],
        ["npc_dota_hero_oracle", 9000]
      ]);
      const sig = buildSignals(null, missing, true)[2];
      expect(sig.value).toBe("อันตราย");
    });

    it("an active gank alert forces tier 3 อันตราย even with 0 missing", () => {
      const gank = makeGank();
      const sig = buildSignals(gank, new Map(), true)[2];
      expect(sig.value).toBe("อันตราย");
      expect(sig.tone).toBe("danger");
      expect(sig.barPct).toBe(100);
    });
  });

  describe("G — Gank ETA", () => {
    it("no alert -> value '—', bar 0", () => {
      const sig = buildSignals(null, new Map(), true)[3];
      expect(sig.value).toBe("—");
      expect(sig.barPct).toBe(0);
    });

    it("gank with eta_ms=3000 -> '3s'", () => {
      const gank = makeGank({ eta_ms: 3000 });
      const sig = buildSignals(gank, new Map(), true)[3];
      expect(sig.value).toBe("3s");
      expect(sig.tone).toBe("danger"); // <= 5000ms
    });

    it("gank with eta_ms=10000 -> '10s', tone warn (not yet imminent)", () => {
      const gank = makeGank({ eta_ms: 10_000 });
      const sig = buildSignals(gank, new Map(), true)[3];
      expect(sig.value).toBe("10s");
      expect(sig.tone).toBe("warn");
    });
  });

  // The fake-safe regression (audit B3). An empty missing-set means "the CV
  // pipeline saw every enemy" OR "the CV pipeline saw nothing at all" — Lite
  // mode, no ONNX model, a stalled capture. These used to render identically
  // as a green "Clear" / "ปลอดภัย". `sensorOk` is what tells them apart.
  describe("sensor not healthy — must never claim safety", () => {
    it("no gank + dead sensor -> every signal is the '—' sentinel, never 'Clear'", () => {
      const result = buildSignals(null, new Map(), false);
      expect(result.map((s) => s.value)).toEqual(["—", "—", "—", "—"]);
      expect(result.map((s) => s.barPct)).toEqual([0, 0, 0, 0]);
      // tone 'good' is the affirmative-safe colour; it must not appear.
      expect(result.some((s) => s.tone === "good")).toBe(false);
    });

    it("the same inputs with a healthy sensor DO claim safety — proving the gate is what changed", () => {
      const healthy = buildSignals(null, new Map(), true);
      expect(healthy[0].value).toBe("Clear");
      expect(healthy[0].tone).toBe("good");
      expect(healthy[2].value).toBe("ปลอดภัย");
    });

    it("withholds reassurance, never a warning: an active alert still renders", () => {
      const gank = makeGank({ probability: 0.82, eta_ms: 2000 });
      const sig = buildSignals(gank, new Map(), false);
      expect(sig[1].value).toBe("82%");
      expect(sig[1].tone).toBe("danger");
      expect(sig[2].value).toBe("อันตราย");
      expect(sig[3].value).toBe("2s");
    });

    it("a stale missing-set is not reported as fact when the sensor is down", () => {
      const missing = new Map<string, number>([
        ["npc_dota_hero_warden", 6000],
        ["npc_dota_hero_mirage", 8000]
      ]);
      const sig = buildSignals(null, missing, false)[0];
      expect(sig.value).toBe("—");
    });
  });
});
