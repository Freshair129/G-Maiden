import { describe, expect, it } from "vitest";
import { buildDiagnosticBundle, buildFeedback, compatibilityMode, readinessFromRuntime } from "../betaReadiness";
import type { GsiStatus, SensorHealth } from "../live/events";

const liveGsi: GsiStatus = {
  dota_running: true,
  gsi_active: true,
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

  it("records the honest states in the diagnostic schema and requires consent for feedback", () => {
    const readiness = readinessFromRuntime({ gsiConfigured: null, gsiStatus: null, sensorHealth: null, overlayReady: null });
    const bundle = buildDiagnosticBundle({ version: "0.13.0", channel: "stable", readiness, updateStatus: "current", userNote: "test" });

    expect(bundle.schemaVersion).toBe(2);
    expect(bundle.readiness).toEqual({ gsi: "unknown", capture: "unknown", minimap: "unknown", overlay: "unknown", audio: "unknown" });
    expect(bundle.privacy).toEqual({ rawFramesIncluded: false, credentialsIncluded: false, tokensIncluded: false });
    expect(() => buildFeedback({ category: "capture", description: "unknown", diagnostics: bundle, consent: false })).toThrow(/consent/);
  });
});
