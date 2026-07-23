#!/usr/bin/env node
import { appendFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import {
  evaluatePrGate,
  shouldRunDocGraphGate,
} from './rules.mjs';

const repo = process.env.GITHUB_REPOSITORY;
const eventPath = process.env.GITHUB_EVENT_PATH;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const reviewToken = process.env.PR_GATE_AGENT_REVIEW_TOKEN || '';
const apiBase = process.env.GITHUB_API_URL || 'https://api.github.com';

if (!repo || !eventPath || !token) {
  console.error('[pr-gate-agent] Missing GITHUB_REPOSITORY, GITHUB_EVENT_PATH, or GITHUB_TOKEN.');
  process.exit(1);
}

const event = JSON.parse(await import('node:fs/promises').then((m) => m.readFile(eventPath, 'utf8')));
const prNumber = event.pull_request?.number;
if (!prNumber) {
  console.error('[pr-gate-agent] No pull_request payload found.');
  process.exit(1);
}

async function gh(path, init = {}) {
  const res = await fetch(`${apiBase}/repos/${repo}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method || 'GET'} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function ghReview(path, body) {
  const res = await fetch(`${apiBase}/repos/${repo}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${reviewToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`POST ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function writeSummary(text) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) appendFileSync(summary, `${text}\n`);
}

function shortFindingLine(f) {
  return `- [${f.severity.toUpperCase()}] ${f.code}: ${f.message}`;
}

const pr = await gh(`/pulls/${prNumber}`);
const files = await gh(`/pulls/${prNumber}/files?per_page=100`);
const changedPaths = files.map((f) => f.filename);
const combinedStatus = await gh(`/commits/${pr.head.sha}/check-runs`);
const checkRuns = combinedStatus.check_runs ?? [];

let findings = evaluatePrGate({
  pr,
  changedPaths,
  checkRuns,
  body: pr.body ?? '',
});

if (shouldRunDocGraphGate(changedPaths)) {
  const docGate = spawnSync(process.execPath, ['tools/doc-graph/ci-gate.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 300_000,
  });
  if ((docGate.status ?? -1) !== 0) {
    findings.push({
      severity: 'error',
      code: 'doc-graph-gate',
      message: `Doc governance gate failed.\n${(docGate.stdout ?? '').trim().slice(-1500)}`,
    });
  }
}

const isDraft = Boolean(pr.draft);
const hasErrors = findings.some((f) => f.severity === 'error');
const conclusion = hasErrors ? 'FAIL' : 'PASS';

writeSummary(`# PR Gate Agent\n`);
writeSummary(`- PR: #${pr.number} ${pr.title}`);
writeSummary(`- Draft: ${isDraft ? 'yes' : 'no'}`);
writeSummary(`- Result: ${conclusion}`);
writeSummary(`- Changed files: ${changedPaths.length}`);
for (const f of findings) writeSummary(shortFindingLine(f));
if (!findings.length) writeSummary('- No blocking findings.');

const reviewBody = [
  `PR gate agent result: **${conclusion}**`,
  '',
  ...(!findings.length ? ['No blocking findings detected.'] : findings.map(shortFindingLine)),
].join('\n');

if (reviewToken && !isDraft) {
  try {
    await ghReview(`/pulls/${prNumber}/reviews`, {
      body: reviewBody,
      event: hasErrors ? 'REQUEST_CHANGES' : 'APPROVE',
    });
    writeSummary(`- Advisory review: posted (${hasErrors ? 'REQUEST_CHANGES' : 'APPROVE'})`);
  } catch (error) {
    findings.push({
      severity: 'error',
      code: 'review-post-failed',
      message: `Failed to post advisory review: ${error.message}`,
    });
    writeSummary(`- Advisory review failed: ${error.message}`);
  }
}

if (findings.some((f) => f.code === 'review-post-failed')) {
  process.exit(1);
}

if (hasErrors) {
  console.error('[pr-gate-agent] FAIL');
  for (const f of findings) console.error(shortFindingLine(f));
  process.exit(1);
}

console.log('[pr-gate-agent] PASS');
