import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bucketForPath,
  uniqueBuckets,
  hasExplicitScopeRationale,
  needsScopeJustification,
  shouldRunDocGraphGate,
  ciCheckConclusion,
  evaluatePrGate,
} from './rules.mjs';

test('bucketForPath groups known roots', () => {
  assert.equal(bucketForPath('docs/change request/CR-033.md'), 'docs');
  assert.equal(bucketForPath('.github/workflows/pr-gate-agent.yml'), '.github/workflows');
  assert.equal(bucketForPath('src-tauri/src/main.rs'), 'src-tauri');
  assert.equal(bucketForPath('src/src/App.tsx'), 'src');
});

test('scope rationale detection accepts summary section', () => {
  assert.equal(hasExplicitScopeRationale('## Summary\nhello'), true);
  assert.equal(hasExplicitScopeRationale('plain body'), false);
});

test('needs scope justification for workflow or many buckets', () => {
  assert.equal(needsScopeJustification(['docs/a.md']), false);
  assert.equal(needsScopeJustification(['.github/workflows/x.yml']), true);
  assert.equal(needsScopeJustification(['docs/a.md', 'src/a.ts', 'src-tauri/a.rs', 'supabase/a.sql']), true);
});

test('shouldRunDocGraphGate only for doc-governance touching paths', () => {
  assert.equal(shouldRunDocGraphGate(['docs/a.md']), true);
  assert.equal(shouldRunDocGraphGate(['AGENTS.md']), true);
  assert.equal(shouldRunDocGraphGate(['src/src/App.tsx']), false);
});

test('ciCheckConclusion finds ci run', () => {
  const result = ciCheckConclusion([{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }]);
  assert.deepEqual(result, { status: 'COMPLETED', conclusion: 'SUCCESS' });
});

test('evaluatePrGate fails non-draft PR when ci is not green', () => {
  const findings = evaluatePrGate({
    pr: { draft: false, mergeable: 'MERGEABLE' },
    changedPaths: ['src/src/App.tsx'],
    checkRuns: [{ name: 'ci', status: 'IN_PROGRESS', conclusion: '' }],
    body: '## Summary\nx',
  });
  assert.equal(findings.some((f) => f.code === 'ci-not-green'), true);
});

test('evaluatePrGate allows draft PR to skip ci enforcement', () => {
  const findings = evaluatePrGate({
    pr: { draft: true, mergeable: 'MERGEABLE' },
    changedPaths: ['docs/a.md'],
    checkRuns: [],
    body: '',
  });
  assert.equal(findings.some((f) => f.code === 'missing-ci'), false);
});

test('uniqueBuckets deduplicates and sorts', () => {
  assert.deepEqual(uniqueBuckets(['src/a.ts', 'docs/a.md', 'src/b.ts']), ['docs', 'src']);
});
