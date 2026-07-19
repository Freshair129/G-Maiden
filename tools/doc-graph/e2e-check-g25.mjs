#!/usr/bin/env node
/**
 * G25-T4 — E2E acceptance check for the "strict migration" epic against the
 * REAL repo tree.
 *
 * Extends the G1/G2 e2e-check.mjs pattern (real child process, scope-aware
 * dirty-tree rule) but — unlike G2, which only tested the *scanner
 * infrastructure* and treated real violations as findings-not-failures —
 * this check tests the epic's *acceptance criteria* (epic_dod in
 * tasks.json). It is the automated half of "Done means all verify_commands
 * exit 0"; class counts that are not yet zero are genuine FAILures here,
 * not just findings, because zeroing them is literally what G25-T1/T2/T3
 * were chartered to do.
 *
 * Steps:
 *   1. `node tools/doc-graph/scan.mjs --strict` as a real child process.
 *      A crash / non-{0,1} exit / timeout is a check FAILURE. Must complete
 *      (together with step 2 below) inside the 45s wall-clock budget and
 *      must freshly write docs/DOC-GRAPH.json, docs/DOC-GRAPH-REPORT.md,
 *      docs/atomic_index.jsonl.
 *   2. Parse docs/DOC-GRAPH.json and print the per-reason violation counts
 *      verbatim (JSON), then ASSERT the epic_dod class-zero conditions:
 *      anchor-symbol-mismatch, bad-anchor, missing-required-field,
 *      invalid-status, legacy-status-case, doc-id-slug-mismatch must all be
 *      0. informational reasons are not asserted on (allowed to remain).
 *   3. ASSERT the missing-approval carve-out: missing-approval violation
 *      count must equal the number of data rows in
 *      docs/approval-backfill-checklist.md (same table-row-counting rule as
 *      G25-T3's own verify_command: lines matching /^\| [^-|]/ minus the
 *      header row). A missing checklist file counts as 0 rows.
 *   4. `git status --porcelain` scope check: docs/** is wholesale in scope
 *      (epic write scope is "docs/**, docs/approval-backfill-checklist.md,
 *      scan artifacts"); tools/doc-graph/** is only in scope for the files
 *      this epic is explicitly chartered to add/touch (this script itself,
 *      its test, and the two cross-task scratch files named in the epic
 *      context brief). Any other watched-but-out-of-scope file is a FAIL.
 *      Dirt entirely outside docs/** and tools/** (e.g. a parallel
 *      session's unrelated edits) is tolerated and only recorded.
 *   5. Run `node tools/doc-graph/diff-gate.mjs HEAD~1...HEAD` once (real
 *      child process) to confirm the gate tool itself still exits per
 *      contract on this branch's own commits. Must not crash/timeout, and
 *      is expected to PASS (exit 0) for this branch's own history.
 *   6. Whole run (steps 1+2, wall clock) must complete in <45s.
 *
 * Usage: node tools/doc-graph/e2e-check-g25.mjs
 */
import { spawn, execFileSync } from "node:child_process";
import { existsSync, statSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const SCAN = join(HERE, "scan.mjs");
const DIFF_GATE = join(HERE, "diff-gate.mjs");
const GRAPH_JSON = join(REPO_ROOT, "docs", "DOC-GRAPH.json");
const REPORT_MD = join(REPO_ROOT, "docs", "DOC-GRAPH-REPORT.md");
const ATOMIC_INDEX = join(REPO_ROOT, "docs", "atomic_index.jsonl");
const CHECKLIST = join(REPO_ROOT, "docs", "approval-backfill-checklist.md");

const WHOLE_RUN_BUDGET_MS = 45_000;
const STEP_TIMEOUT_MS = 40_000; // individual step cap, still inside the 45s wall-clock budget
const DIFF_GATE_RANGE = "HEAD~1...HEAD";

// epic_dod (tasks.json): these classes must be exactly zero.
const ZERO_CLASSES = [
  "anchor-symbol-mismatch",
  "bad-anchor",
  "missing-required-field",
  "invalid-status",
  "legacy-status-case",
  "doc-id-slug-mismatch",
];
// missing-approval is exempt from the zero rule — it may remain, but only
// 1:1 with rows in the Boss sign-off checklist (script-verified equality).
const CHECKLIST_CLASS = "missing-approval";

const IN_SCOPE_TOOLS_EXACT = [
  // this task's own deliverable
  "tools/doc-graph/e2e-check-g25.mjs",
  "tools/doc-graph/e2e-check-g25.test.mjs",
  // cross-task scratch files named explicitly in the epic context brief
  "tools/doc-graph/unmappable-status.json",
  "tools/doc-graph/review-pre-g25.json",
];
const WATCHED_PREFIXES = ["tools/"]; // docs/** is wholesale in-scope (checked separately below)

function isDocsPath(relPath) {
  return relPath.replace(/\\/g, "/").startsWith("docs/");
}

function isInScopeTools(relPath) {
  return IN_SCOPE_TOOLS_EXACT.includes(relPath.replace(/\\/g, "/"));
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

function unquoteGitPath(p) {
  // git quotes paths containing spaces/specials in double quotes and
  // backslash-escapes embedded quotes/backslashes; strip that so scope
  // matching sees the real relative path (e.g. `docs/change request/...`).
  if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) {
    return p
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
  return p;
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
    .map((l) => ({ raw: l, path: unquoteGitPath(l.slice(3)) }));
}

function countChecklistRows() {
  if (!existsSync(CHECKLIST)) return 0;
  const rows = (readFileSync(CHECKLIST, "utf8").match(/^\| [^-|]/gm) || []).length - 1;
  return Math.max(rows, 0);
}

async function main() {
  const wallStart = Date.now();
  let ok = true;

  // --- Step 1: scan.mjs --strict ---------------------------------------
  console.log(`[e2e-check-g25] launching: node ${SCAN} --strict`);
  const scanLaunchedAt = Date.now();
  const scanResult = await runNode(SCAN, ["--strict"], STEP_TIMEOUT_MS);

  let graph = null;

  if (scanResult.missing) {
    console.error(`[e2e-check-g25] FAIL: ${SCAN} does not exist.`);
    ok = false;
  } else if (scanResult.crashed) {
    console.error(`[e2e-check-g25] FAIL: scan.mjs --strict failed to launch: ${scanResult.error}`);
    ok = false;
  } else if (scanResult.timedOut) {
    console.error(`[e2e-check-g25] FAIL: scan.mjs --strict exceeded ${STEP_TIMEOUT_MS}ms budget (killed).`);
    ok = false;
  } else if (scanResult.signal) {
    console.error(`[e2e-check-g25] FAIL: scan.mjs --strict terminated by signal ${scanResult.signal}. stderr:\n${scanResult.stderr}`);
    ok = false;
  } else if (scanResult.code !== 0 && scanResult.code !== 1) {
    console.error(`[e2e-check-g25] FAIL: scan.mjs --strict exited with unexpected code ${scanResult.code}. stderr:\n${scanResult.stderr}`);
    ok = false;
  } else {
    console.log(`[e2e-check-g25] scan.mjs --strict exited ${scanResult.code} in ${scanResult.durationMs}ms.`);
    if (scanResult.stdout.trim()) console.log(`[e2e-check-g25] scan.mjs stdout:\n${scanResult.stdout.trim()}`);
    if (scanResult.stderr.trim()) console.log(`[e2e-check-g25] scan.mjs stderr:\n${scanResult.stderr.trim()}`);

    for (const [label, p] of [
      ["docs/DOC-GRAPH.json", GRAPH_JSON],
      ["docs/DOC-GRAPH-REPORT.md", REPORT_MD],
      ["docs/atomic_index.jsonl", ATOMIC_INDEX],
    ]) {
      if (!existsSync(p)) {
        console.error(`[e2e-check-g25] FAIL: missing artifact ${label}`);
        ok = false;
        continue;
      }
      const mtimeMs = statSync(p).mtimeMs;
      if (mtimeMs < scanLaunchedAt - 1000) {
        console.error(`[e2e-check-g25] FAIL: ${label} exists but was not freshly written by this run (mtime=${new Date(mtimeMs).toISOString()})`);
        ok = false;
      }
    }

    if (existsSync(GRAPH_JSON)) {
      try {
        graph = JSON.parse(readFileSync(GRAPH_JSON, "utf8"));
      } catch (err) {
        console.error(`[e2e-check-g25] FAIL: could not parse ${GRAPH_JSON}: ${err}`);
        ok = false;
      }
    }
  }

  // --- Step 2: per-class counts (verbatim) + epic_dod class-zero assert --
  if (graph) {
    const violations = graph.violations ?? [];
    console.log(
      `[e2e-check-g25] totals (verbatim, real-tree): nodes=${graph.nodes?.length ?? "?"} edges=${graph.edges?.length ?? "?"} violations=${violations.length}`
    );
    const byReason = {};
    for (const v of violations) byReason[v.reason ?? "unknown"] = (byReason[v.reason ?? "unknown"] ?? 0) + 1;
    console.log(`[e2e-check-g25] violations by reason (verbatim): ${JSON.stringify(byReason)}`);

    console.log(`[e2e-check-g25] asserting epic_dod class-zero conditions: ${ZERO_CLASSES.join(", ")}`);
    for (const reason of ZERO_CLASSES) {
      const count = byReason[reason] ?? 0;
      if (count !== 0) {
        console.error(`[e2e-check-g25] FAIL: epic_dod requires 0 "${reason}" violations, found ${count}.`);
        ok = false;
      } else {
        console.log(`[e2e-check-g25] OK: "${reason}" = 0.`);
      }
    }

    // --- Step 3: missing-approval <-> checklist equality ------------------
    const missingApprovalCount = byReason[CHECKLIST_CLASS] ?? 0;
    const checklistRows = countChecklistRows();
    console.log(
      `[e2e-check-g25] checklist equality: missing-approval=${missingApprovalCount} vs docs/approval-backfill-checklist.md data rows=${checklistRows} (checklist exists=${existsSync(CHECKLIST)}).`
    );
    if (missingApprovalCount !== checklistRows) {
      console.error(
        `[e2e-check-g25] FAIL: missing-approval violation count (${missingApprovalCount}) does not equal approval-backfill-checklist.md data-row count (${checklistRows}).`
      );
      ok = false;
    } else {
      console.log(`[e2e-check-g25] OK: missing-approval count equals checklist row count.`);
    }
  } else {
    console.error(`[e2e-check-g25] FAIL: no parsed DOC-GRAPH.json — cannot assert epic_dod class counts or checklist equality.`);
    ok = false;
  }

  // --- Step 4: git status scope check ------------------------------------
  const entries = gitStatusPorcelain();
  const outOfScopeButWatched = [];
  const tolerated = [];
  for (const e of entries) {
    if (isDocsPath(e.path)) continue; // docs/** wholesale in scope for this epic
    if (isInScopeTools(e.path)) continue;
    if (isWatched(e.path)) {
      outOfScopeButWatched.push(e);
    } else {
      tolerated.push(e);
    }
  }

  if (tolerated.length > 0) {
    console.log(
      `[e2e-check-g25] INFO: ${tolerated.length} pre-existing dirty file(s) outside docs/** and tools/** — tolerated per scope-aware dirty-tree rule, recorded verbatim:`
    );
    for (const e of tolerated) console.log(`  ${e.raw}`);
  }

  if (outOfScopeButWatched.length > 0) {
    console.error(
      `[e2e-check-g25] FAIL: ${outOfScopeButWatched.length} modified/untracked file(s) under tools/** outside the allowed G25 scope (${IN_SCOPE_TOOLS_EXACT.join(", ")}):`
    );
    for (const e of outOfScopeButWatched) console.error(`  ${e.raw}`);
    ok = false;
  } else {
    console.log("[e2e-check-g25] git status scope check PASSED (no unexpected changes under tools/** outside G25 scope; docs/** wholesale allowed).");
  }

  // --- Step 5: diff-gate.mjs contract check on this branch's own commits -
  console.log(`[e2e-check-g25] launching: node ${DIFF_GATE} ${DIFF_GATE_RANGE}`);
  const diffGateResult = await runNode(DIFF_GATE, [DIFF_GATE_RANGE], STEP_TIMEOUT_MS);

  if (diffGateResult.missing) {
    console.error(`[e2e-check-g25] FAIL: ${DIFF_GATE} does not exist.`);
    ok = false;
  } else if (diffGateResult.crashed) {
    console.error(`[e2e-check-g25] FAIL: diff-gate.mjs failed to launch: ${diffGateResult.error}`);
    ok = false;
  } else if (diffGateResult.timedOut) {
    console.error(`[e2e-check-g25] FAIL: diff-gate.mjs exceeded ${STEP_TIMEOUT_MS}ms budget (killed).`);
    ok = false;
  } else if (diffGateResult.signal) {
    console.error(`[e2e-check-g25] FAIL: diff-gate.mjs terminated by signal ${diffGateResult.signal}. stderr:\n${diffGateResult.stderr}`);
    ok = false;
  } else {
    console.log(`[e2e-check-g25] diff-gate.mjs ${DIFF_GATE_RANGE} exited ${diffGateResult.code} in ${diffGateResult.durationMs}ms.`);
    if (diffGateResult.stdout.trim()) console.log(`[e2e-check-g25] diff-gate.mjs stdout:\n${diffGateResult.stdout.trim()}`);
    if (diffGateResult.stderr.trim()) console.log(`[e2e-check-g25] diff-gate.mjs stderr:\n${diffGateResult.stderr.trim()}`);
    if (diffGateResult.code !== 0) {
      console.error(
        `[e2e-check-g25] FAIL: diff-gate.mjs ${DIFF_GATE_RANGE} exited ${diffGateResult.code}; expected PASS (0) for this branch's own commits (docs changed -> pass).`
      );
      ok = false;
    } else {
      console.log(`[e2e-check-g25] OK: diff-gate.mjs exits per contract (PASS) on ${DIFF_GATE_RANGE}.`);
    }
  }

  // --- Step 6: whole-run wall-clock budget --------------------------------
  const wallMs = Date.now() - wallStart;
  console.log(`[e2e-check-g25] wall-clock elapsed: ${wallMs}ms (budget ${WHOLE_RUN_BUDGET_MS}ms).`);
  if (wallMs >= WHOLE_RUN_BUDGET_MS) {
    console.error(`[e2e-check-g25] FAIL: whole run took ${wallMs}ms, budget is ${WHOLE_RUN_BUDGET_MS}ms.`);
    ok = false;
  }

  if (!ok) {
    console.error("[e2e-check-g25] FAIL");
    process.exit(1);
  }
  console.log("[e2e-check-g25] PASS");
  process.exit(0);
}

main();
