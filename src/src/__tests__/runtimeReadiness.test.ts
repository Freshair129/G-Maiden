import { describe, expect, it } from "vitest";
import { compatibilityMode, readinessFromRuntime } from "../runtimeReadiness";
import type { GsiStatus, SensorHealth } from "../live/events";

const liveGsi: GsiStatus = {
  dota_running: true,
  gsi_active: true,
  gsi_freshness: "fresh",
  gsi_age_ms: 0,
  in_game: true,
  display_exclusive: false,
  server_state: "listening",
};

const healthySensor: SensorHealth = {
  backend: "dxgi",
  classifier: true,
  throttled: false,
  frameAgeMs: 20,
  healthy: true,
};

describe("runtime readiness contract", () => {
  it.each(["stale", "waiting", "unavailable"] as const)("does not pass %s GSI even if an active flag remains set", (gsi_freshness) => {
    const readiness = readinessFromRuntime({
      gsiConfigured: true,
      gsiStatus: { ...liveGsi, gsi_freshness },
      sensorHealth: null,
      overlayReady: null,
    });
    expect(readiness.gsi).toBe(gsi_freshness === "stale" ? "degraded" : "unknown");
  });

  it("uses live producer evidence and leaves unmeasured coverage/audio unknown", () => {
    const readiness = readinessFromRuntime({
      gsiConfigured: true,
      gsiStatus: liveGsi,
      sensorHealth: healthySensor,
      overlayReady: true,
    });

    expect(readiness).toEqual({
      gsi: "ready",
      capture: "ready",
      minimap: "unknown",
      overlay: "ready",
      audio: "unknown",
    });
    expect(compatibilityMode(readiness)).toBe(false);
  });

  it("keeps absent and negative-only evidence unknown instead of passing", () => {
    const readiness = readinessFromRuntime({
      gsiConfigured: null,
      gsiStatus: null,
      sensorHealth: null,
      overlayReady: false,
    });

    expect(readiness).toEqual({
      gsi: "unknown",
      capture: "unknown",
      minimap: "unknown",
      overlay: "unknown",
      audio: "unknown",
    });
    expect(compatibilityMode(readiness)).toBe(false);
  });

  it("reports known Lite mode and missing classifier as degraded vision", () => {
    const readiness = readinessFromRuntime({
      gsiConfigured: true,
      gsiStatus: { ...liveGsi, gsi_active: false },
      sensorHealth: { ...healthySensor, backend: "lite", classifier: false, frameAgeMs: null, healthy: false },
      overlayReady: null,
    });

    expect(readiness).toMatchObject({ gsi: "degraded", capture: "degraded", minimap: "degraded", overlay: "unknown", audio: "unknown" });
    expect(compatibilityMode(readiness)).toBe(true);
  });

  it("does not treat a loaded classifier or live capture as minimap coverage", () => {
    const readiness = readinessFromRuntime({
      gsiConfigured: true,
      gsiStatus: liveGsi,
      sensorHealth: healthySensor,
      overlayReady: null,
    });

    expect(readiness.minimap).toBe("unknown");
  });

});
