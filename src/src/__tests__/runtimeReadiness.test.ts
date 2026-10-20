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
  dotaForeground: true,
  layoutStatus: "candidate",
  layoutReason: "image-evidence-required",
  displayWidth: 1920,
  displayHeight: 1080,
  displayDpi: 96,
  monitorCount: 1,
  minimapSide: 292,
  frameAgeMs: 20,
  healthy: false,
};

describe("runtime readiness contract", () => {
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
      sensorHealth: { ...healthySensor, backend: "lite", classifier: false, dotaForeground: false, layoutStatus: "unknown", frameAgeMs: null, healthy: false },
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
