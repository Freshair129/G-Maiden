#!/usr/bin/env node
/**
 * tools/doc-graph/orphan-report.mjs
 *
 * Deterministic orphaned-feature-spec detector for G-Maiden/G-Orchestra docs.
 *
 * Conservative by design:
 * - Candidate feature specs are detected only from explicit locations/signals:
 *   - docs/features/FEAT-*.md
 *   - orchestration/docs/FEAT--*.md
 *   - orchestration/docs/SPEC--*.md
 *   - docs/change request/CR-*.md only when the document advertises itself as
 *     an additive feature/capability spec (for example "additive feature" or
 *     a module-spec block)
 *   - docs declaring feature metadata (`feature_id`, `doc_type: feature*`)
 * - Classification uses only repo-local evidence: feature-ledger manifest,
 *   atomic index inbound links, docs/features/README, PROJECT_FEATURE_MAP.md,
 *   and the document's own lifecycle markers.
 *
 * Generated outputs:
 *   - docs/FEATURE-ORPHAN-REPORT.md
 *   - docs/FEATURE-ORPHAN-REPORT.json
 *
 * Exit codes:
 *   0 = no blocking orphan-governance regressions
 *   1 = blocking violation (confirmed orphan, bad superseded_by, or orphan
 *       candidate count above baseline)
 *   2 = fatal error
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIndex } from './atomic-index.mjs';
import { loadManifest, resolveRefs } from './ledger-manifest.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const GENERATED_MARKER =
  'GENERATED — do not hand-edit; re-run tools/doc-graph/orphan-report.mjs';

export const CLASS_ORDER = [
  'anchored',
  'planned',
  'weakly-anchored',
  'superseded',
  'archived',
  'orphan-candidate',
  'confirmed-orphan',
];

const INACTIVE_STATUSES = new Set(['historical', 'superseded', 'deprecated', 'archived']);
const ARCHIVED_STATUSES = new Set(['historical', 'archived', 'deprecated']);
const LIFECYCLE_STATUSES = new Set(['planned', 'superseded', 'rejected', 'archived', 'historical']);

function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

function readUtf8(absPath) {
  let text = readFileSync(absPath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

function extractFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (!/^---[ \t]*$/.test(lines[0] ?? '')) return {};
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    if (/^---[ \t]*$/.test(lines[i])) break;
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

function featureDisplayNameFromSlug(slug) {
  if (!slug.startsWith('FEAT-G-')) return null;
  return slug
    .slice('FEAT-G-'.length)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join('-')
    .replace(/^([A-Z])/, 'G-$1');
}

export function isFeatureLikeChangeRequest(text) {
  const t = String(text);
  return (
    /\badditive feature\b/i.test(t) ||
    /^##\s+3(?:\.\d+)?\s+Module specifications/im.test(t) ||
    /^\| \*\*G-[A-Za-z-]+\*\* \|/m.test(t) ||
    /\bG-Ear\b|\bG-Intent\b|\bG-Browser\b/.test(t)
  );
}

export function isFeatureBearingDoc(path, text) {
  const p = toPosix(path);
  const name = basename(p);
  const fm = extractFrontmatter(text);
  const docType = String(fm.doc_type ?? fm['attributes.doc_type'] ?? '').toLowerCase();
  if (p.startsWith('docs/features/FEAT-') && name.endsWith('.md')) return true;
  if (p.startsWith('orchestration/docs/FEAT--') && name.endsWith('.md')) return true;
  if (p.startsWith('orchestration/docs/SPEC--') && name.endsWith('.md')) return true;
  if (p.startsWith('docs/change request/CR-') && name.endsWith('.md')) {
    return isFeatureLikeChangeRequest(text);
  }
  if (fm.feature_id) return true;
  if (docType.startsWith('feature')) return true;
  return false;
}

export function isActiveDoc(indexEntry) {
  const status = String(indexEntry?.status ?? '').toLowerCase();
  const path = toPosix(indexEntry?.path ?? '');
  if (INACTIVE_STATUSES.has(status)) return false;
  if (
    path.startsWith('docs/audits/') ||
    path.startsWith('docs/rca/') ||
    path === 'docs/DOC-GRAPH-REPORT.md' ||
    path === 'docs/FEATURE-LEDGER.md' ||
    path === 'docs/FEATURE-ORPHAN-REPORT.md'
  ) {
    return false;
  }
  return true;
}

function explicitLifecycleSignals(text, fm, status) {
  const signals = new Set();
  const t = String(text);
  const lowerStatus = String(status ?? fm.status ?? '').toLowerCase();
  if (lowerStatus && LIFECYCLE_STATUSES.has(lowerStatus)) signals.add(lowerStatus);
  if (/\bplanned\b/i.test(t) || /post-v1\.0/i.test(t) || /ยังไม่ได้ทำ|ยังไม่ได้ implement|ยังไม่ได้ wire/i.test(t)) {
    signals.add('planned');
  }
  if (
    lowerStatus === 'superseded' ||
    (fm.superseded_by && String(fm.superseded_by).toLowerCase() !== 'null') ||
    /^\s*status\s*:\s*["']?superseded["']?/im.test(t) ||
    /\bsuperseded by\b/i.test(t)
  ) {
    signals.add('superseded');
  }
  if (/\bhistorical\b/i.test(t)) signals.add('historical');
  if (/\barchived\b/i.test(t)) signals.add('archived');
  if (/\brejected\b/i.test(t)) signals.add('rejected');
  return signals;
}

function supersededByTarget(text, fm) {
  const fmValue = fm.superseded_by;
  if (fmValue && String(fmValue).toLowerCase() !== 'null') return String(fmValue).trim();
  const m = /^\s*superseded_by\s*:\s*["']?([^"'\r\n]+)["']?/im.exec(text);
  if (m && m[1] && m[1].toLowerCase() !== 'null') return m[1].trim();
  return null;
}

function buildIncomingMap(index) {
  const incoming = new Map();
  for (const doc of index) {
    for (const link of doc.outbound?.wikilinks ?? []) {
      if (!incoming.has(link.slug)) incoming.set(link.slug, []);
      incoming.get(link.slug).push({ from: doc.path, status: doc.status ?? null, line: link.line });
    }
  }
  return incoming;
}

function rowsByDocPath(resolvedManifest) {
  const byPath = new Map();
  for (const row of resolvedManifest) {
    const docsRefs = Array.isArray(row.refs?.docs)
      ? row.refs.docs
      : row.refs?.docs
        ? [row.refs.docs]
        : [];
    for (const ref of docsRefs) {
      const key = toPosix(ref);
      if (!byPath.has(key)) byPath.set(key, []);
      byPath.get(key).push(row);
    }
  }
  return byPath;
}

function lookupFeatureMapStatus(projectFeatureMapText, slug, title) {
  const display = featureDisplayNameFromSlug(slug);
  const patterns = [display, title].filter(Boolean);
  for (const pattern of patterns) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\|\\s*\\*\\*${escaped}\\*\\*[^\\n]*\\|\\s*([^|]+?)\\s*\\|`, 'i');
    const m = re.exec(projectFeatureMapText);
    if (m) return m[1];
  }
  return null;
}

export function classifyCandidate(candidate) {
  const {
    strongAnchors,
    weakAnchors,
    lifecycleSignals,
    supersededBy,
    supersededByExists,
    featureMapStatus,
  } = candidate;

  if (lifecycleSignals.has('historical') || lifecycleSignals.has('archived') || lifecycleSignals.has('rejected')) {
    return { classification: 'archived', reason: 'Lifecycle explicitly marks the document as retained history.' };
  }
  if (lifecycleSignals.has('superseded')) {
    if (!supersededBy || !supersededByExists) {
      return {
        classification: 'orphan-candidate',
        reason: 'Document claims superseded lifecycle but the replacement target is missing or unresolved.',
      };
    }
    return { classification: 'superseded', reason: `Lifecycle explicitly supersedes to ${supersededBy}.` };
  }
  if (
    lifecycleSignals.has('planned') ||
    String(featureMapStatus ?? '').toUpperCase().includes('PLANNED')
  ) {
    if (strongAnchors.length > 0 || weakAnchors.length > 0) {
      return { classification: 'planned', reason: 'Document is explicitly planned and remains visible in active registry/docs.' };
    }
  }
  if (strongAnchors.length > 0) {
    return { classification: 'anchored', reason: 'At least one strong anchor exists (registry and/or code evidence).' };
  }
  if (weakAnchors.length > 0) {
    return { classification: 'weakly-anchored', reason: 'Only active document references remain; no strong registry/code anchor found.' };
  }
  return { classification: 'orphan-candidate', reason: 'No strong anchors, no active incoming references, and lifecycle does not explain retention.' };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push(`<!-- ${GENERATED_MARKER} -->`);
  lines.push('');
  lines.push('# FEATURE-ORPHAN-REPORT');
  lines.push('');
  lines.push(`> **${GENERATED_MARKER}**  `);
  lines.push(`> Generated \`${report.generatedAt}\` · candidates=${report.rowCount}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Classification | Count |');
  lines.push('| --- | --- |');
  for (const key of CLASS_ORDER) {
    lines.push(`| ${key} | ${report.summary[key] ?? 0} |`);
  }
  lines.push('');
  if (report.violations.length > 0) {
    lines.push('## Violations');
    lines.push('');
    lines.push('| Path | Type | Blocking | Detail |');
    lines.push('| --- | --- | --- | --- |');
    for (const v of report.violations) {
      lines.push(`| ${v.path} | ${v.type} | ${v.blocking ? 'yes' : 'no'} | ${v.detail} |`);
    }
    lines.push('');
  }
  lines.push('## Details');
  lines.push('');
  lines.push('| ID | Path | Lifecycle | Classification | Strong anchors | Weak anchors | Replacement | Reason |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push(
      `| ${row.id} | ${row.path} | ${row.lifecycle || '—'} | ${row.classification} | ` +
      `${row.strongAnchors.length ? row.strongAnchors.join(', ') : '—'} | ` +
      `${row.weakAnchors.length ? row.weakAnchors.join(', ') : '—'} | ` +
      `${row.supersededBy ?? '—'} | ${row.reason} |`
    );
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

export async function runOrphanReport(opts = {}) {
  const repoRoot = opts.repoRoot ?? REPO_ROOT;
  const docsDir = join(repoRoot, 'docs');
  const orchestrationDocsDir = join(repoRoot, 'orchestration', 'docs');
  const outMd = opts.outMd ?? join(docsDir, 'FEATURE-ORPHAN-REPORT.md');
  const outJson = opts.outJson ?? join(docsDir, 'FEATURE-ORPHAN-REPORT.json');
  let baseline = opts.baseline;
  if (baseline === undefined && existsSync(outJson)) {
    try {
      const prev = JSON.parse(readFileSync(outJson, 'utf8'));
      baseline = Number(prev?.summary?.['orphan-candidate'] ?? 0);
    } catch {
      baseline = 0;
    }
  }
  if (baseline === undefined) baseline = 0;

  const index = buildIndex([docsDir]);
  if (existsSync(orchestrationDocsDir)) {
    const orchIndex = buildIndex([orchestrationDocsDir]).map((entry) => ({
      ...entry,
      path: toPosix(join('orchestration', entry.path)),
    }));
    index.push(...orchIndex);
  }
  const incoming = buildIncomingMap(index);
  const rawTextByPath = new Map();
  for (const entry of index) {
    const abs = join(repoRoot, entry.path);
    if (existsSync(abs)) rawTextByPath.set(entry.path, readUtf8(abs));
  }

  const manifestPath = join(docsDir, 'feature-ledger.manifest.yaml');
  const manifestRows = existsSync(manifestPath) ? resolveRefs(loadManifest(manifestPath), repoRoot) : [];
  const manifestByDoc = rowsByDocPath(manifestRows);
  const featureMapText = existsSync(join(repoRoot, 'PROJECT_FEATURE_MAP.md'))
    ? readUtf8(join(repoRoot, 'PROJECT_FEATURE_MAP.md'))
    : '';
  const featuresReadmeText = existsSync(join(docsDir, 'features', 'README.md'))
    ? readUtf8(join(docsDir, 'features', 'README.md'))
    : '';

  const rows = [];
  for (const entry of index) {
    const abs = join(repoRoot, entry.path);
    if (!existsSync(abs)) continue;
    const text = readUtf8(abs);
    if (!isFeatureBearingDoc(entry.path, text)) continue;

    const fm = extractFrontmatter(text);
    const status = String(entry.status ?? fm.status ?? '').toLowerCase() || null;
    const lifecycleSignals = explicitLifecycleSignals(text, fm, status);
    const mappedRows = manifestByDoc.get(toPosix(entry.path)) ?? [];
    const activeIncoming = (incoming.get(entry.slug) ?? []).filter((ref) => ref.from !== entry.path)
      .filter((ref) => isActiveDoc({ path: ref.from, status: ref.status }));
    const strongAnchors = [];
    const weakAnchors = [];

    if (mappedRows.length > 0) strongAnchors.push('feature-ledger');
    if (mappedRows.some((row) => row.exists.code)) strongAnchors.push('code-evidence');
    if (featuresReadmeText.includes(`[[${entry.slug}]]`)) strongAnchors.push('features-readme');
    const featureMapStatus = lookupFeatureMapStatus(featureMapText, entry.slug, entry.title);
    if (featureMapStatus) strongAnchors.push('project-feature-map');
    if (activeIncoming.length > 0) {
      weakAnchors.push(...activeIncoming.map((ref) => ref.from));
    }
    const baseName = basename(entry.path);
    for (const doc of index) {
      if (doc.path === entry.path) continue;
      if (!isActiveDoc(doc)) continue;
      const sourceText = rawTextByPath.get(doc.path) ?? '';
      if (sourceText.includes(baseName) || sourceText.includes(`[[${entry.slug}]]`)) {
        weakAnchors.push(doc.path);
      }
    }

    const supersededBy = supersededByTarget(text, fm);
    let supersededByExists = true;
    if (supersededBy) {
      const normalized = supersededBy.endsWith('.md')
        ? supersededBy
        : supersededBy.includes('/')
          ? `${supersededBy}.md`
          : null;
      supersededByExists = normalized
        ? existsSync(join(repoRoot, normalized))
        : index.some((doc) => doc.slug === supersededBy || basename(doc.path, '.md') === supersededBy);
    }

    const lifecycle =
      status ||
      (lifecycleSignals.has('planned')
        ? 'planned'
        : lifecycleSignals.has('superseded')
          ? 'superseded'
          : lifecycleSignals.has('historical')
            ? 'historical'
            : lifecycleSignals.has('archived')
              ? 'archived'
              : null);

    const { classification, reason } = classifyCandidate({
      strongAnchors: [...new Set(strongAnchors)],
      weakAnchors: [...new Set(weakAnchors)],
      lifecycleSignals,
      supersededBy,
      supersededByExists,
      featureMapStatus,
    });

    rows.push({
      id: fm.feature_id ?? entry.slug,
      slug: entry.slug,
      path: entry.path,
      lifecycle,
      classification,
      strongAnchors: [...new Set(strongAnchors)],
      weakAnchors: [...new Set(weakAnchors)],
      supersededBy,
      supersededByExists,
      reason,
    });
  }

  rows.sort((a, b) => a.path.localeCompare(b.path));
  const summary = Object.fromEntries(CLASS_ORDER.map((key) => [key, 0]));
  for (const row of rows) summary[row.classification] = (summary[row.classification] ?? 0) + 1;

  const violations = [];
  for (const row of rows) {
    if (row.classification === 'confirmed-orphan') {
      violations.push({
        path: row.path,
        type: 'confirmed-orphan',
        blocking: true,
        detail: 'Document is explicitly classified as a confirmed orphan.',
      });
    }
    if (row.lifecycle === 'superseded' && (!row.supersededBy || !row.supersededByExists)) {
      violations.push({
        path: row.path,
        type: 'missing-superseded-by',
        blocking: true,
        detail: 'Superseded lifecycle is set but the replacement target cannot be resolved.',
      });
    }
  }
  if ((summary['orphan-candidate'] ?? 0) > baseline) {
    violations.push({
      path: '(summary)',
      type: 'orphan-candidate-regression',
      blocking: true,
      detail: `Orphan candidates=${summary['orphan-candidate']} exceeds baseline=${baseline}.`,
    });
  }

  const report = {
    _generated: GENERATED_MARKER,
    generatedAt: new Date().toISOString(),
    baselineOrphanCandidates: baseline,
    rowCount: rows.length,
    summary,
    rows,
    violations,
  };

  writeFileSync(outMd, renderMarkdown(report), 'utf8');
  writeFileSync(outJson, JSON.stringify(report, null, 2) + '\n', 'utf8');

  const exitCode = violations.some((v) => v.blocking) ? 1 : 0;
  return { exitCode, ...report };
}

async function main() {
  try {
    const result = await runOrphanReport();
    console.log(`[orphan-report] rows=${result.rowCount} orphan-candidates=${result.summary['orphan-candidate'] ?? 0}`);
    console.log(`[orphan-report] wrote docs/FEATURE-ORPHAN-REPORT.md`);
    console.log(`[orphan-report] wrote docs/FEATURE-ORPHAN-REPORT.json`);
    if (result.exitCode !== 0) {
      for (const v of result.violations.filter((x) => x.blocking)) {
        console.error(`[orphan-report] BLOCKING ${v.type}: ${v.path} — ${v.detail}`);
      }
    }
    process.exit(result.exitCode);
  } catch (err) {
    console.error(`[orphan-report] FATAL: ${err?.message ?? err}`);
    process.exit(2);
  }
}

const isMain = (() => {
  try {
    return resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] ?? '');
  } catch {
    return false;
  }
})();

if (isMain) {
  main();
}
