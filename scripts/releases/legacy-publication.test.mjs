import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateLegacyPublication } from './legacy-publication.mjs';
import { publishLegacyStable } from './publish-legacy-stable.mjs';

const sourceSha = 'a'.repeat(40);
const sha256 = 'b'.repeat(64);
const url = 'https://github.com/Freshair129/G-Maiden/releases/download/v0.13.5/G-Maiden_0.13.5_x64-setup.exe';
const stable = { schemaVersion: 1, channel: 'stable', version: '0.13.5', sourceSha, publishedAt: '2026-11-03T00:00:00Z', promotion: { approver: 'owner', approvedAt: '2026-11-03T00:00:00Z', evidence: 'release/evidence/approval.json' }, platforms: { 'windows-x86_64-nsis': { url, signature: 'signed', sha256 } } };
const latest = { version: '0.13.5', platforms: { 'windows-x86_64-nsis': { url, signature: 'signed' } } };
const release = { tag_name: 'v0.13.5', draft: false, prerelease: true };
const args = () => ({ stable: structuredClone(stable), latest: structuredClone(latest), release: structuredClone(release), tagCommit: sourceSha, currentLatestTag: 'v0.13.0', downloadedHashes: { [url]: sha256 } });
const fakeRead = async (path) => JSON.stringify(path.endsWith('latest.json') ? latest : path.endsWith('tauri.conf.json') ? { plugins: { updater: { pubkey: 'test-key' } } } : stable);

test('accepts only a published stable manifest matching the signed candidate and bytes', () => {
  assert.doesNotThrow(() => validateLegacyPublication(args()));
});

test('rejects a prerelease before the stable manifest is approved', () => {
  const v = args(); v.stable.channel = 'dev';
  assert.throws(() => validateLegacyPublication(v), /stable/);
});

test('rejects changed versions, source, signatures, paths, bytes and platform sets', () => {
  for (const mutate of [
    (v) => { v.latest.version = '0.13.4'; },
    (v) => { v.release.tag_name = 'v0.13.4'; },
    (v) => { v.tagCommit = 'c'.repeat(40); },
    (v) => { v.latest.platforms['windows-x86_64-nsis'].signature = 'other'; },
    (v) => { v.latest.platforms['windows-x86_64-nsis'].url = 'https://example.invalid/file.exe'; },
    (v) => { v.downloadedHashes[url] = 'c'.repeat(64); },
    (v) => { v.latest.platforms['windows-x86_64'] = { url, signature: 'signed' }; },
    (v) => { v.release.draft = true; },
    (v) => { v.release.prerelease = false; },
    (v) => { delete v.stable.promotion; },
    (v) => { v.currentLatestTag = 'v0.14.0'; },
  ]) {
    const v = args(); mutate(v);
    assert.throws(() => validateLegacyPublication(v));
  }
});

test('legacy publication is manual, main-only and production-approved, after verification', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/publish-legacy-stable.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /node scripts\/releases\/publish-legacy-stable\.mjs/);
  assert.match(workflow, /default: true/);
  assert.doesNotMatch(workflow, /push:\s*\n/);
});

test('mismatched artifacts, moving main or a moved tag never publish and always clean up temporary files', async () => {
  for (const mismatch of ['hash', 'signature', 'main', 'ancestry', 'tag', 'key']) {
    let published = false;
    let removed = false;
    const run = async (cmd, argv) => {
      if (argv.some((arg) => arg.endsWith('/releases/latest'))) return 'v0.13.0';
      if (argv.includes('repos/Freshair129/G-Maiden/releases/tags/v0.13.5')) return JSON.stringify(release);
      if (argv.includes('rev-list')) return sourceSha;
      if (argv.includes('show')) return JSON.stringify({ plugins: { updater: { pubkey: mismatch === 'key' ? 'wrong-key' : 'test-key' } } });
      if (argv.includes('ls-remote') && argv.includes('--tags')) return `${mismatch === 'tag' ? 'c'.repeat(40) : sourceSha}\trefs/tags/v0.13.5`;
      if (argv.includes('ls-remote')) return `${mismatch === 'main' ? 'c'.repeat(40) : sourceSha}\trefs/heads/main`;
      if (argv.includes('merge-base') && mismatch === 'ancestry') throw new Error('not an ancestor');
      if (cmd === 'cargo' && mismatch === 'signature') throw new Error('signature failed');
      if (cmd === 'gh' && argv[0] === 'release' && argv[1] === 'edit') published = true;
      return '';
    };
    await assert.rejects(publishLegacyStable({ run, read: fakeRead, write: async () => {}, hash: async () => mismatch === 'hash' ? 'c'.repeat(64) : sha256, makeTemp: async () => 'temp', removeTemp: async () => { removed = true; }, githubSha: sourceSha, dryRun: 'false' }));
    assert.equal(published, false);
    assert.equal(removed, true);
  }
});

test('publication stays dry until every check succeeds and an explicit non-dry run is selected', async () => {
  for (const mode of ['true', 'false', 'invalid']) {
    const calls = [];
    let published = false;
    const run = async (cmd, argv) => {
      calls.push([cmd, argv]);
      if (argv.some((arg) => arg.endsWith('/releases/latest'))) return published ? 'v0.13.5' : 'v0.13.0';
      if (argv.includes(`repos/Freshair129/G-Maiden/releases/tags/v0.13.5`)) return JSON.stringify({ ...release, prerelease: !published });
      if (argv.includes('rev-list')) return sourceSha;
      if (argv.includes('show')) return JSON.stringify({ plugins: { updater: { pubkey: 'test-key' } } });
      if (argv.includes('ls-remote') && argv.includes('--tags')) return `${sourceSha}\trefs/tags/v0.13.5`;
      if (argv.includes('ls-remote')) return `${sourceSha}\trefs/heads/main`;
      if (cmd === 'gh' && argv[0] === 'release' && argv[1] === 'edit') published = true;
      return '';
    };
    const result = publishLegacyStable({ run, read: fakeRead, write: async () => {}, hash: async () => sha256, makeTemp: async () => 'temp', removeTemp: async () => {}, fetchLatest: async () => latest, fetchArtifact: async () => {}, githubSha: sourceSha, dryRun: mode });
    if (mode === 'invalid') await assert.rejects(result, /DRY_RUN/);
    else await result;
    const publishes = calls.filter(([cmd, argv]) => cmd === 'gh' && argv[0] === 'release' && argv[1] === 'edit');
    assert.equal(publishes.length, mode === 'false' ? 1 : 0);
  }
});

test('a main update immediately before publication stops the release edit', async () => {
  let reads = 0;
  let published = false;
  const run = async (cmd, argv) => {
    if (argv.some((arg) => arg.endsWith('/releases/latest'))) return 'v0.13.0';
    if (argv.includes('repos/Freshair129/G-Maiden/releases/tags/v0.13.5')) return JSON.stringify(release);
    if (argv.includes('rev-list')) return sourceSha;
    if (argv.includes('show')) return JSON.stringify({ plugins: { updater: { pubkey: 'test-key' } } });
    if (argv.includes('ls-remote') && argv.includes('--tags')) return `${'d'.repeat(40)}\trefs/tags/v0.13.5\n${sourceSha}\trefs/tags/v0.13.5^{}`;
    if (argv.includes('ls-remote')) return `${++reads === 1 ? sourceSha : 'c'.repeat(40)}\trefs/heads/main`;
    if (cmd === 'gh' && argv[0] === 'release' && argv[1] === 'edit') published = true;
    return '';
  };
  await assert.rejects(publishLegacyStable({ run, read: fakeRead, write: async () => {}, hash: async () => sha256, makeTemp: async () => 'temp', removeTemp: async () => {}, githubSha: sourceSha, dryRun: 'false' }), /main changed/);
  assert.equal(published, false);
});

test('every platform signature is verified even when two platforms share an artifact URL', async () => {
  const inputStable = structuredClone(stable);
  inputStable.platforms['windows-x86_64'] = { url, sha256, signature: 'tampered' };
  const inputLatest = structuredClone(latest);
  inputLatest.platforms['windows-x86_64'] = { url, signature: 'tampered' };
  let currentSignature = '';
  let published = false;
  const run = async (cmd, argv) => {
    if (cmd === 'cargo' && currentSignature === 'tampered') throw new Error('bad signature');
    if (argv.some((arg) => arg.endsWith('/releases/latest'))) return 'v0.13.0';
    if (argv.includes('repos/Freshair129/G-Maiden/releases/tags/v0.13.5')) return JSON.stringify(release);
    if (argv.includes('rev-list')) return sourceSha;
    if (argv.includes('show')) return JSON.stringify({ plugins: { updater: { pubkey: 'test-key' } } });
    if (argv.includes('ls-remote') && argv.includes('--tags')) return `${sourceSha}\trefs/tags/v0.13.5`;
    if (argv.includes('ls-remote')) return `${sourceSha}\trefs/heads/main`;
    if (cmd === 'gh' && argv[0] === 'release' && argv[1] === 'edit') published = true;
    return '';
  };
  const read = async (path) => JSON.stringify(path.endsWith('latest.json') ? inputLatest : path.endsWith('tauri.conf.json') ? { plugins: { updater: { pubkey: 'test-key' } } } : inputStable);
  const write = async (path, value) => { if (path.endsWith('.updater-signature')) currentSignature = value; };
  await assert.rejects(publishLegacyStable({ run, read, write, hash: async () => sha256, makeTemp: async () => 'temp', removeTemp: async () => {}, githubSha: sourceSha, dryRun: 'false' }), /bad signature/);
  assert.equal(published, false);
});

test('post-publication read-back fails if the public legacy endpoint diverges', async () => {
  let published = false;
  const run = async (cmd, argv) => {
    if (argv.some((arg) => arg.endsWith('/releases/latest'))) return published ? 'v0.13.5' : 'v0.13.0';
    if (argv.includes('repos/Freshair129/G-Maiden/releases/tags/v0.13.5')) return JSON.stringify({ ...release, prerelease: !published });
    if (argv.includes('rev-list')) return sourceSha;
    if (argv.includes('show')) return JSON.stringify({ plugins: { updater: { pubkey: 'test-key' } } });
    if (argv.includes('ls-remote') && argv.includes('--tags')) return `${sourceSha}\trefs/tags/v0.13.5`;
    if (argv.includes('ls-remote')) return `${sourceSha}\trefs/heads/main`;
    if (cmd === 'gh' && argv[0] === 'release' && argv[1] === 'edit') published = true;
    return '';
  };
  await assert.rejects(publishLegacyStable({ run, read: fakeRead, write: async () => {}, hash: async () => sha256, makeTemp: async () => 'temp', removeTemp: async () => {}, githubSha: sourceSha, dryRun: 'false', fetchLatest: async () => ({ ...latest, version: '0.13.0' }), fetchArtifact: async () => {} }), /version mismatch/);
  assert.equal(published, true, 'a post-publication failure may already be visible and requires operator response');
});

test('post-publication read-back fails when public artifact download fails despite a valid API asset', async () => {
  let published = false;
  const run = async (cmd, argv) => {
    if (argv.some((arg) => arg.endsWith('/releases/latest'))) return published ? 'v0.13.5' : 'v0.13.0';
    if (argv.includes('repos/Freshair129/G-Maiden/releases/tags/v0.13.5')) return JSON.stringify({ ...release, prerelease: !published });
    if (argv.includes('rev-list')) return sourceSha;
    if (argv.includes('show')) return JSON.stringify({ plugins: { updater: { pubkey: 'test-key' } } });
    if (argv.includes('ls-remote') && argv.includes('--tags')) return `${sourceSha}\trefs/tags/v0.13.5`;
    if (argv.includes('ls-remote')) return `${sourceSha}\trefs/heads/main`;
    if (cmd === 'gh' && argv[0] === 'release' && argv[1] === 'edit') published = true;
    return '';
  };
  await assert.rejects(publishLegacyStable({ run, read: fakeRead, write: async () => {}, hash: async () => sha256, makeTemp: async () => 'temp', removeTemp: async () => {}, githubSha: sourceSha, dryRun: 'false', fetchLatest: async () => latest, fetchArtifact: async () => { throw new Error('public download failed'); } }), /public download failed/);
  assert.equal(published, true);
});
