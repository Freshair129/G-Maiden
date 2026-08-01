#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const CHANNELS = new Set(['dev', 'closed-beta', 'stable']);

export function validateManifest(m) {
  const required = ['schemaVersion','channel','version','sourceSha','publishedAt','artifacts'];
  for (const key of required) if (!m?.[key]) throw new Error(`manifest missing ${key}`);
  if (m.schemaVersion !== 1) throw new Error('unsupported schemaVersion');
  if (!CHANNELS.has(m.channel)) throw new Error(`invalid channel: ${m.channel}`);
  if (!/^[0-9a-f]{40}$/i.test(m.sourceSha)) throw new Error('sourceSha must be a full git SHA');
  if (!Array.isArray(m.artifacts) || m.artifacts.length === 0) throw new Error('artifacts must be non-empty');
  for (const a of m.artifacts) {
    for (const key of ['platform','url','sha256','signature']) if (!a?.[key]) throw new Error(`artifact missing ${key}`);
    if (!/^[0-9a-f]{64}$/i.test(a.sha256)) throw new Error(`invalid sha256 for ${a.platform}`);
  }
  return m;
}

export async function sha256File(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
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
  if (cmd === 'promote') {
    const [candidatePath, stablePath, approvalPath] = args.map(resolve);
    const candidate = validateManifest(JSON.parse(await readFile(candidatePath, 'utf8')));
    const approval = JSON.parse(await readFile(approvalPath, 'utf8'));
    if (!['dev','closed-beta'].includes(candidate.channel)) throw new Error('only candidate channels can be promoted');
    if (approval.version !== candidate.version || approval.sourceSha !== candidate.sourceSha) throw new Error('approval does not match candidate');
    if (approval.unresolvedS0S1 !== 0) throw new Error('promotion blocked by unresolved S0/S1 issues');
    const previous = JSON.parse(await readFile(stablePath, 'utf8'));
    const promoted = {
      ...candidate,
      channel: 'stable',
      publishedAt: new Date().toISOString(),
      promotion: {
        approver: approval.approver,
        approvedAt: approval.approvedAt,
        previousVersion: previous.version,
        candidateManifest: candidatePath,
        evidence: approval.evidence
      }
    };
    validateManifest(promoted);
    await atomicWrite(stablePath, promoted);
    console.log(`promoted ${candidate.version}; artifact hashes/signatures preserved`);
    return;
  }
  throw new Error('usage: channel-manifest.mjs validate <file> | promote <candidate> <stable> <approval>');
}

main().catch((error) => { console.error(error.message); process.exit(1); });
