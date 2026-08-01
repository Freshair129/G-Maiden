import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateWave0Evidence } from "./wave-0-evidence.mjs";

const metrics = {
  approvedTesters: 20, completedMatchSessions: 100, installerSuccessPct: 95, firstRunCompletionPct: 90,
  gsiConnectionSuccessPct: 95, dxgiCaptureSuccessPct: 90, minimapReadinessPct: 85, crashFreeSessionsPct: 99,
  matchWithoutRestartPct: 90, updateSuccessPct: 95, diagnosticBundleSuccessPct: 95, gSignalP99Ms: 300,
  backgroundCpuPct: 2.5, applicationRamMb: 400, dotaFpsImpactPct: 3, criticalSecurityPrivacyFindings: 0,
};
const coverage = Object.fromEntries(["windows10", "windows11", "resolution1080p", "resolution1440p", "ultrawide", "singleMonitor", "multiMonitor", "borderless", "windowed", "exclusiveFullscreenFallback", "nvidiaGpuGenerations"].map((key) => [key, "pass"]));
const base = {
  approval: { stage: "closed-beta-wave-0", candidate_version: "1.2.3", decision: "PASS", approved_by: "qa", approved_date: "2026-08-01", known_exceptions: [], evidence_links: ["https://example.test/evidence"] },
  metrics, coverage,
  operational: { rolloutCanPause: true, accessCanRevoke: true, stableIsolation: true, rollbackDrill: true },
  privacy: { matchDataLocal: true, framesNotUploaded: true, diagnosticConsent: true, secretsExcluded: true, signaturesVerified: true, noInjection: true },
  knownIssues: "No unresolved S0/S1 issues.",
};

describe("Wave 0 evidence gate", () => {
  it("accepts a complete evidence packet", () => assert.equal(validateWave0Evidence(base).status, "pass"));
  it("rejects a metric below the entry threshold", () => assert.throws(() => validateWave0Evidence({ ...base, metrics: { ...metrics, updateSuccessPct: 94.9 } }), /updateSuccessPct/));
  it("rejects incomplete coverage", () => assert.throws(() => validateWave0Evidence({ ...base, coverage: { ...coverage, windows10: "pending" } }), /windows10/));
  it("requires exceptions for Conditional Pass", () => assert.throws(() => validateWave0Evidence({ ...base, approval: { ...base.approval, decision: "CONDITIONAL PASS", known_exceptions: [] } }), /known_exceptions/));
});
