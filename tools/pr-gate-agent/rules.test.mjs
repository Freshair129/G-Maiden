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
  hasAgentAttribution,
  commitsMissingAttribution,
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

test('hasAgentAttribution accepts Agent or Co-Authored-By trailers', () => {
  assert.equal(hasAgentAttribution('feat: x\n\nAgent: Claude Fable 5.1'), true);
  assert.equal(hasAgentAttribution('feat: x\n\nCo-Authored-By: Codex <noreply@example.com>'), true);
  assert.equal(hasAgentAttribution('feat: x\n\nagent: lower-case'), true);
  assert.equal(hasAgentAttribution('feat: x\n\nAgent:'), false);
  assert.equal(hasAgentAttribution('feat: x'), false);
});

test('commitsMissingAttribution skips merge commits and reports short sha + subject', () => {
  const commits = [
    { sha: 'aaaaaaa1111', parents: [{}], commit: { message: 'feat: no trailer\n\nbody' } },
    { sha: 'bbbbbbb2222', parents: [{}, {}], commit: { message: "Merge branch 'main'" } },
    { sha: 'ccccccc3333', parents: [{}], commit: { message: 'fix: ok\n\nAgent: Codex' } },
  ];
  assert.deepEqual(commitsMissingAttribution(commits), [{ sha: 'aaaaaaa', subject: 'feat: no trailer' }]);
});

test('evaluatePrGate reports missing attribution as a warning, never an error', () => {
  const findings = evaluatePrGate({
    pr: { draft: false, mergeable: 'MERGEABLE' },
    changedPaths: ['src/src/App.tsx'],
    checkRuns: [{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    body: '## Summary\nx',
    commits: [{ sha: 'abc1234def', parents: [{}], commit: { message: 'feat: x' } }],
  });
  const warn = findings.find((f) => f.code === 'agent-attribution-missing');
  assert.equal(warn.severity, 'warning');
  assert.equal(findings.some((f) => f.severity === 'error'), false);
});

test('evaluatePrGate emits no attribution finding when commits are omitted or all attributed', () => {
  const base = {
    pr: { draft: false, mergeable: 'MERGEABLE' },
    changedPaths: ['src/src/App.tsx'],
    checkRuns: [{ name: 'ci', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    body: '## Summary\nx',
  };
  assert.equal(evaluatePrGate(base).some((f) => f.code === 'agent-attribution-missing'), false);
  const attributed = evaluatePrGate({
    ...base,
    commits: [{ sha: 'abc1234def', parents: [{}], commit: { message: 'feat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>' } }],
  });
  assert.equal(attributed.some((f) => f.code === 'agent-attribution-missing'), false);
});
