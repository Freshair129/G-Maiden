import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { sha256File, validatePublishedManifest } from './channel-manifest.mjs';
import { validateLegacyPublication } from './legacy-publication.mjs';

const execFile = promisify(execFileCallback);
const defaultRun = async (cmd, args) => (await execFile(cmd, args, { maxBuffer: 1024 * 1024 })).stdout.trim();
const repo = 'Freshair129/G-Maiden';
export async function publishLegacyStable({ run = defaultRun, read = readFile, hash = sha256File, makeTemp = () => mkdtemp(join(tmpdir(), 'gmaiden-legacy-release-')), removeTemp = (dir) => rm(dir, { recursive: true, force: true }), githubSha = process.env.GITHUB_SHA, dryRun = process.env.DRY_RUN } = {}) {
const stable = validatePublishedManifest(JSON.parse(await read('release/channels/stable.json', 'utf8')));
if (stable.channel !== 'stable' || !/^\d+\.\d+\.\d+$/.test(stable.version)) throw new Error('published stable manifest required');
const tag = `v${stable.version}`;
const prefix = `https://github.com/${repo}/releases/download/${tag}/`;
const release = JSON.parse(await run('gh', ['api', `repos/${repo}/releases/tags/${tag}`]));
const currentLatestTag = await run('gh', ['api', `repos/${repo}/releases/latest`, '--jq', '.tag_name']);
const tagCommit = await run('git', ['rev-list', '-n', '1', `refs/tags/${tag}`]);
const dir = await makeTemp();
try {
  await run('gh', ['release', 'download', tag, '--repo', repo, '--pattern', 'latest.json', '--dir', dir]);
  const latest = JSON.parse(await read(join(dir, 'latest.json'), 'utf8'));
  const hashes = {};
  for (const artifact of Object.values(stable.platforms)) {
    if (!artifact.url.startsWith(prefix)) throw new Error('unexpected artifact URL');
    const name = artifact.url.slice(prefix.length);
    if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('unexpected artifact filename');
    if (hashes[artifact.url]) continue;
    await run('gh', ['release', 'download', tag, '--repo', repo, '--pattern', name, '--dir', dir]);
    hashes[artifact.url] = await hash(join(dir, name));
  }
  validateLegacyPublication({ stable, latest, release, tagCommit, currentLatestTag, downloadedHashes: hashes });
  const remoteMain = (await run('git', ['ls-remote', 'origin', 'refs/heads/main'])).split(/\s+/)[0];
  if (!githubSha || remoteMain !== githubSha) throw new Error('main changed since the approved workflow started');
  if (dryRun === 'true') {
    console.log(`Validated ${tag}; dry run did not change the release.`);
  } else if (dryRun === 'false') {
    await run('gh', ['release', 'edit', tag, '--repo', repo, '--prerelease=false', '--latest']);
    console.log(`Published the already-approved ${tag} release as latest.`);
  } else {
    throw new Error('DRY_RUN must be true or false');
  }
} finally {
  await removeTemp(dir);
}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await publishLegacyStable();
}
