#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const TARGETS = {
  "wave-1": {
    approvedTesters: (v) => v >= 30,
    completedMatchSessions: (v) => v >= 300,
    alertUsefulnessPct: (v) => v >= 70,
    falseAlertPct: (v) => v <= 15,
    missedAlertPct: (v) => v <= 10,
    adviceUsefulnessPct: (v) => v >= 70,
    gSignalP99Ms: (v) => v <= 300,
    crashFreeSessionsPct: (v) => v >= 99,
    updateSuccessPct: (v) => v >= 95,
    criticalSecurityPrivacyFindings: (v) => v === 0,
  },
  "wave-2": {
    approvedTesters: (v) => v >= 100,
    completedMatchSessions: (v) => v >= 1000,
    selfServiceInstallPct: (v) => v >= 95,
    firstRunCompletionPct: (v) => v >= 90,
    supportFirstResponseHours: (v) => v <= 24,
    supportResolutionWithinTargetPct: (v) => v >= 90,
    retention14dPct: (v) => v >= 60,
    crashFreeSessionsPct: (v) => v >= 99,
    updateSuccessPct: (v) => v >= 98,
    criticalSecurityPrivacyFindings: (v) => v === 0,
  },
};

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value;
}

export function validateBetaWaveEvidence(wave, evidence) {
  const targets = TARGETS[wave];
  if (!targets) throw new Error(`unsupported wave: ${wave}`);
  const approval = object(evidence.approval, "approval");
  if (approval.stage !== `closed-beta-${wave}`) throw new Error("approval.stage is incorrect");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(approval.candidate_version)) throw new Error("candidate_version must be SemVer");
  if (!approval.approved_by || !approval.approved_date || !["PASS", "CONDITIONAL PASS"].includes(approval.decision)) throw new Error("approval is incomplete");
  if (!Array.isArray(approval.evidence_links) || approval.evidence_links.length === 0) throw new Error("evidence_links must not be empty");
  if (approval.decision === "CONDITIONAL PASS" && (!Array.isArray(approval.known_exceptions) || approval.known_exceptions.length === 0)) throw new Error("conditional pass requires known_exceptions");

  const metrics = object(evidence.metrics, "metrics");
  for (const [key, passes] of Object.entries(targets)) if (typeof metrics[key] !== "number" || !Number.isFinite(metrics[key]) || !passes(metrics[key])) throw new Error(`metric failed: ${key}`);
  for (const section of ["operational", "privacy"]) {
    const values = object(evidence[section], section);
    for (const [key, value] of Object.entries(values)) if (value !== true) throw new Error(`${section}.${key} is not passed`);
  }
  if (typeof evidence.knownIssues !== "string" || evidence.knownIssues.trim() === "") throw new Error("knownIssues is required");
  return { wave, candidateVersion: approval.candidate_version, decision: approval.decision, status: "pass" };
}

async function main() {
  const [command, wave, directory] = process.argv.slice(2);
  if (command !== "validate" || !wave || !directory) throw new Error("usage: beta-wave-evidence.mjs validate <wave-1|wave-2> <evidence-directory>");
  const root = resolve(directory);
  const files = Object.fromEntries(await Promise.all(["approval.json", "metrics.json", "operational.json", "privacy.json", "known-issues.md"].map(async (name) => [name, await readFile(resolve(root, name), "utf8")])));
  const result = validateBetaWaveEvidence(wave, { approval: JSON.parse(files["approval.json"]), metrics: JSON.parse(files["metrics.json"]), operational: JSON.parse(files["operational.json"]), privacy: JSON.parse(files["privacy.json"]), knownIssues: files["known-issues.md"] });
  const output = resolve(root, "validation-report.json");
  await writeFile(output, `${JSON.stringify({ ...result, validatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  console.log(`Beta ${wave} evidence valid: ${output}`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/beta-wave-evidence.mjs")) main().catch((error) => { console.error(error.message); process.exit(1); });
