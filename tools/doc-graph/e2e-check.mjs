#!/usr/bin/env node
/**
 * G1-T6 — E2E check for the doc-graph scanner against the REAL repo.
 *
 * Runs `node tools/doc-graph/scan.mjs` at the repo root (as a real child
 * process, not an in-process require) and asserts:
 *   1. it exits without throwing (scan.mjs's own violation exit(1) is fine —
 *      only a crash / non-{0,1} exit / timeout is a check failure)
 *   2. it finishes in <30s
 *   3. both docs/DOC-GRAPH.json and docs/DOC-GRAPH-REPORT.md were written
 *      (freshly, i.e. mtime >= the moment scan.mjs was launched)
 *   4. `git status --porcelain` shows no modified/untracked files outside
 *      tools/doc-graph/**, docs/DOC-GRAPH.json, docs/DOC-GRAPH-REPORT.md —
 *      SCOPE-AWARE per the epic's dirty-tree rule: pre-existing dirt outside
 *      docs/** and tools/** (e.g. a parallel session's orchestration/docs
 *      edits) is tolerated and only recorded, never treated as a violation.
 *
 * Prints the scan's own summary line (node/edge/violation totals) verbatim
 * so the run output captures real numbers, then exits 0/1 for CI.
 *
 * Usage: node tools/doc-graph/e2e-check.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SCAN = join(HERE, "scan.mjs");
const GRAPH_JSON = join(REPO_ROOT, "docs", "DOC-GRAPH.json");
const REPORT_MD = join(REPO_ROOT, "docs", "DOC-GRAPH-REPORT.md");
const TIMEOUT_MS = 30_000;

const IN_SCOPE_PREFIXES = ["tools/doc-graph/"];
const IN_SCOPE_EXACT = ["docs/DOC-GRAPH.json", "docs/DOC-GRAPH-REPORT.md"];
const WATCHED_PREFIXES = ["docs/", "tools/"]; // dirt here (outside the allowlist above) is a real violation

function isInScope(relPath) {
  const p = relPath.replace(/\\/g, "/");
  if (IN_SCOPE_EXACT.includes(p)) return true;
  return IN_SCOPE_PREFIXES.some((pre) => p.startsWith(pre));
}

function isWatched(relPath) {
  const p = relPath.replace(/\\/g, "/");
  return WATCHED_PREFIXES.some((pre) => p.startsWith(pre));
}

function runScan() {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [SCAN], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({ crashed: true, error: err, stdout, stderr, durationMs: Date.now() - startedAt, timedOut });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({
        crashed: false,
        code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    });
  });
}

function gitStatusPorcelain() {
  const out = execFileSync("git", ["status", "--porcelain"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  return out
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.length > 0)
    .map((l) => ({ raw: l, path: l.slice(3) }));
}

async function main() {
  console.log(`[e2e-check] launching: node ${SCAN}`);
  const launchedAt = Date.now();
  const result = await runScan();

  if (result.crashed) {
    console.error(`[e2e-check] FAIL: scan.mjs failed to launch: ${result.error}`);
    process.exit(1);
  }
  if (result.timedOut) {
    console.error(`[e2e-check] FAIL: scan.mjs exceeded ${TIMEOUT_MS}ms budget (killed).`);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`[e2e-check] FAIL: scan.mjs terminated by signal ${result.signal}. stderr:\n${result.stderr}`);
    process.exit(1);
  }
  if (result.code !== 0 && result.code !== 1) {
    // Any exit code other than 0 (clean) or 1 (violations found) is a real crash,
    // not the scanner doing its job.
    console.error(`[e2e-check] FAIL: scan.mjs exited with unexpected code ${result.code}. stderr:\n${result.stderr}`);
    process.exit(1);
  }
  if (result.durationMs >= TIMEOUT_MS) {
    console.error(`[e2e-check] FAIL: scan.mjs took ${result.durationMs}ms (budget ${TIMEOUT_MS}ms).`);
    process.exit(1);
  }

  console.log(`[e2e-check] scan.mjs exited ${result.code} in ${result.durationMs}ms`);
  if (result.stdout.trim()) console.log(`[e2e-check] scan.mjs stdout:\n${result.stdout.trim()}`);
  if (result.stderr.trim()) console.log(`[e2e-check] scan.mjs stderr:\n${result.stderr.trim()}`);

  let artifactsOk = true;
  for (const [label, p] of [
    ["docs/DOC-GRAPH.json", GRAPH_JSON],
    ["docs/DOC-GRAPH-REPORT.md", REPORT_MD],
  ]) {
    if (!existsSync(p)) {
      console.error(`[e2e-check] FAIL: missing artifact ${label}`);
      artifactsOk = false;
      continue;
    }
    const mtimeMs = statSync(p).mtimeMs;
    if (mtimeMs < launchedAt - 1000) {
      // small slack for filesystem/clock resolution
      console.error(`[e2e-check] FAIL: ${label} exists but was not freshly written by this run (mtime=${new Date(mtimeMs).toISOString()})`);
      artifactsOk = false;
    }
  }
  if (!artifactsOk) process.exit(1);
  console.log("[e2e-check] both artifacts present and freshly written.");

  // violation totals, verbatim from the artifact scan.mjs just wrote
  try {
    const graph = JSON.parse(await (await import("node:fs/promises")).readFile(GRAPH_JSON, "utf8"));
    console.log(
      `[e2e-check] totals: nodes=${graph.nodes?.length ?? "?"} edges=${graph.edges?.length ?? "?"} violations=${graph.violations?.length ?? "?"}`
    );
  } catch (err) {
    console.error(`[e2e-check] WARN: could not parse ${GRAPH_JSON} for totals: ${err}`);
  }

  const entries = gitStatusPorcelain();
  const outOfScopeButWatched = [];
  const tolerated = [];
  for (const e of entries) {
    if (isInScope(e.path)) continue;
    if (isWatched(e.path)) {
      outOfScopeButWatched.push(e);
    } else {
      tolerated.push(e);
    }
  }

  if (tolerated.length > 0) {
    console.log(
      `[e2e-check] INFO: ${tolerated.length} pre-existing dirty file(s) outside docs/** and tools/** — tolerated per scope-aware dirty-tree rule, recorded verbatim:`
    );
    for (const e of tolerated) console.log(`  ${e.raw}`);
  }

  if (outOfScopeButWatched.length > 0) {
    console.error(
      `[e2e-check] FAIL: ${outOfScopeButWatched.length} modified/untracked file(s) under docs/** or tools/** outside the allowed scope (tools/doc-graph/**, docs/DOC-GRAPH.json, docs/DOC-GRAPH-REPORT.md):`
    );
    for (const e of outOfScopeButWatched) console.error(`  ${e.raw}`);
    process.exit(1);
  }

  console.log("[e2e-check] git status scope check PASSED (no unexpected changes under docs/** or tools/**).");
  console.log("[e2e-check] PASS");
  process.exit(0);
}

main();
