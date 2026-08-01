import { describe, expect, it } from "vitest";
import { buildDiagnosticBundle, buildFeedback, compatibilityMode, readinessFromRuntime } from "../betaReadiness";

describe("Closed Beta Wave 0 readiness", () => {
  it("marks DXGI and GSI as ready while audio remains explicit", () => {
    const readiness = readinessFromRuntime({ gsiInstalled: true, gsiActive: true, captureMode: "dxgi", minimapReady: true, audioReady: null });
    expect(readiness).toMatchObject({ gsi: "pass", capture: "pass", minimap: "pass", overlay: "pass", audio: "pending" });
    expect(compatibilityMode(readiness)).toBe(false);
  });
  it("discloses Lite mode instead of claiming vision readiness", () => {
    const readiness = readinessFromRuntime({ gsiInstalled: true, gsiActive: true, captureMode: "lite", minimapReady: false, audioReady: true });
    expect(compatibilityMode(readiness)).toBe(true);
  });
  it("redacts sensitive diagnostic classes by construction", () => {
    const bundle = buildDiagnosticBundle({ version: "0.13.0", channel: "closed-beta", readiness: readinessFromRuntime({ gsiInstalled: true, gsiActive: true, captureMode: "lite", minimapReady: false, audioReady: true }), updateStatus: "current", userNote: "test" });
    expect(bundle.privacy).toEqual({ rawFramesIncluded: false, credentialsIncluded: false, tokensIncluded: false });
    expect(() => buildFeedback({ category: "capture", description: "lite", diagnostics: bundle, consent: false })).toThrow(/consent/);
  });
});
