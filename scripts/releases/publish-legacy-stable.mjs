import { execFile as execFileCallback } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { sha256File, validatePublishedManifest } from './channel-manifest.mjs';
import { validateLegacyPublication } from './legacy-publication.mjs';

const execFile = promisify(execFileCallback);
const defaultRun = async (cmd, args) => (await execFile(cmd, args, { maxBuffer: 1024 * 1024 })).stdout.trim();
const repo = 'Freshair129/G-Maiden';
const defaultFetchLatest = async () => {
  const response = await fetch(`https://github.com/${repo}/releases/latest/download/latest.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`legacy updater endpoint returned ${response.status}`);
  return response.json();
};
const defaultFetchArtifact = async (url, path) => {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error(`public artifact endpoint returned ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path, { flags: 'wx' }));
};
export async function publishLegacyStable({ run = defaultRun, read = readFile, write = writeFile, hash = sha256File, makeTemp = () => mkdtemp(join(tmpdir(), 'gmaiden-legacy-release-')), removeTemp = (dir) => rm(dir, { recursive: true, force: true }), fetchLatest = defaultFetchLatest, fetchArtifact = defaultFetchArtifact, githubSha = process.env.GITHUB_SHA, dryRun = process.env.DRY_RUN } = {}) {
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
  const config = JSON.parse(await read('src-tauri/tauri.conf.json', 'utf8'));
  const publicKey = config?.plugins?.updater?.pubkey;
  if (typeof publicKey !== 'string' || !publicKey) throw new Error('packaged updater public key missing');
  for (const ref of [tagCommit, 'refs/tags/v0.13.0', 'refs/tags/v0.13.4']) {
    const oldConfig = JSON.parse(await run('git', ['show', `${ref}:src-tauri/tauri.conf.json`]));
    if (oldConfig?.plugins?.updater?.pubkey !== publicKey) throw new Error(`updater public key mismatch at ${ref}`);
  }
  const verifyAssets = async (folder, manifest, selectedRelease, expectedPrerelease, publicRead = false) => {
    const keyPath = join(folder, 'updater.pub');
    await write(keyPath, publicKey, 'utf8');
    const hashes = {};
    for (const artifact of Object.values(stable.platforms)) {
      if (!artifact.url.startsWith(prefix)) throw new Error('unexpected artifact URL');
      const name = artifact.url.slice(prefix.length);
      if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('unexpected artifact filename');
      if (!hashes[artifact.url]) {
        if (publicRead) await fetchArtifact(artifact.url, join(folder, name));
        else await run('gh', ['release', 'download', tag, '--repo', repo, '--pattern', name, '--dir', folder]);
        hashes[artifact.url] = await hash(join(folder, name));
      }
      const signaturePath = join(folder, `${name}.updater-signature`);
      await write(signaturePath, artifact.signature, 'utf8');
      await run('cargo', ['run', '--locked', '--quiet', '--manifest-path', 'tools/verify-updater-signature/Cargo.toml', '--', join(folder, name), signaturePath, keyPath]);
    }
    validateLegacyPublication({ stable, latest: manifest, release: selectedRelease, tagCommit, currentLatestTag, downloadedHashes: hashes, expectedPrerelease });
  };
  await verifyAssets(dir, latest, release, true);
  const assertRemoteState = async (expectedLatest) => {
    const remoteMain = (await run('git', ['ls-remote', 'origin', 'refs/heads/main'])).split(/\s+/)[0];
    if (!githubSha || remoteMain !== githubSha) throw new Error('main changed since the approved workflow started');
    const refs = await run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`]);
    const lines = refs.split(/\r?\n/).map((line) => line.split(/\s+/));
    const peeled = lines.find((line) => line[1] === `refs/tags/${tag}^{}`);
    const direct = lines.find((line) => line[1] === `refs/tags/${tag}`);
    if ((peeled ?? direct)?.[0] !== tagCommit) throw new Error('remote tag moved or disappeared');
    const observedLatest = await run('gh', ['api', `repos/${repo}/releases/latest`, '--jq', '.tag_name']);
    if (observedLatest !== expectedLatest) throw new Error('latest release changed concurrently');
  };
  await assertRemoteState(currentLatestTag);
  await run('git', ['merge-base', '--is-ancestor', tagCommit, githubSha]);
  if (dryRun === 'true') {
    console.log(`Validated ${tag}; dry run did not change the release.`);
  } else if (dryRun === 'false') {
    await assertRemoteState(currentLatestTag);
    await run('gh', ['release', 'edit', tag, '--repo', repo, '--prerelease=false', '--latest']);
    await assertRemoteState(tag);
    const published = JSON.parse(await run('gh', ['api', `repos/${repo}/releases/tags/${tag}`]));
    if (published.tag_name !== tag || published.draft !== false || published.prerelease !== false) throw new Error('published release read-back diverged');
    const publicLatest = await fetchLatest();
    const postDir = await makeTemp();
    try {
      await verifyAssets(postDir, publicLatest, published, false, true);
    } finally {
      await removeTemp(postDir);
    }
    await assertRemoteState(tag);
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
