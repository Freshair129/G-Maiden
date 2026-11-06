// Wire the command-deck telemetry footer to the G-Governor's real
// `resource-stats` samples (governor.rs) instead of the baked MOCK numbers —
// the overlay already reads these, the deck did not.
//
// The governor reports whole-app CPU and aggregate full Working Set RAM (MB);
// there is no GPU, VRAM, or temperature sensor behind it. If job containment or
// accounting is unavailable, the affected value stays at NO_SENSOR and renders "—".
// It is pure and null-safe: `stats === null` (browser / no Tauri / before the first sample)
// falls through to the full MOCK demo so the standalone deck still looks alive.
import type { ResourceStats } from "./events";
import type { CompanionData } from "../companion";
import { RAM_BUDGET_MB } from "../app/resourceBudget";

type Telemetry = CompanionData["telemetry"];

/** Fields the local governor cannot measure. Footer renders these as "—". */
export const NO_SENSOR = -1;

export function buildTelemetry(stats: ResourceStats | null, fallback: Telemetry): Telemetry {
  if (stats === null) return fallback; // demo / no backend — keep the full MOCK
  const ramAvailable = Number.isFinite(stats.ram_mb) && stats.ram_mb >= 0;
  const ramGb = ramAvailable ? stats.ram_mb / 1024 : NO_SENSOR;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  // GPU/VRAM are bridged from G-Telemetry; a negative value means the bridge
  // isn't running, so we keep NO_SENSOR ("—") rather than showing a fake 0.
  const has = (n: number) => n >= 0;
  return {
    cpuLoad: has(stats.cpu_pct) ? round1(stats.cpu_pct) : NO_SENSOR,
    // CPU temp only comes from the rich G-Telemetry source; the light feeder omits it.
    cpuTemp: has(stats.cpu_temp_c) ? round1(stats.cpu_temp_c) : NO_SENSOR,
    gpuLoad: has(stats.gpu_pct) ? round1(stats.gpu_pct) : NO_SENSOR,
    gpuTemp: has(stats.gpu_temp_c) ? round1(stats.gpu_temp_c) : NO_SENSOR,
    ramLoad: round2(ramGb),
    ramTemp: NO_SENSOR,
    vramLoad: has(stats.vram_used_mb) ? round2(stats.vram_used_mb / 1024) : NO_SENSOR,
    vramTemp: NO_SENSOR,
    ramUsedGb: round2(ramGb),
    ramTotalGb: RAM_BUDGET_MB / 1024,
    vramUsedGb: has(stats.vram_used_mb) ? round2(stats.vram_used_mb / 1024) : NO_SENSOR,
    vramTotalGb: has(stats.vram_total_mb) ? round2(stats.vram_total_mb / 1024) : NO_SENSOR
  };
}
