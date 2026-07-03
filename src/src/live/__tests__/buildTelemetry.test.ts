import { describe, it, expect } from "vitest";
import { buildTelemetry, NO_SENSOR } from "../buildTelemetry";
import type { ResourceStats } from "../events";
import { MOCK } from "../../companion";

const fallback = MOCK.telemetry;

// Base sample with the GPU bridge ABSENT (-1 sentinels), like the governor emits
// when G-Telemetry isn't running. Individual tests override what they exercise.
function stats(over: Partial<ResourceStats> = {}): ResourceStats {
  return {
    cpu_pct: 1.7, ram_mb: 384, over_budget: false,
    gpu_pct: -1, gpu_temp_c: -1, vram_used_mb: -1, vram_total_mb: -1,
    ...over
  };
}

describe("buildTelemetry", () => {
  it("stats=null returns the MOCK demo unchanged", () => {
    expect(buildTelemetry(null, fallback)).toBe(fallback);
  });

  it("maps real cpu%/ram from the governor sample", () => {
    const result = buildTelemetry(stats(), fallback);
    expect(result.cpuLoad).toBe(1.7);
    expect(result.ramUsedGb).toBeCloseTo(0.38, 2); // 384 MB
    expect(result.ramTotalGb).toBeCloseTo(400 / 1024, 5);
  });

  it("marks GPU/VRAM/temps as NO_SENSOR when the bridge is absent", () => {
    const result = buildTelemetry(stats(), fallback);
    expect(result.cpuTemp).toBe(NO_SENSOR);
    expect(result.gpuLoad).toBe(NO_SENSOR);
    expect(result.gpuTemp).toBe(NO_SENSOR);
    expect(result.vramUsedGb).toBe(NO_SENSOR);
    expect(result.vramTotalGb).toBe(NO_SENSOR);
    expect(result.ramTemp).toBe(NO_SENSOR);
  });

  it("uses real GPU/VRAM when the G-Telemetry bridge provides them", () => {
    const result = buildTelemetry(
      stats({ gpu_pct: 42.5, gpu_temp_c: 63, vram_used_mb: 3072, vram_total_mb: 8192 }),
      fallback
    );
    expect(result.gpuLoad).toBe(42.5);
    expect(result.gpuTemp).toBe(63);
    expect(result.vramUsedGb).toBeCloseTo(3, 2);  // 3072 MB -> 3 GB
    expect(result.vramTotalGb).toBeCloseTo(8, 2);  // 8192 MB -> 8 GB
  });

  it("does not mutate the fallback", () => {
    const copy = { ...fallback };
    buildTelemetry(stats({ ram_mb: 100 }), fallback);
    expect(fallback).toEqual(copy);
  });
});
