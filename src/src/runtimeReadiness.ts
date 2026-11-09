import type { GsiStatus, ResourceStats, SensorHealth } from "./live/events";

export type ReadinessStatus = "ready" | "degraded" | "unknown";
export type RuntimeReadiness = {
  gsi: ReadinessStatus;
  capture: ReadinessStatus;
  minimap: ReadinessStatus;
  overlay: ReadinessStatus;
  audio: ReadinessStatus;
};

export function readinessFromRuntime(input: {
  gsiConfigured: boolean | null;
  gsiStatus: GsiStatus | null;
  sensorHealth: SensorHealth | null;
  overlayReady: boolean | null;
}): RuntimeReadiness {
  const gsi = input.gsiStatus;
  const sensor = input.sensorHealth;

  return {
    gsi: gsi?.server_state === "port_conflict" || gsi?.server_state === "bind_error"
      ? "degraded"
      : gsi?.gsi_active === true && gsi.gsi_freshness === "fresh"
        ? "ready"
        : input.gsiConfigured === false || gsi?.gsi_freshness === "stale" || (gsi?.gsi_active === false && gsi.dota_running)
          ? "degraded"
          : "unknown",
    capture: sensor ? (sensor.healthy ? "ready" : "degraded") : "unknown",
    // A live sensor or loaded classifier is not evidence that the minimap is
    // covered correctly for this user's display and HUD geometry.
    minimap: sensor && (sensor.backend === "lite" || !sensor.classifier) ? "degraded" : "unknown",
    overlay: input.overlayReady === true ? "ready" : "unknown",
    // There is no audio health producer yet. A preview action is not proof of
    // reliable playback, so this remains unknown until a producer is added.
    audio: "unknown",
  };
}

export function compatibilityMode(readiness: RuntimeReadiness): boolean {
  return readiness.minimap === "degraded";
}

export function readinessLabel(status: ReadinessStatus): string {
  switch (status) {
    case "ready": return "พร้อม";
    case "degraded": return "บกพร่อง";
    case "unknown": return "ยังไม่ทราบ";
  }
}

// A latest governor sample is evidence of observation, not whole-match NFR acceptance.
export function resourceReadiness(
  sample: Pick<ResourceStats, "ram_mb" | "cpu_pct" | "over_budget"> | null,
): "unknown" | "degraded" | "observed" {
  if (!sample) return "unknown";
  if (sample.over_budget === true) return "degraded";
  if (sample.ram_mb < 0 && sample.cpu_pct < 0) return "unknown";
  return "observed";
}

export function liteMode(sensor: SensorHealth | null): boolean | null {
  return sensor === null ? null : sensor.backend === "lite";
}
