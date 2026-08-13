import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, validatePublishedManifest, promoteManifest } from './channel-manifest.mjs';

const artifact = { url: 'https://github.com/Freshair129/G-Maiden/releases/download/v1.2.3/G-Maiden.msi', signature: 'untrusted comment: signature\nABC', sha256: 'a'.repeat(64) };
const candidate = { schemaVersion: 1, channel: 'dev', version: '1.2.3', sourceSha: 'b'.repeat(40), publishedAt: '2026-08-01T00:00:00.000Z', platforms: { 'windows-x86_64': artifact } };
const stable = { ...candidate, channel: 'stable', version: '1.2.2', sourceSha: 'c'.repeat(40) };

describe('release channel manifests', () => {
  // Regression guard. The updater uses ONE string both to fill `{{target}}` in the
  // endpoint template and as the `platforms` key, so keying a manifest by channel name
  // reads as a working way to select a channel — and then fails with TargetNotFound, or
  // reports "up to date" forever when the placeholder version is below the running app.
  // The channel belongs in the URL, which the Rust `check_channel_update` command owns.
  it('rejects channel-name platform keys', () => {
    for (const channel of ['dev', 'closed-beta', 'stable']) {
      assert.throws(
        () => validateManifest({ ...candidate, platforms: { [channel]: artifact } }),
        /not an updater platform id/,
        `expected ${channel} to be rejected as a platform key`,
      );
    }
  });
  it('accepts real updater platform ids, including installer-suffixed ones', () => {
    for (const key of ['windows-x86_64', 'windows-x86_64-msi', 'windows-x86_64-nsis', 'darwin-aarch64', 'linux-x86_64-appimage']) {
      assert.doesNotThrow(() => validateManifest({ ...candidate, platforms: { [key]: artifact } }), `expected ${key} to be accepted`);
    }
  });
  it('rejects unpublishable seeded metadata', () => {
    assert.throws(() => validatePublishedManifest({ ...candidate, platforms: { 'windows-x86_64': { ...artifact, signature: 'not-published' } } }), /signature/);
  });
  it('promotes the same artifact identity', () => {
    const promoted = promoteManifest(candidate, stable, { version: candidate.version, sourceSha: candidate.sourceSha, unresolvedS0S1: 0, approver: 'Boss', approvedAt: '2026-08-01T00:00:00.000Z' }, '2026-08-01T01:00:00.000Z');
    assert.equal(promoted.channel, 'stable');
    assert.deepEqual(promoted.platforms, candidate.platforms);
    assert.equal(promoted.sourceSha, candidate.sourceSha);
  });
  it('rejects an unresolved release blocker before Stable mutation', () => {
    assert.throws(() => promoteManifest(candidate, stable, { version: candidate.version, sourceSha: candidate.sourceSha, unresolvedS0S1: 1, approver: 'Boss', approvedAt: '2026-08-01T00:00:00.000Z' }), /unresolved S0\/S1/);
  });
  it('keeps normal validation available for seeded Stable recovery', () => {
    assert.doesNotThrow(() => validateManifest({ ...stable, version: '0.0.0', sourceSha: '0'.repeat(40), platforms: { 'windows-x86_64': { ...artifact, url: 'https://example.invalid/not-published', signature: 'not-published', sha256: '0'.repeat(64) } } }));
  });
});
