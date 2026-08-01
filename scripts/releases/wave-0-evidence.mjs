#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const METRIC_TARGETS = {
  approvedTesters: (v) => v >= 20,
  completedMatchSessions: (v) => v >= 100,
  installerSuccessPct: (v) => v >= 95,
  firstRunCompletionPct: (v) => v >= 90,
  gsiConnectionSuccessPct: (v) => v >= 95,
  dxgiCaptureSuccessPct: (v) => v >= 90,
  minimapReadinessPct: (v) => v >= 85,
  crashFreeSessionsPct: (v) => v >= 99,
  matchWithoutRestartPct: (v) => v >= 90,
  updateSuccessPct: (v) => v >= 95,
  diagnosticBundleSuccessPct: (v) => v >= 95,
  gSignalP99Ms: (v) => v <= 300,
  backgroundCpuPct: (v) => v <= 2.5,
  applicationRamMb: (v) => v <= 400,
  dotaFpsImpactPct: (v) => v <= 3,
  criticalSecurityPrivacyFindings: (v) => v === 0,
};

const REQUIRED_COVERAGE = [
  "windows10", "windows11", "resolution1080p", "resolution1440p", "ultrawide",
  "singleMonitor", "multiMonitor", "borderless", "windowed", "exclusiveFullscreenFallback", "nvidiaGpuGenerations",
];

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value;
}

export function validateWave0Evidence(evidence) {
  const approval = requireObject(evidence.approval, "approval");
  if (approval.stage !== "closed-beta-wave-0") throw new Error("approval.stage must be closed-beta-wave-0");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(approval.candidate_version)) throw new Error("approval.candidate_version must be SemVer");
  if (!approval.approved_by || !approval.approved_date || !["PASS", "CONDITIONAL PASS"].includes(approval.decision)) throw new Error("approval decision is incomplete");
  if (!Array.isArray(approval.evidence_links) || approval.evidence_links.length === 0) throw new Error("approval.evidence_links must not be empty");
  if (approval.decision === "CONDITIONAL PASS" && (!Array.isArray(approval.known_exceptions) || approval.known_exceptions.length === 0)) throw new Error("conditional pass requires known_exceptions");

  const metrics = requireObject(evidence.metrics, "metrics");
  for (const [key, passes] of Object.entries(METRIC_TARGETS)) {
    if (typeof metrics[key] !== "number" || !Number.isFinite(metrics[key]) || !passes(metrics[key])) throw new Error(`metric failed: ${key}`);
  }

  const coverage = requireObject(evidence.coverage, "coverage");
  for (const key of REQUIRED_COVERAGE) {
    if (coverage[key] !== "pass" && !(key === "ultrawide" && coverage[key] === "unsupported")) throw new Error(`coverage incomplete: ${key}`);
  }

  for (const section of ["operational", "privacy"]) {
    const values = requireObject(evidence[section], section);
    for (const [key, value] of Object.entries(values)) if (value !== true) throw new Error(`${section}.${key} is not passed`);
  }
  if (!evidence.knownIssues || typeof evidence.knownIssues !== "string" || evidence.knownIssues.trim().length === 0) throw new Error("knownIssues is required");
  return { stage: approval.stage, candidateVersion: approval.candidate_version, decision: approval.decision, status: "pass" };
}

async function main() {
  const [command, directory] = process.argv.slice(2);
  if (command !== "validate" || !directory) throw new Error("usage: wave-0-evidence.mjs validate <evidence-directory>");
  const root = resolve(directory);
  const names = ["approval.json", "metrics.json", "coverage.json", "operational.json", "privacy.json", "known-issues.md"];
  const files = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await readFile(resolve(root, name), "utf8")])));
  const result = validateWave0Evidence({
    approval: JSON.parse(files["approval.json"]),
    metrics: JSON.parse(files["metrics.json"]),
    coverage: JSON.parse(files["coverage.json"]),
    operational: JSON.parse(files["operational.json"]),
    privacy: JSON.parse(files["privacy.json"]),
    knownIssues: files["known-issues.md"],
  });
  const output = resolve(root, "validation-report.json");
  await writeFile(output, `${JSON.stringify({ ...result, validatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  console.log(`Wave 0 evidence valid: ${output}`);
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/wave-0-evidence.mjs")) main().catch((error) => { console.error(error.message); process.exit(1); });
