#!/usr/bin/env node
/**
 * G2-T6 — E2E check for the doc-graph structural validator against the REAL repo.
 *
 * Extends G1-T6's e2e-check.mjs pattern (same repo, same scope-aware dirty-tree
 * rule) to cover the G2 epic surface:
 *   1. `node tools/doc-graph/scan.mjs --strict` — real child process. Only a
 *      crash / non-{0,1} exit / timeout is a check FAILURE; a non-zero exit from
 *      real-tree violations is a FINDING, not a failure, and is captured verbatim.
 *      A missing --strict flag (scan.mjs not yet wired for it) is a check FAILURE
 *      because the epic DoD requires it.
 *   2. `node tools/doc-graph/fts.mjs "Belief Revision"` — must exit cleanly and
 *      report >=1 hit.
 *   3. docs/atomic_index.jsonl must exist with >80 lines, each line valid JSON.
 *   4. `git status --porcelain` shows no modified/untracked files outside
 *      tools/doc-graph/**, docs/DOC-GRAPH.json, docs/DOC-GRAPH-REPORT.md,
 *      docs/atomic_index.jsonl — pre-existing dirt elsewhere (a parallel
 *      session) is tolerated and only recorded, never treated as a violation.
 *   5. Whole run (steps 1+2, wall clock) must complete in <45s.
 *
 * Usage: node tools/doc-graph/e2e-check-g2.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, statSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SCAN = join(HERE, "scan.mjs");
const FTS = join(HERE, "fts.mjs");
const GRAPH_JSON = join(REPO_ROOT, "docs", "DOC-GRAPH.json");
const REPORT_MD = join(REPO_ROOT, "docs", "DOC-GRAPH-REPORT.md");
const ATOMIC_INDEX = join(REPO_ROOT, "docs", "atomic_index.jsonl");

const WHOLE_RUN_BUDGET_MS = 45_000;
const STEP_TIMEOUT_MS = 40_000; // individual step cap, still inside the 45s wall-clock budget
const MIN_ATOMIC_INDEX_LINES = 80;
const FTS_QUERY = "Belief Revision";

const IN_SCOPE_PREFIXES = ["tools/doc-graph/"];
const IN_SCOPE_EXACT = ["docs/DOC-GRAPH.json", "docs/DOC-GRAPH-REPORT.md", "docs/atomic_index.jsonl"];
const WATCHED_PREFIXES = ["docs/", "tools/"]; // dirt here outside the allowlist is a real violation

function isInScope(relPath) {
  const p = relPath.replace(/\\/g, "/");
  if (IN_SCOPE_EXACT.includes(p)) return true;
  return IN_SCOPE_PREFIXES.some((pre) => p.startsWith(pre));
}

function isWatched(relPath) {
  const p = relPath.replace(/\\/g, "/");
  return WATCHED_PREFIXES.some((pre) => p.startsWith(pre));
}

function runNode(scriptPath, args, timeoutMs) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    if (!existsSync(scriptPath)) {
      resolvePromise({
        missing: true,
        crashed: false,
        code: null,
        signal: null,
        stdout: "",
        stderr: "",
        durationMs: 0,
        timedOut: false,
      });
      return;
    }
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({ missing: false, crashed: true, error: err, stdout, stderr, durationMs: Date.now() - startedAt, timedOut });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({
        missing: false,
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
  const wallStart = Date.now();
  let ok = true;

  // --- Step 1: scan.mjs --strict ---------------------------------------
  console.log(`[e2e-check-g2] launching: node ${SCAN} --strict`);
  const scanLaunchedAt = Date.now();
  const scanResult = await runNode(SCAN, ["--strict"], STEP_TIMEOUT_MS);

  if (scanResult.missing) {
    console.error(`[e2e-check-g2] FAIL: ${SCAN} does not exist.`);
    ok = false;
  } else if (scanResult.crashed) {
    console.error(`[e2e-check-g2] FAIL: scan.mjs --strict failed to launch: ${scanResult.error}`);
    ok = false;
  } else if (scanResult.timedOut) {
    console.error(`[e2e-check-g2] FAIL: scan.mjs --strict exceeded ${STEP_TIMEOUT_MS}ms budget (killed).`);
    ok = false;
  } else if (scanResult.signal) {
    console.error(`[e2e-check-g2] FAIL: scan.mjs --strict terminated by signal ${scanResult.signal}. stderr:\n${scanResult.stderr}`);
    ok = false;
  } else if (scanResult.code !== 0 && scanResult.code !== 1) {
    console.error(`[e2e-check-g2] FAIL: scan.mjs --strict exited with unexpected code ${scanResult.code}. stderr:\n${scanResult.stderr}`);
    ok = false;
  } else {
    console.log(`[e2e-check-g2] scan.mjs --strict exited ${scanResult.code} in ${scanResult.durationMs}ms (findings, not a failure, unless noted above).`);
    if (scanResult.stdout.trim()) console.log(`[e2e-check-g2] scan.mjs stdout:\n${scanResult.stdout.trim()}`);
    if (scanResult.stderr.trim()) console.log(`[e2e-check-g2] scan.mjs stderr:\n${scanResult.stderr.trim()}`);

    for (const [label, p] of [
      ["docs/DOC-GRAPH.json", GRAPH_JSON],
      ["docs/DOC-GRAPH-REPORT.md", REPORT_MD],
    ]) {
      if (!existsSync(p)) {
        console.error(`[e2e-check-g2] FAIL: missing artifact ${label}`);
        ok = false;
        continue;
      }
      const mtimeMs = statSync(p).mtimeMs;
      if (mtimeMs < scanLaunchedAt - 1000) {
        console.error(`[e2e-check-g2] FAIL: ${label} exists but was not freshly written by this run (mtime=${new Date(mtimeMs).toISOString()})`);
        ok = false;
      }
    }

    if (existsSync(GRAPH_JSON)) {
      try {
        const graph = JSON.parse(readFileSync(GRAPH_JSON, "utf8"));
        const violations = graph.violations ?? [];
        console.log(
          `[e2e-check-g2] totals (verbatim, real-tree findings): nodes=${graph.nodes?.length ?? "?"} edges=${graph.edges?.length ?? "?"} violations=${violations.length}`
        );
        const byReason = {};
        for (const v of violations) byReason[v.reason ?? "unknown"] = (byReason[v.reason ?? "unknown"] ?? 0) + 1;
        console.log(`[e2e-check-g2] violations by reason: ${JSON.stringify(byReason)}`);
      } catch (err) {
        console.error(`[e2e-check-g2] WARN: could not parse ${GRAPH_JSON} for totals: ${err}`);
      }
    }
  }

  // --- Step 2: fts.mjs "Belief Revision" --------------------------------
  console.log(`[e2e-check-g2] launching: node ${FTS} "${FTS_QUERY}"`);
  const ftsResult = await runNode(FTS, [FTS_QUERY], STEP_TIMEOUT_MS);

  if (ftsResult.missing) {
    console.error(`[e2e-check-g2] FAIL: ${FTS} does not exist.`);
    ok = false;
  } else if (ftsResult.crashed) {
    console.error(`[e2e-check-g2] FAIL: fts.mjs failed to launch: ${ftsResult.error}`);
    ok = false;
  } else if (ftsResult.timedOut) {
    console.error(`[e2e-check-g2] FAIL: fts.mjs exceeded ${STEP_TIMEOUT_MS}ms budget (killed).`);
    ok = false;
  } else if (ftsResult.signal) {
    console.error(`[e2e-check-g2] FAIL: fts.mjs terminated by signal ${ftsResult.signal}. stderr:\n${ftsResult.stderr}`);
    ok = false;
  } else if (ftsResult.code !== 0) {
    console.error(`[e2e-check-g2] FAIL: fts.mjs "${FTS_QUERY}" exited with code ${ftsResult.code}. stderr:\n${ftsResult.stderr}`);
    ok = false;
  } else {
    const hitLines = ftsResult.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    console.log(`[e2e-check-g2] fts.mjs "${FTS_QUERY}" exited 0 in ${ftsResult.durationMs}ms, ${hitLines.length} output line(s).`);
    if (hitLines.length === 0) {
      console.error(`[e2e-check-g2] FAIL: fts.mjs "${FTS_QUERY}" returned 0 hits (need >=1).`);
      ok = false;
    } else {
      console.log(`[e2e-check-g2] fts.mjs sample hit: ${hitLines[0]}`);
    }
  }

  // --- Step 3: docs/atomic_index.jsonl ----------------------------------
  if (!existsSync(ATOMIC_INDEX)) {
    console.error(`[e2e-check-g2] FAIL: missing artifact docs/atomic_index.jsonl`);
    ok = false;
  } else {
    const raw = readFileSync(ATOMIC_INDEX, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    console.log(`[e2e-check-g2] docs/atomic_index.jsonl has ${lines.length} non-empty line(s) (need >${MIN_ATOMIC_INDEX_LINES}).`);
    if (lines.length <= MIN_ATOMIC_INDEX_LINES) {
      console.error(`[e2e-check-g2] FAIL: docs/atomic_index.jsonl has ${lines.length} lines, need >${MIN_ATOMIC_INDEX_LINES}.`);
      ok = false;
    }
    let badJson = 0;
    for (const [i, line] of lines.entries()) {
      try {
        JSON.parse(line);
      } catch {
        badJson++;
        if (badJson <= 3) console.error(`[e2e-check-g2] FAIL: docs/atomic_index.jsonl line ${i + 1} is not valid JSON.`);
      }
    }
    if (badJson > 0) {
      console.error(`[e2e-check-g2] FAIL: ${badJson} line(s) of docs/atomic_index.jsonl are not valid JSON.`);
      ok = false;
    }
  }

  // --- Step 4: git status scope check ------------------------------------
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
      `[e2e-check-g2] INFO: ${tolerated.length} pre-existing dirty file(s) outside docs/** and tools/** — tolerated per scope-aware dirty-tree rule, recorded verbatim:`
    );
    for (const e of tolerated) console.log(`  ${e.raw}`);
  }

  if (outOfScopeButWatched.length > 0) {
    console.error(
      `[e2e-check-g2] FAIL: ${outOfScopeButWatched.length} modified/untracked file(s) under docs/** or tools/** outside the allowed scope (tools/doc-graph/**, docs/DOC-GRAPH.json, docs/DOC-GRAPH-REPORT.md, docs/atomic_index.jsonl):`
    );
    for (const e of outOfScopeButWatched) console.error(`  ${e.raw}`);
    ok = false;
  } else {
    console.log("[e2e-check-g2] git status scope check PASSED (no unexpected changes under docs/** or tools/**).");
  }

  // --- Step 5: whole-run wall-clock budget --------------------------------
  const wallMs = Date.now() - wallStart;
  console.log(`[e2e-check-g2] wall-clock elapsed: ${wallMs}ms (budget ${WHOLE_RUN_BUDGET_MS}ms).`);
  if (wallMs >= WHOLE_RUN_BUDGET_MS) {
    console.error(`[e2e-check-g2] FAIL: whole run took ${wallMs}ms, budget is ${WHOLE_RUN_BUDGET_MS}ms.`);
    ok = false;
  }

  if (!ok) {
    console.error("[e2e-check-g2] FAIL");
    process.exit(1);
  }
  console.log("[e2e-check-g2] PASS");
  process.exit(0);
}

main();
