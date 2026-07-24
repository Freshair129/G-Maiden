import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  isFeatureLikeChangeRequest,
  isFeatureBearingDoc,
  isActiveDoc,
  classifyCandidate,
  runOrphanReport,
} from './orphan-report.mjs';

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'g3-orphan-'));
  mkdirSync(join(root, 'docs', 'features'), { recursive: true });
  mkdirSync(join(root, 'docs', 'change request'), { recursive: true });
  mkdirSync(join(root, 'orchestration', 'docs'), { recursive: true });
  mkdirSync(join(root, 'src-tauri', 'src'), { recursive: true });
  writeFileSync(join(root, 'src-tauri', 'src', 'signal.rs'), 'pub fn signal() {}\n', 'utf8');
  writeFileSync(
    join(root, 'PROJECT_FEATURE_MAP.md'),
    [
      '# PROJECT_FEATURE_MAP',
      '| Feature | Status |',
      '| --- | --- |',
      '| **G-Signal** | ⚪ PLANNED |',
      '| **G-Score** | ⚪ PLANNED |',
      '',
    ].join('\n'),
    'utf8'
  );
  writeFileSync(
    join(root, 'docs', 'features', 'README.md'),
    [
      '# G-Series Feature Specifications',
      '',
      '| Module | Doc |',
      '| --- | --- |',
      '| **G-Signal** | [[FEAT-G-SIGNAL]] |',
      '| **G-Score** | [[FEAT-G-SCORE]] |',
      '',
    ].join('\n'),
    'utf8'
  );
  writeFileSync(
    join(root, 'docs', 'feature-ledger.manifest.yaml'),
    [
      'entries:',
      '  - id: g-signal',
      '    title: G-Signal',
      '    kind: feature',
      '    phase_target: P3',
      '    refs:',
      '      docs: [docs/features/FEAT-G-SIGNAL.md]',
      '      code: [src-tauri/src/signal.rs]',
      '',
      '  - id: g-score',
      '    title: G-Score',
      '    kind: feature',
      '    phase_target: P6',
      '    refs:',
      '      docs: [docs/features/FEAT-G-SCORE.md]',
      '',
    ].join('\n'),
    'utf8'
  );
  return root;
}

test('change-request detector is conservative but catches additive feature specs', () => {
  assert.equal(isFeatureLikeChangeRequest('Predecessor: None (additive feature)\n## 3. Module specifications'), true);
  assert.equal(isFeatureLikeChangeRequest('# CR-017\nHistorical migration note'), false);
});

test('feature-bearing detector matches FEAT/SPEC docs and explicit additive CRs only', () => {
  assert.equal(isFeatureBearingDoc('docs/features/FEAT-G-SIGNAL.md', '# FEAT-G-SIGNAL'), true);
  assert.equal(isFeatureBearingDoc('orchestration/docs/SPEC--VERIFY-GATE.md', '# SPEC--VERIFY-GATE'), true);
  assert.equal(isFeatureBearingDoc('docs/change request/CR-004-voice-command-browser.md', 'Predecessor: None (additive feature)'), true);
  assert.equal(isFeatureBearingDoc('docs/change request/CR-017-x.md', '# CR-017\nhistorical'), false);
});

test('active-doc heuristic excludes historical docs and generated audit surfaces', () => {
  assert.equal(isActiveDoc({ path: 'docs/audits/report.md', status: null }), false);
  assert.equal(isActiveDoc({ path: 'docs/product/roadmap.md', status: null }), true);
  assert.equal(isActiveDoc({ path: 'docs/change request/CR-018.md', status: 'historical' }), false);
});

test('classification covers planned, weakly-anchored, archived, superseded, and orphan-candidate', () => {
  assert.equal(
    classifyCandidate({
      strongAnchors: ['feature-ledger'],
      weakAnchors: [],
      lifecycleSignals: new Set(['planned']),
      supersededBy: null,
      supersededByExists: true,
      featureMapStatus: '⚪ PLANNED',
    }).classification,
    'planned'
  );
  assert.equal(
    classifyCandidate({
      strongAnchors: [],
      weakAnchors: ['docs/architecture/adr/ADR-x.md'],
      lifecycleSignals: new Set(),
      supersededBy: null,
      supersededByExists: true,
      featureMapStatus: null,
    }).classification,
    'weakly-anchored'
  );
  assert.equal(
    classifyCandidate({
      strongAnchors: [],
      weakAnchors: [],
      lifecycleSignals: new Set(['historical']),
      supersededBy: null,
      supersededByExists: true,
      featureMapStatus: null,
    }).classification,
    'archived'
  );
  assert.equal(
    classifyCandidate({
      strongAnchors: [],
      weakAnchors: [],
      lifecycleSignals: new Set(['superseded']),
      supersededBy: 'CR-999',
      supersededByExists: true,
      featureMapStatus: null,
    }).classification,
    'superseded'
  );
  assert.equal(
    classifyCandidate({
      strongAnchors: [],
      weakAnchors: [],
      lifecycleSignals: new Set(),
      supersededBy: null,
      supersededByExists: true,
      featureMapStatus: null,
    }).classification,
    'orphan-candidate'
  );
});

test('runOrphanReport classifies planned FEAT docs, weak additive CRs, and true orphan candidates', async () => {
  const root = makeRepo();
  try {
    writeFileSync(
      join(root, 'docs', 'features', 'FEAT-G-SIGNAL.md'),
      '# FEAT-G-SIGNAL\n\nShipped signal doc.\n',
      'utf8'
    );
    writeFileSync(
      join(root, 'docs', 'features', 'FEAT-G-SCORE.md'),
      '# FEAT-G-SCORE\n\nยังไม่ได้ทำ — planned only.\n',
      'utf8'
    );
    writeFileSync(
      join(root, 'docs', 'change request', 'CR-004-voice-command-browser.md'),
      [
        '# CR-004: Voice Command + Stealth Browser',
        '',
        'Predecessor: None (additive feature)',
        '',
        '## 3. Module specifications',
        '',
      ].join('\n'),
      'utf8'
    );
    writeFileSync(
      join(root, 'docs', 'architecture-ref.md'),
      '# ADR helper\n\nSee [[CR-004-voice-command-browser]].\n',
      'utf8'
    );
    writeFileSync(
      join(root, 'docs', 'features', 'FEAT-G-ORPHAN.md'),
      '# FEAT-G-ORPHAN\n\nForgotten spec.\n',
      'utf8'
    );

    const result = await runOrphanReport({
      repoRoot: root,
      outMd: join(root, 'docs', 'FEATURE-ORPHAN-REPORT.md'),
      outJson: join(root, 'docs', 'FEATURE-ORPHAN-REPORT.json'),
      baseline: 1,
    });

    const byPath = new Map(result.rows.map((row) => [row.path, row]));
    assert.equal(byPath.get('docs/features/FEAT-G-SIGNAL.md').classification, 'anchored');
    assert.equal(byPath.get('docs/features/FEAT-G-SCORE.md').classification, 'planned');
    assert.equal(byPath.get('docs/change request/CR-004-voice-command-browser.md').classification, 'weakly-anchored');
    assert.equal(byPath.get('docs/features/FEAT-G-ORPHAN.md').classification, 'orphan-candidate');
    assert.equal(result.summary['orphan-candidate'], 1);
    assert.equal(result.exitCode, 0);

    const md = readFileSync(join(root, 'docs', 'FEATURE-ORPHAN-REPORT.md'), 'utf8');
    assert.match(md, /FEATURE-ORPHAN-REPORT/);
    const json = JSON.parse(readFileSync(join(root, 'docs', 'FEATURE-ORPHAN-REPORT.json'), 'utf8'));
    assert.equal(json.summary['planned'], 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runOrphanReport blocks on unresolved superseded_by and orphan baseline regressions', async () => {
  const root = makeRepo();
  try {
    writeFileSync(
      join(root, 'docs', 'features', 'FEAT-G-SIGNAL.md'),
      '# FEAT-G-SIGNAL\n',
      'utf8'
    );
    writeFileSync(
      join(root, 'orchestration', 'docs', 'FEAT--MULTI-AGENT-ORCHESTRATOR.md'),
      [
        '---',
        'status: "superseded"',
        'superseded_by: "FEAT--MISSING"',
        '---',
        '',
        '# FEAT--MULTI-AGENT-ORCHESTRATOR',
      ].join('\n'),
      'utf8'
    );
    const result = await runOrphanReport({
      repoRoot: root,
      outMd: join(root, 'docs', 'FEATURE-ORPHAN-REPORT.md'),
      outJson: join(root, 'docs', 'FEATURE-ORPHAN-REPORT.json'),
      baseline: 0,
    });
    assert.equal(result.exitCode, 1);
    assert.ok(result.violations.some((v) => v.type === 'missing-superseded-by'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
