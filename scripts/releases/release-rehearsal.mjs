#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateManifest, validatePublishedManifest, promoteManifest } from './channel-manifest.mjs';

const [candidatePath, stablePath, approvalPath, reportPath = 'release/evidence/rehearsal-report.json'] = process.argv.slice(2);
if (!candidatePath || !stablePath || !approvalPath) {
  console.error('usage: release-rehearsal.mjs <candidate> <stable> <approval> [report]');
  process.exit(2);
}

const candidate = JSON.parse(await readFile(resolve(candidatePath), 'utf8'));
const stable = JSON.parse(await readFile(resolve(stablePath), 'utf8'));
const approval = JSON.parse(await readFile(resolve(approvalPath), 'utf8'));
validatePublishedManifest(candidate);
validateManifest(stable);
const promoted = promoteManifest(candidate, stable, { ...approval, candidateManifest: candidatePath }, '2026-01-01T00:00:00.000Z');
if (JSON.stringify(candidate.platforms) !== JSON.stringify(promoted.platforms)) throw new Error('artifact metadata changed during promotion');
if (candidate.sourceSha !== promoted.sourceSha || candidate.version !== promoted.version) throw new Error('source identity changed during promotion');
if (stable.version === promoted.version && stable.sourceSha === promoted.sourceSha) throw new Error('Stable was already on candidate before approval');

const report = {
  scenario: 'dev-to-stable-same-artifact',
  status: 'pass',
  candidate: { channel: candidate.channel, version: candidate.version, sourceSha: candidate.sourceSha, platforms: candidate.platforms },
  stableBefore: { version: stable.version, sourceSha: stable.sourceSha },
  stableAfter: { version: promoted.version, sourceSha: promoted.sourceSha, platforms: promoted.platforms },
  rollback: { supported: true, procedure: 'restore the previous Stable manifest or publish a higher forward-fix version' },
  limitations: ['This rehearsal validates metadata identity and isolation; real GitHub signing, hosting, and updater installation require production artifacts.']
};
const output = resolve(reportPath);
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`rehearsal passed: ${output}`);
