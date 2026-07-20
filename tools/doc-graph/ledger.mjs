#!/usr/bin/env node
/**
 * tools/doc-graph/ledger.mjs — G3 feature-ledger generator (G3-T3).
 *
 * Reads the ONE hand-editable manifest (docs/feature-ledger.manifest.yaml),
 * resolves each row's refs against files on disk (reusing the G3-T1 module
 * ledger-manifest.mjs — no duplicate YAML parsing), computes a DETERMINISTIC,
 * structural lifecycle status on the P0-P6 axis, detects drift where a row's
 * claimed_status exceeds what the on-disk evidence supports, and writes two
 * GENERATED artifacts:
 *   - docs/FEATURE-LEDGER.md            (human-readable table + summary)
 *   - a `ledger` block inside docs/DOC-GRAPH.json (machine-readable, merged
 *     without disturbing generatedAt/nodes/edges/violations)
 *
 * Both artifacts carry a "GENERATED — do not hand-edit; edit the manifest"
 * header/marker. The manifest is the only file a human edits.
 *
 * DETERMINISTIC STATUS LADDER (no LLM), per the pinned G3 spec rules, from
 * resolveRefs()'s exists map {docs, srs, code, tests, review} plus the primary
 * doc's frontmatter status (parsed by G2's frontmatter-rules.mjs — reused, not
 * duplicated):
 *   - no code, docs resolve, frontmatter status NOT accepted/stable  doc-only
 *   - no code, docs resolve, frontmatter status accepted/stable ..... designed
 *   - code, no tests, no review ..................................... in-code
 *   - code, exactly one of tests/review ............. code+needs-test-or-review
 *   - code + tests + review, WITHOUT --run-tests ... code+tests-present (unrun)
 *   - code + tests + review, --run-tests, a test failed  code+needs-test-or-review
 *   - code + tests + review, --run-tests, all pass ................. verified
 * The 'verified' rung is NEVER reachable from file existence alone — it
 * requires --run-tests to actually run the mapped commands (ledger-runtests.mjs)
 * and every mapped test to exit 0. Without --run-tests, the highest reachable
 * rung is the honest "code+tests-present (unrun)" downgrade.
 *
 * DRIFT: a row may carry claimed_status. Comparing its rank to the computed
 * rank:
 *   - claimed rank > computed rank  ->  status-inflation   (BLOCKING; exit 1)
 *   - claimed rank < computed rank  ->  status-understated  (informational)
 *   - equal                          ->  aligned
 *   - no claimed_status              ->  unclaimed
 *
 * VIOLATIONS (the ledger block carries {rows, violations}):
 *   - dangling-ref       (BLOCKING): a path-kind ref that does not resolve on
 *                        disk (per-ref, from resolveRefs()'s dangling list).
 *   - status-inflation   (BLOCKING): as above.
 *   - status-understated (informational): as above.
 * The process exits 1 iff there is >=1 BLOCKING violation (status-inflation
 * or dangling-ref), 0 otherwise, 2 on fatal errors.
 *
 * Usage:
 *   node tools/doc-graph/ledger.mjs [--run-tests] [--quiet]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadManifest, resolveRefs } from './ledger-manifest.mjs';
import { runTestRefs, reachesVerified } from './ledger-runtests.mjs';
import { parseFrontmatterFields } from './frontmatter-rules.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');

export const GENERATED_MARKER =
  'GENERATED — do not hand-edit; edit docs/feature-ledger.manifest.yaml and re-run tools/doc-graph/ledger.mjs';

// Canonical status ladder, low -> high. Rank is the array index. The
// "(unrun)" downgrade shares the rank of its base rung for drift comparison.
export const STATUS_LADDER = [
  'doc-only',
  'designed',
  'in-code',
  'code+needs-test-or-review',
  'code+tests-present',
  'verified',
];

// Frontmatter status values that lift a doc-only row to 'designed' (pinned
// spec rule: "the primary doc's frontmatter status is accepted/stable").
const DESIGNED_FM_STATUSES = new Set(['accepted', 'stable']);

export function baseStatus(status) {
  // strip a trailing " (...)" annotation so "code+tests-present (unrun)"
  // ranks as "code+tests-present".
  return String(status ?? '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

export function statusRank(status) {
  const idx = STATUS_LADDER.indexOf(baseStatus(status));
  return idx; // -1 for an unknown/free-text claimed_status
}

/**
 * Deterministic, structural status computation for one resolved row.
 * @param {{docs:boolean,srs:boolean,code:boolean,tests:boolean,review:boolean}} exists
 * @param {{runTests:boolean, testPassed:boolean, primaryDocStatus:string|null}} evidence
 *   primaryDocStatus: the frontmatter `status` of the first resolving docs
 *   ref (lowercased), or null when there is none / it has no frontmatter.
 * @returns {string}
 */
export function computeStatus(exists, { runTests, testPassed, primaryDocStatus }) {
  if (!exists.code) {
    return exists.docs && DESIGNED_FM_STATUSES.has(String(primaryDocStatus ?? '').toLowerCase())
      ? 'designed'
      : 'doc-only';
  }
  const both = exists.tests && exists.review;
  if (both) {
    if (runTests) {
      return testPassed ? 'verified' : 'code+needs-test-or-review';
    }
    return 'code+tests-present (unrun)';
  }
  if (exists.tests || exists.review) {
    return 'code+needs-test-or-review';
  }
  return 'in-code';
}

/**
 * Classify drift between a row's claimed_status and its computed status.
 * @returns {'status-inflation'|'status-understated'|'aligned'|'unclaimed'}
 */
export function classifyDrift(claimed, computed) {
  if (claimed === undefined || claimed === null || claimed === '') return 'unclaimed';
  const cRank = statusRank(claimed);
  const compRank = statusRank(computed);
  // An unrecognized claimed_status (rank -1) cannot be safely compared; treat
  // it as inflation so it surfaces for a human rather than silently passing.
  if (cRank < 0) return 'status-inflation';
  if (cRank > compRank) return 'status-inflation';
  if (cRank < compRank) return 'status-understated';
  return 'aligned';
}

/**
 * The 'evidence gaps' column: exactly what is missing for this row to
 * advance to the next rung (task-pinned examples: 'no tests mapped',
 * 'review record missing'). Mechanical — derived from the same inputs as
 * computeStatus, never free text.
 */
export function evidenceGaps(exists, computed) {
  const gaps = [];
  if (!exists.code) {
    if (!exists.docs) gaps.push('no doc mapped');
    if (baseStatus(computed) === 'doc-only' && exists.docs) {
      gaps.push('primary doc status not accepted/stable');
    }
    gaps.push('no code mapped');
    return gaps;
  }
  if (!exists.tests) gaps.push('no tests mapped');
  if (!exists.review) gaps.push('review record missing');
  if (baseStatus(computed) === 'code+tests-present') {
    gaps.push('tests not run (--run-tests)');
  }
  return gaps;
}

/**
 * Read the frontmatter `status` of the first docs ref that resolves on disk
 * (the row's "primary doc"). Reuses G2's parseFrontmatterFields — no
 * duplicate frontmatter parsing.
 * @returns {string|null}
 */
function primaryDocStatusFor(entry, repoRoot) {
  const docs = Array.isArray(entry.refs.docs)
    ? entry.refs.docs
    : entry.refs.docs
      ? [entry.refs.docs]
      : [];
  for (const ref of docs) {
    const abs = resolve(repoRoot, ref);
    if (!existsSync(abs)) continue;
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const fm = parseFrontmatterFields(text);
    return fm && fm.status ? String(fm.status).toLowerCase() : null;
  }
  return null;
}

function mdEscape(s) {
  return String(s ?? '').replace(/\|/g, '\\|');
}

function renderLedgerMd(rows, summary, violations, meta) {
  const lines = [];
  lines.push(`<!-- ${GENERATED_MARKER} -->`);
  lines.push('');
  lines.push('# FEATURE-LEDGER');
  lines.push('');
  lines.push(
    `> **${GENERATED_MARKER}**  `
  );
  lines.push(
    `> Source manifest: \`docs/feature-ledger.manifest.yaml\` · generated \`${meta.generatedAt}\` · ` +
      `\`--run-tests\`=${meta.runTests} · rows=${rows.length}`
  );
  lines.push('');
  lines.push(
    'One row per feature / FR / NFR. **Computed** status is derived structurally ' +
      'from evidence on disk (never from a claim); **Claimed** is the manifest ' +
      'row\'s `claimed_status`; **Drift** flags where a claim outruns the evidence; ' +
      '**Evidence gaps** lists exactly what is missing to advance.'
  );
  lines.push('');

  // --- Summary ---------------------------------------------------------
  lines.push('## Summary');
  lines.push('');
  lines.push('### Rows by kind');
  lines.push('');
  lines.push('| Kind | Rows |');
  lines.push('| --- | --- |');
  for (const kind of Object.keys(summary.byKind).sort()) {
    lines.push(`| ${kind} | ${summary.byKind[kind]} |`);
  }
  lines.push('');
  lines.push('### Rows by computed status');
  lines.push('');
  lines.push('| Computed status | Rows |');
  lines.push('| --- | --- |');
  for (const status of STATUS_LADDER) {
    const withUnrun =
      (summary.byStatus[status] ?? 0) +
      (status === 'code+tests-present' ? summary.byStatus['code+tests-present (unrun)'] ?? 0 : 0);
    if (withUnrun > 0) {
      const label = status === 'code+tests-present' ? 'code+tests-present [(unrun)]' : status;
      lines.push(`| ${label} | ${withUnrun} |`);
    }
  }
  lines.push('');
  lines.push('### Drift');
  lines.push('');
  lines.push('| Drift | Rows |');
  lines.push('| --- | --- |');
  for (const d of ['status-inflation', 'status-understated', 'aligned', 'unclaimed']) {
    lines.push(`| ${d} | ${summary.byDrift[d] ?? 0} |`);
  }
  lines.push('');
  const blocking = violations.filter((v) => v.blocking);
  if (blocking.length > 0) {
    lines.push(
      `> ⚠️ **${blocking.length} blocking violation(s)** (status-inflation and/or dangling refs) — ` +
        'the generator exits 1. Either add the missing evidence, fix the ref, or lower the claim ' +
        'in the manifest.'
    );
    lines.push('');
  }

  // --- Violations ------------------------------------------------------
  if (violations.length > 0) {
    lines.push('## Violations');
    lines.push('');
    lines.push('| Row | Type | Blocking | Detail |');
    lines.push('| --- | --- | --- | --- |');
    for (const v of violations) {
      lines.push(
        `| ${mdEscape(v.id)} | ${v.type} | ${v.blocking ? 'yes' : 'no'} | ${mdEscape(v.detail)} |`
      );
    }
    lines.push('');
  }

  // --- Full tables, grouped by kind (epic DoD: features, FRs, NFRs) ----
  lines.push('## Ledger');
  lines.push('');
  lines.push(
    '> † = `phase_target` is a bootstrap badge-heuristic (`phase_source: heuristic` in the ' +
      'manifest), not a sourced roadmap phase — treat as provisional until confirmed.'
  );
  lines.push('');
  const GROUPS = [
    ['feature', 'Features'],
    ['fr', 'Functional requirements (FR)'],
    ['nfr', 'Non-functional requirements (NFR)'],
  ];
  for (const [kind, heading] of GROUPS) {
    const group = rows.filter((r) => r.kind === kind);
    if (group.length === 0) continue;
    lines.push(`### ${heading}`);
    lines.push('');
    lines.push('| ID | Title | Kind | Phase | Computed | Claimed | Drift | Evidence gaps | Source |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of group) {
      const gaps = r.gaps.length ? r.gaps.join(', ') : '—';
      const claimed = r.claimed ?? '—';
      const phase = r.phase_source === 'heuristic' ? `${r.phase_target}†` : r.phase_target;
      lines.push(
        `| ${mdEscape(r.id)} | ${mdEscape(r.title)} | ${r.kind} | ${phase} | ${r.computed} | ` +
          `${mdEscape(claimed)} | ${r.drift} | ${gaps} | ${mdEscape(r.source ?? '—')} |`
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}

function mergeLedgerIntoDocGraph(ledgerBlock, docGraphPath) {
  let graph = {};
  if (existsSync(docGraphPath)) {
    try {
      graph = JSON.parse(readFileSync(docGraphPath, 'utf8'));
    } catch (err) {
      throw new Error(`Could not parse ${docGraphPath}: ${err.message}`);
    }
  }
  graph.ledger = ledgerBlock;
  writeFileSync(docGraphPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');
}

/**
 * Run the full ledger generation. Extracted from the CLI so tests can drive
 * it against a fixture repo (repoRoot/manifestPath/output overrides) without
 * spawning a child process.
 *
 * @returns {Promise<{exitCode: number, rows: Array, violations: Array, summary: Object}>}
 *   exitCode: 0 = clean, 1 = >=1 blocking violation. Fatal conditions throw.
 */
export async function runLedger(opts = {}) {
  const repoRoot = opts.repoRoot ?? REPO_ROOT;
  const manifestPath = opts.manifestPath ?? join(repoRoot, 'docs', 'feature-ledger.manifest.yaml');
  const ledgerMdPath = opts.ledgerMdPath ?? join(repoRoot, 'docs', 'FEATURE-LEDGER.md');
  const docGraphPath = opts.docGraphPath ?? join(repoRoot, 'docs', 'DOC-GRAPH.json');
  const runTests = opts.runTests ?? false;
  const log = opts.log ?? (() => {});

  if (!existsSync(manifestPath)) {
    throw new Error(`manifest not found: ${manifestPath}`);
  }

  const manifest = loadManifest(manifestPath);
  const resolved = resolveRefs(manifest, repoRoot);

  // Shared cache so a test file referenced by multiple rows runs once.
  const testCache = new Map();

  const rows = [];
  const violations = [];
  for (const entry of resolved) {
    // Dangling refs are BLOCKING per the epic DoD — every ref must resolve.
    for (const d of entry.dangling ?? []) {
      violations.push({
        id: entry.id,
        type: 'dangling-ref',
        blocking: true,
        detail: `refs.${d.kind}: ${d.ref} does not exist on disk`,
      });
    }

    let testPassed = false;
    if (runTests && entry.exists.code && entry.exists.tests && entry.exists.review) {
      const testRefs = Array.isArray(entry.refs.tests)
        ? entry.refs.tests
        : entry.refs.tests
          ? [entry.refs.tests]
          : [];
      const results = await runTestRefs(testRefs, { cache: testCache, repoRoot });
      testPassed = reachesVerified(entry, results);
    }
    const primaryDocStatus = entry.exists.code ? null : primaryDocStatusFor(entry, repoRoot);
    const computed = computeStatus(entry.exists, { runTests, testPassed, primaryDocStatus });
    const drift = classifyDrift(entry.claimed_status, computed);
    if (drift === 'status-inflation') {
      violations.push({
        id: entry.id,
        type: 'status-inflation',
        blocking: true,
        detail: `claimed=${entry.claimed_status} exceeds computed=${computed}`,
      });
    } else if (drift === 'status-understated') {
      violations.push({
        id: entry.id,
        type: 'status-understated',
        blocking: false,
        detail: `claimed=${entry.claimed_status} below computed=${computed}`,
      });
    }
    rows.push({
      id: entry.id,
      title: entry.title,
      kind: entry.kind,
      phase_target: entry.phase_target,
      phase_source: entry.phase_source ?? null,
      computed,
      claimed: entry.claimed_status ?? null,
      drift,
      exists: entry.exists,
      gaps: evidenceGaps(entry.exists, computed),
      source: entry.source ?? null,
    });
  }

  // --- Summaries -------------------------------------------------------
  const byKind = {};
  const byStatus = {};
  const byDrift = {};
  for (const r of rows) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    byStatus[r.computed] = (byStatus[r.computed] ?? 0) + 1;
    byDrift[r.drift] = (byDrift[r.drift] ?? 0) + 1;
  }
  const summary = { byKind, byStatus, byDrift };

  const generatedAt = new Date().toISOString();
  const meta = { generatedAt, runTests };

  // --- Write artifacts -------------------------------------------------
  const md = renderLedgerMd(rows, summary, violations, meta);
  writeFileSync(ledgerMdPath, md, 'utf8');

  const ledgerBlock = {
    _generated: GENERATED_MARKER,
    generatedAt,
    manifest: 'docs/feature-ledger.manifest.yaml',
    runTests,
    rowCount: rows.length,
    byKind,
    byStatus,
    byDrift,
    rows: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      phase_target: r.phase_target,
      phase_source: r.phase_source,
      computed: r.computed,
      claimed: r.claimed,
      drift: r.drift,
      gaps: r.gaps,
      source: r.source,
    })),
    violations,
  };
  mergeLedgerIntoDocGraph(ledgerBlock, docGraphPath);

  // --- Report (verbatim, machine-parseable) ---------------------------
  const blocking = violations.filter((v) => v.blocking);
  log(`[ledger] manifest=${manifestPath}`);
  log(`[ledger] rows=${rows.length} runTests=${runTests}`);
  log(`[ledger] by kind (verbatim): ${JSON.stringify(byKind)}`);
  log(`[ledger] by computed status (verbatim): ${JSON.stringify(byStatus)}`);
  log(`[ledger] by drift (verbatim): ${JSON.stringify(byDrift)}`);
  log(`[ledger] violations: ${violations.length} (${blocking.length} blocking)`);
  log(`[ledger] wrote ${ledgerMdPath}`);
  log(`[ledger] merged 'ledger' block into ${docGraphPath}`);

  return { exitCode: blocking.length > 0 ? 1 : 0, rows, violations, summary };
}

async function main() {
  const argv = process.argv.slice(2);
  const runTests = argv.includes('--run-tests');
  const quiet = argv.includes('--quiet');
  const log = (...a) => {
    if (!quiet) console.log(...a);
  };

  let result;
  try {
    result = await runLedger({ runTests, log });
  } catch (err) {
    console.error(`[ledger] FATAL: ${err.message}`);
    process.exit(2);
  }

  if (result.exitCode !== 0) {
    const blocking = result.violations.filter((v) => v.blocking);
    console.error(
      `[ledger] BLOCKING: ${blocking.length} violation(s) — claims exceed evidence and/or refs dangle:`
    );
    for (const v of blocking) {
      console.error(`[ledger]   ${v.id}: ${v.type} — ${v.detail}`);
    }
    log('[ledger] EXIT 1 (blocking violations present — honest blocking code).');
    process.exit(1);
  }

  log('[ledger] EXIT 0 (no blocking violations).');
  process.exit(0);
}

// Only run the CLI when executed directly (not when imported by tests).
const invokedDirectly = (() => {
  try {
    return resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[ledger] FATAL: ${err?.stack ?? err}`);
    process.exit(2);
  });
}
