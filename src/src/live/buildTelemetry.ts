// Wire the command-deck telemetry footer to the G-Governor's real
// `resource-stats` samples (governor.rs) instead of the baked MOCK numbers —
// the overlay already reads these, the deck did not.
//
// The governor measures ONLY this process's CPU% and RAM (MB); there is no GPU,
// VRAM, or temperature sensor behind it. Rather than invent those, we mark them
// unavailable with the NO_SENSOR sentinel and the footer renders "—". Pure and
// null-safe: `stats === null` (browser / no Tauri / before the first sample)
// falls through to the full MOCK demo so the standalone deck still looks alive.
import type { ResourceStats } from "./events";
import type { CompanionData } from "../companion";

type Telemetry = CompanionData["telemetry"];

/** Fields the local governor cannot measure. Footer renders these as "—". */
export const NO_SENSOR = -1;

export function buildTelemetry(stats: ResourceStats | null, fallback: Telemetry): Telemetry {
  if (stats === null) return fallback; // demo / no backend — keep the full MOCK
  const ramGb = stats.ram_mb / 1024;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  // GPU/VRAM are bridged from G-Telemetry; a negative value means the bridge
  // isn't running, so we keep NO_SENSOR ("—") rather than showing a fake 0.
  const has = (n: number) => n >= 0;
  return {
    cpuLoad: round1(stats.cpu_pct),
    // CPU temp only comes from the rich G-Telemetry source; the light feeder omits it.
    cpuTemp: has(stats.cpu_temp_c) ? round1(stats.cpu_temp_c) : NO_SENSOR,
    gpuLoad: has(stats.gpu_pct) ? round1(stats.gpu_pct) : NO_SENSOR,
    gpuTemp: has(stats.gpu_temp_c) ? round1(stats.gpu_temp_c) : NO_SENSOR,
    ramLoad: round2(ramGb),
    ramTemp: NO_SENSOR,
    vramLoad: has(stats.vram_used_mb) ? round2(stats.vram_used_mb / 1024) : NO_SENSOR,
    vramTemp: NO_SENSOR,
    ramUsedGb: round2(ramGb),
    ramTotalGb: 400 / 1024, // 400 MB RAM budget (CLAUDE.md NFR)
    vramUsedGb: has(stats.vram_used_mb) ? round2(stats.vram_used_mb / 1024) : NO_SENSOR,
    vramTotalGb: has(stats.vram_total_mb) ? round2(stats.vram_total_mb / 1024) : NO_SENSOR
  };
}
