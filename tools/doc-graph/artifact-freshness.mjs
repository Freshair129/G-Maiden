#!/usr/bin/env node
/**
 * tools/doc-graph/artifact-freshness.mjs — are the COMMITTED generated
 * doc-graph artifacts the same as what the generator produces for this tree?
 *
 * ci-gate.mjs regenerates DOC-GRAPH.json, DOC-GRAPH-REPORT.md,
 * FEATURE-LEDGER.md, FEATURE-ORPHAN-REPORT.{json,md} and atomic_index.jsonl
 * inside the runner and then checks them, but it never compares them with
 * the versions committed in the PR. A PR that edits a doc and forgets to
 * commit the regenerated artifacts therefore passes CI while leaving `main`
 * with a stale index (seen on PR #152, 2026-11-07). This script closes that
 * gap: run it AFTER ci-gate (so the working tree holds freshly generated
 * files) and it compares each artifact with `git show HEAD:<path>`.
 *
 * Generation timestamps (`generatedAt`, "Generated at", "generated `…`") are
 * ISO-8601 instants that change on every run; they are masked before the
 * comparison so only real content drift fails. Line endings are normalized
 * because the repo runs with autocrlf on Windows.
 *
 * Exit 0: every artifact matches. Exit 1: at least one differs (listed).
 * Exit 2: an artifact is missing from HEAD or the working tree.
 *
 * `compareArtifact(committed, regenerated)` and `normalize(text)` are the pure
 * core, exported for node --test.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GENERATED_ARTIFACTS = Object.freeze([
  'docs/DOC-GRAPH.json',
  'docs/DOC-GRAPH-REPORT.md',
  'docs/FEATURE-LEDGER.md',
  'docs/FEATURE-ORPHAN-REPORT.json',
  'docs/FEATURE-ORPHAN-REPORT.md',
  'docs/atomic_index.jsonl',
]);

const ISO_INSTANT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g;

/** Mask volatile generation timestamps and normalize line endings / BOM. */
export function normalize(text) {
  return String(text ?? '')
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(ISO_INSTANT, '<TIMESTAMP>')
    .replace(/\n+$/, '\n');
}

/**
 * @returns {{ fresh: boolean, firstDiffLine: number|null }}
 *   firstDiffLine is 1-based in the regenerated text, for the error message.
 */
export function compareArtifact(committed, regenerated) {
  const a = normalize(committed).split('\n');
  const b = normalize(regenerated).split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return { fresh: false, firstDiffLine: i + 1 };
  }
  return { fresh: true, firstDiffLine: null };
}

function gitShowHead(repoRoot, relPath) {
  const res = spawnSync('git', ['show', `HEAD:${relPath}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) return null;
  return res.stdout;
}

/**
 * Compare every generated artifact in `repoRoot` against HEAD.
 * @returns {{ code: 0|1|2, stale: string[], missing: string[] }}
 */
export function checkFreshness(repoRoot, artifacts = GENERATED_ARTIFACTS) {
  const stale = [];
  const missing = [];
  for (const rel of artifacts) {
    const abs = join(repoRoot, rel);
    const committed = gitShowHead(repoRoot, rel);
    if (committed === null || !existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    const regenerated = readFileSync(abs, 'utf8');
    const { fresh, firstDiffLine } = compareArtifact(committed, regenerated);
    if (!fresh) stale.push(`${rel}:${firstDiffLine}`);
  }
  const code = missing.length > 0 ? 2 : stale.length > 0 ? 1 : 0;
  return { code, stale, missing };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const REPO_ROOT = resolve(HERE, '..', '..');
  const { code, stale, missing } = checkFreshness(REPO_ROOT);
  for (const m of missing) console.error(`[artifact-freshness] MISSING: ${m}`);
  for (const s of stale) console.error(`[artifact-freshness] STALE: ${s} (committed artifact differs from regenerated output)`);
  if (code === 0) {
    console.log(`[artifact-freshness] PASS — ${GENERATED_ARTIFACTS.length} committed artifacts match the generator output.`);
  } else {
    console.error(
      '[artifact-freshness] FAIL — run `node tools/doc-graph/ci-gate.mjs` on this HEAD and commit the regenerated artifacts with the documentation change (AGENTS.md → Documentation changes).'
    );
  }
  process.exit(code);
}
