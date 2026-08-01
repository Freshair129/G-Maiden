import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateBetaWaveEvidence } from "./beta-wave-evidence.mjs";

const common = { operational: { rolloutPause: true, accessRevoke: true, incidentOwner: true, rollbackDrill: true }, privacy: { localData: true, consent: true, secretsExcluded: true, signaturesVerified: true }, knownIssues: "Known issues are severity-classified." };
const wave1 = { approval: { stage: "closed-beta-wave-1", candidate_version: "1.3.0", decision: "PASS", approved_by: "qa", approved_date: "2026-08-01", evidence_links: ["evidence://wave-1"], known_exceptions: [] }, metrics: { approvedTesters: 30, completedMatchSessions: 300, alertUsefulnessPct: 70, falseAlertPct: 15, missedAlertPct: 10, adviceUsefulnessPct: 70, gSignalP99Ms: 300, crashFreeSessionsPct: 99, updateSuccessPct: 95, criticalSecurityPrivacyFindings: 0 }, ...common };
const wave2 = { approval: { stage: "closed-beta-wave-2", candidate_version: "1.4.0", decision: "PASS", approved_by: "qa", approved_date: "2026-08-01", evidence_links: ["evidence://wave-2"], known_exceptions: [] }, metrics: { approvedTesters: 100, completedMatchSessions: 1000, selfServiceInstallPct: 95, firstRunCompletionPct: 90, supportFirstResponseHours: 24, supportResolutionWithinTargetPct: 90, retention14dPct: 60, crashFreeSessionsPct: 99, updateSuccessPct: 98, criticalSecurityPrivacyFindings: 0 }, ...common };

describe("Closed Beta Wave 1 and Wave 2 evidence gates", () => {
  it("accepts Wave 1 thresholds", () => assert.equal(validateBetaWaveEvidence("wave-1", wave1).status, "pass"));
  it("rejects Wave 1 alert quality below threshold", () => assert.throws(() => validateBetaWaveEvidence("wave-1", { ...wave1, metrics: { ...wave1.metrics, missedAlertPct: 10.1 } }), /missedAlertPct/));
  it("accepts Wave 2 scale and support thresholds", () => assert.equal(validateBetaWaveEvidence("wave-2", wave2).status, "pass"));
  it("rejects Wave 2 support response above threshold", () => assert.throws(() => validateBetaWaveEvidence("wave-2", { ...wave2, metrics: { ...wave2.metrics, supportFirstResponseHours: 24.1 } }), /supportFirstResponseHours/));
});
