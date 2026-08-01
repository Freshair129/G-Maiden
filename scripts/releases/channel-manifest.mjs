#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const CHANNELS = new Set(['dev', 'closed-beta', 'stable']);

export function validateManifest(m) {
  const required = ['schemaVersion','channel','version','sourceSha','publishedAt','platforms'];
  for (const key of required) if (!m?.[key]) throw new Error(`manifest missing ${key}`);
  if (m.schemaVersion !== 1) throw new Error('unsupported schemaVersion');
  if (!CHANNELS.has(m.channel)) throw new Error(`invalid channel: ${m.channel}`);
  if (!/^[0-9a-f]{40}$/i.test(m.sourceSha)) throw new Error('sourceSha must be a full git SHA');
  if (!m.platforms || typeof m.platforms !== 'object' || Array.isArray(m.platforms)) throw new Error('platforms must be an object');
  const entries = Object.entries(m.platforms);
  if (entries.length === 0) throw new Error('platforms must be non-empty');
  for (const [platform, artifact] of entries) {
    for (const key of ['url','signature']) if (!artifact?.[key]) throw new Error(`platform ${platform} missing ${key}`);
    if (artifact.sha256 && !/^[0-9a-f]{64}$/i.test(artifact.sha256)) throw new Error(`invalid sha256 for ${platform}`);
  }
  return m;
}

export function validatePublishedManifest(m) {
  validateManifest(m);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(m.version) || m.version === '0.0.0') {
    throw new Error('published manifest requires a real SemVer version');
  }
  if (/^0+$/.test(m.sourceSha)) throw new Error('published manifest cannot use a zero sourceSha');
  if (Date.parse(m.publishedAt) <= 0) throw new Error('published manifest requires a real publishedAt');
  for (const [platform, artifact] of Object.entries(m.platforms)) {
    if (!/^https:\/\//.test(artifact.url) || artifact.url.includes('example.invalid')) {
      throw new Error(`platform ${platform} has a non-production artifact URL`);
    }
    if (!artifact.signature || artifact.signature === 'not-published') {
      throw new Error(`platform ${platform} has no updater signature`);
    }
    if (!/^[0-9a-f]{64}$/i.test(artifact.sha256) || /^0+$/.test(artifact.sha256)) {
      throw new Error(`platform ${platform} has no artifact SHA-256`);
    }
  }
  return m;
}

export async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

export function promoteManifest(candidate, previous, approval, publishedAt = new Date().toISOString()) {
  validateManifest(candidate);
  validateManifest(previous);
  if (!['dev','closed-beta'].includes(candidate.channel)) throw new Error('only candidate channels can be promoted');
  if (approval.version !== candidate.version || approval.sourceSha !== candidate.sourceSha) {
    throw new Error('approval does not match candidate');
  }
  if (approval.unresolvedS0S1 !== 0) throw new Error('promotion blocked by unresolved S0/S1 issues');
  const promoted = {
    ...candidate,
    channel: 'stable',
    publishedAt,
    promotion: {
      approver: approval.approver,
      approvedAt: approval.approvedAt,
      previousVersion: previous.version,
      candidateManifest: approval.candidateManifest,
      evidence: approval.evidence
    }
  };
  return validateManifest(promoted);
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === 'validate') {
    const path = resolve(args[0]);
    validateManifest(JSON.parse(await readFile(path, 'utf8')));
    console.log(`valid: ${path}`);
    return;
  }
  if (cmd === 'validate-published') {
    const path = resolve(args[0]);
    validatePublishedManifest(JSON.parse(await readFile(path, 'utf8')));
    console.log(`valid published manifest: ${path}`);
    return;
  }
  if (cmd === 'promote') {
    const [candidatePath, stablePath, approvalPath] = args.map(resolve);
    const candidate = validateManifest(JSON.parse(await readFile(candidatePath, 'utf8')));
    const approval = JSON.parse(await readFile(approvalPath, 'utf8'));
    const previous = validateManifest(JSON.parse(await readFile(stablePath, 'utf8')));
    const promoted = promoteManifest(candidate, previous, { ...approval, candidateManifest: candidatePath });
    await atomicWrite(stablePath, promoted);
    console.log(`promoted ${candidate.version}; updater URLs, hashes and signatures preserved`);
    return;
  }
  throw new Error('usage: channel-manifest.mjs validate <file> | validate-published <file> | promote <candidate> <stable> <approval>');
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/channel-manifest.mjs')) {
  main().catch((error) => { console.error(error.message); process.exit(1); });
}
