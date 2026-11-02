import { validatePublishedManifest } from './channel-manifest.mjs';

/** Validate the already-approved stable artifact before making its GitHub release latest. */
export function validateLegacyPublication({ stable, latest, release, tagCommit, currentLatestTag, downloadedHashes }) {
  validatePublishedManifest(stable);
  if (stable.channel !== 'stable' || !/^\d+\.\d+\.\d+$/.test(stable.version)) throw new Error('published stable version required');
  const approval = stable.promotion;
  if (!approval?.approver || !approval.approvedAt || !approval.evidence || !Number.isFinite(Date.parse(approval.approvedAt))) throw new Error('stable approval evidence required');
  const tag = `v${stable.version}`;
  if (!/^v\d+\.\d+\.\d+$/.test(currentLatestTag ?? '')) throw new Error('current latest release is not a stable version');
  const current = currentLatestTag.slice(1).split('.').map(Number);
  const next = stable.version.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (next[i] < current[i]) throw new Error('refusing to move latest backward');
    if (next[i] > current[i]) break;
  }
  if (release?.tag_name !== tag || release.draft !== false || release.prerelease !== true) throw new Error('candidate release state or tag mismatch');
  if (tagCommit !== stable.sourceSha || latest?.version !== stable.version) throw new Error('candidate source or version mismatch');
  const keys = Object.keys(stable.platforms).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(latest?.platforms ?? {}).sort())) throw new Error('candidate platform set mismatch');
  const prefix = `https://github.com/Freshair129/G-Maiden/releases/download/${tag}/`;
  for (const key of keys) {
    const selected = stable.platforms[key];
    const old = latest.platforms[key];
    if (!selected.url.startsWith(prefix) || !/^[A-Za-z0-9._-]+$/.test(selected.url.slice(prefix.length))) throw new Error('candidate artifact URL is not in the approved release');
    if (old.url !== selected.url || old.signature !== selected.signature) throw new Error('candidate manifest identity mismatch');
    if (downloadedHashes?.[selected.url]?.toLowerCase() !== selected.sha256.toLowerCase()) throw new Error('candidate artifact hash mismatch');
  }
}
