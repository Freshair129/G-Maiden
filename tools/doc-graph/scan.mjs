#!/usr/bin/env node
/**
 * tools/doc-graph/scan.mjs
 *
 * Composes T1-T4 (slugmap.mjs, wikilinks.mjs, symlinks.mjs, metadata.mjs) into one
 * CLI: walk docs/**\/*.md, build the slug map, run all validators per file, then
 * write docs/DOC-GRAPH.json (nodes+edges+violations) and docs/DOC-GRAPH-REPORT.md
 * (Thai+English summary).
 *
 * Exit 0 iff violations excluding informational reasons ('no-metadata', 'glob-slug')
 * is empty, else exit 1.
 *
 * Usage:
 *   node tools/doc-graph/scan.mjs [--repo-root <dir>] [--docs-dir <dir>]
 *     [--out-json <file>] [--out-report <file>] [--now <iso-timestamp>] [--strict]
 *
 * --strict additionally runs symlinks.mjs's validateAnchorIntegrity (G2-T7)
 * and blocks the exit code on 'anchor-symbol-mismatch' findings.
 *
 * Library entry point `runScan()` is pure w.r.t. the filesystem it is pointed at
 * (only reads) and never calls Date.now() — generatedAt comes from --now or the
 * max mtime of the scanned doc files, so callers/tests get deterministic output.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSlugMap, collisions } from './slugmap.mjs';
import { extractWikilinks, validateWikilinks } from './wikilinks.mjs';
import { extractSymbolLinks, validateSymbolLinks, validateAnchorIntegrity } from './symlinks.mjs';
import { checkMetadata } from './metadata.mjs';
import { validateFrontmatter } from './frontmatter-rules.mjs';
import { buildIndex } from './atomic-index.mjs';

/** Violation reasons that are informational-only and never fail the exit code. */
export const INFORMATIONAL_REASONS = new Set(['no-metadata', 'glob-slug']);

/**
 * Violation reasons emitted only under --strict that are informational-only
 * (severity 'warning' in frontmatter-rules.mjs) and never fail the exit code.
 * Kept separate from INFORMATIONAL_REASONS (rather than merged into it) so the
 * non-strict export/behavior of INFORMATIONAL_REASONS stays byte-identical —
 * these reasons can only ever be pushed when strict is true (G2-T2).
 */
export const STRICT_INFORMATIONAL_REASONS = new Set(['legacy-status-case']);

/** True iff `reason` should NOT gate the exit code, given whether --strict is on. */
function isInformational(reason, strict) {
  return INFORMATIONAL_REASONS.has(reason) || (strict && STRICT_INFORMATIONAL_REASONS.has(reason));
}

function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * Recursively find every *.md file under `dir`. Returns absolute paths, sorted
 * for deterministic output across platforms/readdir orderings.
 */
function walkMarkdownFiles(dir) {
  const out = [];
  function scan(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        out.push(full);
      }
    }
  }
  scan(dir);
  out.sort();
  return out;
}

/**
 * Mirrors slugmap.mjs's private computeSlug (not exported). Kept local because
 * buildSlugMap()'s Map is single-value-per-slug (last write wins), so it cannot
 * itself report every path in a collision group -- we walk once ourselves to
 * find real duplicate-slug groups, then still call T1's buildSlugMap/collisions
 * for the canonical resolution map (composition) and any collisions it does see.
 */
function slugFor(fullPath, docsDir) {
  const fileName = basename(fullPath);
  if (fileName === 'README.md') {
    const fileDir = dirname(fullPath);
    const relDir = relative(docsDir, fileDir);
    if (relDir === '.') {
      return `${basename(docsDir)}/README`;
    }
    return `${basename(fileDir)}/README`;
  }
  return fileName.slice(0, -3);
}

/**
 * Find genuine duplicate-slug groups (>1 distinct file sharing a slug) by
 * walking the doc tree directly, independent of buildSlugMap's lossy Map.
 * @returns {Map<string, string[]>} slug -> absolute file paths (length > 1)
 */
function findDuplicateSlugGroups(files, docsDir) {
  const bySlug = new Map();
  for (const full of files) {
    const slug = slugFor(full, docsDir);
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push(full);
  }
  const dupes = new Map();
  for (const [slug, paths] of bySlug) {
    if (paths.length > 1) dupes.set(slug, paths);
  }
  return dupes;
}

/**
 * Run the full doc-graph scan against a repo. Pure w.r.t. inputs given (only
 * reads the filesystem rooted at repoRoot/docsDir) -- performs no writes.
 *
 * @param {object} opts
 * @param {string} opts.repoRoot - absolute path to the repository root
 * @param {string} [opts.docsDir] - absolute path to the docs root (default <repoRoot>/docs)
 * @param {string} [opts.now] - ISO timestamp to use verbatim for generatedAt
 * @param {boolean} [opts.strict] - when true, also runs (a) T3's anchor-integrity
 *   check (symlinks.mjs validateAnchorIntegrity), treating its
 *   'anchor-symbol-mismatch' findings as blocking, and (b) the pinned v0.4.0
 *   frontmatter rulebook (frontmatter-rules.mjs validateFrontmatter) over every
 *   frontmatter doc, treating its error-severity reasons (missing-required-field,
 *   invalid-status, missing-approval, doc-id-slug-mismatch) as blocking and its
 *   sole warning-severity reason (legacy-status-case) as informational (see
 *   STRICT_INFORMATIONAL_REASONS). Off by default so existing exit-code
 *   semantics are unchanged for non-strict callers (both checks are opt-in,
 *   not retroactively enforced repo-wide).
 * @returns {{ graph: object, report: string, exitCode: number }}
 */
export function runScan({ repoRoot, docsDir, now, strict } = {}) {
  const root = resolve(repoRoot);
  const docs = resolve(docsDir || join(root, 'docs'));

  const files = walkMarkdownFiles(docs);

  // T1: canonical (lossy, last-write-wins) slug -> docsDir-relative path map,
  // used to resolve wikilink targets exactly as spec'd.
  const slugMapRaw = buildSlugMap(docs);
  const slugMapObj = {};
  for (const [slug, relPath] of slugMapRaw) {
    slugMapObj[slug] = relPath;
  }
  const t1Collisions = collisions(slugMapRaw); // fires for real since the claims-table fix; see note below.
  void t1Collisions;

  const dupGroups = findDuplicateSlugGroups(files, docs);

  const nodes = [];
  const nodeIds = new Set();
  const edges = [];
  const violations = [];

  function addDocNode(repoRel) {
    if (!nodeIds.has(repoRel)) {
      nodeIds.add(repoRel);
      nodes.push({ id: repoRel, type: 'doc', path: repoRel });
    }
  }
  function addCodeNode(repoRel) {
    if (!nodeIds.has(repoRel)) {
      nodeIds.add(repoRel);
      nodes.push({ id: repoRel, type: 'code', path: repoRel });
    }
  }

  // Pre-register every scanned doc as a node (so unresolved-link targets never
  // silently create phantom doc nodes, and every file, even a broken one, shows
  // up in the graph).
  for (const full of files) {
    addDocNode(toPosix(relative(root, full)));
  }

  // T1's collisions() now fires for real (claims-table fix, 2026-07-19), so
  // seeding from it here would double-count what findDuplicateSlugGroups
  // already reports. It stays called above purely as composition/sanity —
  // the canonical duplicate-slug source below owns the violation emission.

  // Real duplicate-slug detection (see findDuplicateSlugGroups doc comment).
  for (const [slug, paths] of dupGroups) {
    const repoRelPaths = paths.map((p) => toPosix(relative(root, p)));
    for (let i = 0; i < paths.length; i++) {
      violations.push({
        file: repoRelPaths[i],
        line: null,
        reason: 'duplicate-slug',
        slug,
        siblings: repoRelPaths.filter((_, j) => j !== i),
      });
    }
  }

  for (const full of files) {
    const repoRel = toPosix(relative(root, full));

    let raw;
    try {
      raw = readFileSync(full, 'utf8');
    } catch (err) {
      violations.push({
        file: repoRel,
        line: null,
        reason: 'read-error',
        message: String(err && err.message ? err.message : err),
      });
      continue;
    }
    const text = stripBom(raw);

    // --- T2: wikilinks -----------------------------------------------------
    const { links, wildcards } = extractWikilinks(text);

    for (const w of wildcards) {
      violations.push({
        file: repoRel,
        line: w.line,
        reason: 'glob-slug',
        slug: w.slug,
      });
    }

    // validateWikilinks only ever emits 'unresolved' now (G15-T1, 2026-07-19):
    // it used to also emit 'collision' for a slug repeated within one doc's
    // links, which was a false positive (58/58 real occurrences were valid
    // slugs cited more than once, zero were true ambiguity). True slug
    // ambiguity across the whole docs/ tree is 'duplicate-slug' below.
    const wikiViolations = validateWikilinks(links, slugMapObj);
    for (const v of wikiViolations) {
      violations.push({
        file: repoRel,
        line: v.line,
        reason: v.reason, // 'unresolved'
        slug: v.slug,
      });
    }

    for (const link of links) {
      const targetDocsRel = slugMapObj[link.slug];
      if (targetDocsRel === undefined) continue; // unresolved, already reported
      const targetRepoRel = toPosix(relative(root, join(docs, targetDocsRel)));
      edges.push({ from: repoRel, to: targetRepoRel, type: 'wikilink', line: link.line });
    }

    // --- T3: symbol links ----------------------------------------------------
    const symLinks = extractSymbolLinks(text);
    const symViolations = validateSymbolLinks(symLinks, root);
    const badSym = new Set(symViolations.map((v) => `${v.target}|${v.line}`));
    for (const v of symViolations) {
      violations.push({
        file: repoRel,
        line: v.line,
        reason: v.reason, // 'missing-file' | 'bad-anchor'
        target: toPosix(v.target),
      });
    }
    for (const link of symLinks) {
      const key = `${link.target}|${link.line}`;
      if (badSym.has(key)) continue;
      const targetRepoRel = toPosix(link.target);
      addCodeNode(targetRepoRel);
      edges.push({ from: repoRel, to: targetRepoRel, type: 'symbol', line: link.line });
    }

    // --- T3b: anchor integrity (--strict only, G2-T7) -----------------------
    // Bounds-only anchor validation (above) passes an anchor pinned to any
    // in-bounds line even if the symbol it names has since moved elsewhere in
    // the file (the G1.5 T7 incident). Only run under --strict so default
    // scan.mjs behavior/exit-code semantics are unchanged.
    if (strict) {
      const anchorViolations = validateAnchorIntegrity(symLinks, root);
      for (const v of anchorViolations) {
        violations.push({
          file: repoRel,
          line: v.line,
          reason: v.reason, // 'anchor-symbol-mismatch'
          target: toPosix(v.target),
          anchor: v.anchor,
          symbol: v.symbol,
        });
      }
    }

    // --- T4: frontmatter/version-changelog ----------------------------------
    const meta = checkMetadata(text, repoRel);
    if (meta.kind === 'none') {
      violations.push({ file: repoRel, line: null, reason: 'no-metadata' });
    }
    for (const v of meta.violations) {
      violations.push({
        file: repoRel,
        line: null,
        reason: v.reason, // 'missing-changelog' | 'version-changelog-mismatch'
        ...(v.frontmatter !== undefined ? { frontmatter: v.frontmatter } : {}),
        ...(v.changelog !== undefined ? { changelog: v.changelog } : {}),
      });
    }

    // --- T4b: frontmatter rulebook (--strict only, G2-T2) -------------------
    // Pinned v0.4.0 rulebook (required fields, status enum, approved_by/date,
    // doc_id<->slug) from frontmatter-rules.mjs. Only invoked under --strict so
    // default scan.mjs behavior/exit-code semantics are unchanged; its
    // 'missing-changelog' / 'version-changelog-mismatch' pass-through is
    // dropped here since the T4 block above already emitted those (avoids
    // double-counting the same violation).
    if (strict) {
      const fm = validateFrontmatter(text, repoRel);
      for (const v of fm.violations) {
        if (v.reason === 'missing-changelog' || v.reason === 'version-changelog-mismatch') continue;
        const { reason, severity, ...extra } = v;
        violations.push({ file: repoRel, line: null, reason, severity, ...extra });
      }
    }
  }

  violations.sort((a, b) => {
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    const al = a.line == null ? Number.POSITIVE_INFINITY : a.line;
    const bl = b.line == null ? Number.POSITIVE_INFINITY : b.line;
    if (al !== bl) return al - bl;
    return a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0;
  });

  const generatedAt = computeGeneratedAt({ now, files });

  const graph = { generatedAt, nodes, edges, violations };
  const report = renderReport({ graph, filesScanned: files.length, strict });

  const blocking = violations.filter((v) => !isInformational(v.reason, strict));
  const exitCode = blocking.length === 0 ? 0 : 1;

  return { graph, report, exitCode };
}

/**
 * generatedAt = --now verbatim (parsed to ISO) if given, else the max mtime
 * across the scanned doc files (deterministic, no wall-clock reads).
 */
export function computeGeneratedAt({ now, files }) {
  if (now) {
    return new Date(now).toISOString();
  }
  let maxMs = 0;
  for (const full of files) {
    try {
      const st = statSync(full);
      if (st.mtimeMs > maxMs) maxMs = st.mtimeMs;
    } catch {
      // ignore unreadable stat; falls through to the running max
    }
  }
  return new Date(maxMs).toISOString();
}

function reasonLabel(reason) {
  const labels = {
    'duplicate-slug': 'สแลกซ้ำ (ของจริง — สองไฟล์แย่งสแลกเดียวกัน) / duplicate slug (true ambiguity — two files claim one slug)',
    unresolved: 'wikilink หาไม่เจอ / unresolved wikilink',
    'glob-slug': 'สแลกแบบ wildcard (informational) / glob slug (informational)',
    'missing-file': 'symbol link ไปยังไฟล์ที่ไม่มีจริง / symbol link to a missing file',
    'bad-anchor': 'เลขบรรทัด anchor ผิดช่วง / symbol link anchor out of range',
    'anchor-symbol-mismatch':
      'anchor อยู่ในช่วงแต่ไม่มีสัญลักษณ์ที่อ้างถึง (--strict) / anchor in-bounds but the named symbol is not near it (--strict)',
    'missing-changelog': 'มี version แต่ไม่มีตาราง Changelog / version set but no Changelog table',
    'version-changelog-mismatch':
      'version ใน frontmatter ไม่ตรงแถวล่าสุดของ Changelog / frontmatter version != last Changelog row',
    'no-metadata': 'ไม่มี metadata หัวเอกสารเลย (informational) / no header metadata at all (informational)',
    'read-error': 'อ่านไฟล์ไม่สำเร็จ / failed to read file',
    'missing-required-field':
      'ขาดฟิลด์ที่จำเป็นใน frontmatter (--strict) / missing a required frontmatter field (--strict)',
    'invalid-status': 'ค่า status ไม่อยู่ใน enum ที่กำหนด (--strict) / status value not in the pinned enum (--strict)',
    'legacy-status-case':
      'status เป็นตัวพิมพ์ใหญ่แบบเก่า (informational, --strict) / legacy capitalized status (informational, --strict)',
    'missing-approval':
      'status accepted/stable แต่ไม่มี approved_by+approved_date (--strict) / accepted|stable status missing approved_by+approved_date (--strict)',
    'doc-id-slug-mismatch':
      'doc_id ไม่ตรงกับ slug ของไฟล์ (--strict) / doc_id does not match the file\'s slug (--strict)',
  };
  return labels[reason] || reason;
}

function renderReport({ graph, filesScanned, strict }) {
  const { generatedAt, nodes, edges, violations } = graph;
  const counts = new Map();
  for (const v of violations) {
    counts.set(v.reason, (counts.get(v.reason) || 0) + 1);
  }
  const blocking = violations.filter((v) => !isInformational(v.reason, strict));
  const exitCode = blocking.length === 0 ? 0 : 1;

  const lines = [];
  lines.push('# G-Maiden Doc Graph Report');
  lines.push('');
  lines.push(`สร้างเมื่อ / Generated at: ${generatedAt}`);
  lines.push('');
  lines.push(
    `สแกน ${filesScanned} ไฟล์เอกสาร, ${nodes.length} nodes, ${edges.length} edges, ${violations.length} รายการปัญหา (${blocking.length} ตัวบล็อก exit code) / ` +
      `scanned ${filesScanned} doc files, ${nodes.length} nodes, ${edges.length} edges, ${violations.length} violations (${blocking.length} blocking exit code).`
  );
  lines.push('');
  lines.push(`ผลลัพธ์ / Result: **${exitCode === 0 ? 'PASS (exit 0)' : 'FAIL (exit 1)'}**`);
  lines.push('');

  lines.push('## สรุปตามประเภทปัญหา / Summary by violation reason');
  lines.push('');
  lines.push('| Reason | คำอธิบาย / Description | Count | Blocking? |');
  lines.push('| --- | --- | --- | --- |');
  if (counts.size === 0) {
    lines.push('| _(none)_ | ไม่พบปัญหา / no violations found | 0 | - |');
  } else {
    const reasons = [...counts.keys()].sort();
    for (const reason of reasons) {
      const blockingFlag = isInformational(reason, strict) ? 'no (informational)' : 'yes';
      lines.push(`| ${reason} | ${reasonLabel(reason)} | ${counts.get(reason)} | ${blockingFlag} |`);
    }
  }
  lines.push('');

  lines.push('## รายการปัญหารายไฟล์ / Per-file violation list');
  lines.push('');
  if (violations.length === 0) {
    lines.push('ไม่มีปัญหาใด ๆ / No violations.');
  } else {
    const byFile = new Map();
    for (const v of violations) {
      if (!byFile.has(v.file)) byFile.set(v.file, []);
      byFile.get(v.file).push(v);
    }
    const filesSorted = [...byFile.keys()].sort();
    for (const file of filesSorted) {
      lines.push(`### ${file}`);
      lines.push('');
      for (const v of byFile.get(file)) {
        const lineStr = v.line == null ? '-' : `L${v.line}`;
        const extras = Object.entries(v)
          .filter(([k]) => !['file', 'line', 'reason'].includes(k))
          .map(([k, val]) => `${k}=${JSON.stringify(val)}`)
          .join(', ');
        lines.push(`- [${lineStr}] **${v.reason}** — ${reasonLabel(v.reason)}${extras ? ` (${extras})` : ''}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n') + '\n';
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(args['repo-root'] || process.cwd());
  const docsDir = args['docs-dir'] ? resolve(args['docs-dir']) : join(repoRoot, 'docs');
  const outJson = args['out-json'] ? resolve(args['out-json']) : join(docsDir, 'DOC-GRAPH.json');
  const outReport = args['out-report'] ? resolve(args['out-report']) : join(docsDir, 'DOC-GRAPH-REPORT.md');
  const outIndex = args['out-index'] ? resolve(args['out-index']) : join(docsDir, 'atomic_index.jsonl');
  const now = typeof args.now === 'string' ? args.now : undefined;
  const strict = Boolean(args.strict);

  const { graph, report, exitCode } = runScan({ repoRoot, docsDir, now, strict });

  // Preserve the G3 ledger block: ledger.mjs MERGES {ledger} into this file
  // additively, but a wholesale scan rewrite used to drop it (found 2026-07-20
  // — scan after ledger erased 699 lines). Scan owns generatedAt/nodes/edges/
  // violations; the ledger key is foreign and must survive a rescan.
  mkdirSync(dirname(outJson), { recursive: true });
  try {
    const prev = JSON.parse(readFileSync(outJson, 'utf8'));
    if (prev && typeof prev === 'object' && prev.ledger !== undefined) {
      graph.ledger = prev.ledger;
    }
  } catch {
    // no previous file / unparseable — nothing to preserve
  }
  writeFileSync(outJson, JSON.stringify(graph, null, 2) + '\n', 'utf8');
  mkdirSync(dirname(outReport), { recursive: true });
  writeFileSync(outReport, report, 'utf8');

  // Build and write atomic index (one JSON line per file, stable key order, LF endings)
  const index = buildIndex([docsDir]);
  mkdirSync(dirname(outIndex), { recursive: true });
  const indexLines = index.map((entry) => {
    // Ensure stable key order: path, slug, title, status, version, headings, outbound
    const ordered = {
      path: entry.path,
      slug: entry.slug,
      title: entry.title,
      status: entry.status,
      version: entry.version,
      headings: entry.headings,
      outbound: entry.outbound,
    };
    return JSON.stringify(ordered);
  });
  writeFileSync(outIndex, indexLines.join('\n') + '\n', 'utf8');

  const blocking = graph.violations.filter((v) => !isInformational(v.reason, strict));
  console.log(
    `[doc-graph] ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.violations.length} violations (${blocking.length} blocking).`
  );
  console.log(`[doc-graph] wrote ${outJson}`);
  console.log(`[doc-graph] wrote ${outReport}`);
  console.log(`[doc-graph] wrote ${outIndex}`);

  process.exitCode = exitCode;
}

const isMain = (() => {
  try {
    return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isMain) {
  main();
}
