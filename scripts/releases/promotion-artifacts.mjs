import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { validatePublishedManifest } from './channel-manifest.mjs';

const BUNDLE_PREFIX = 'src-tauri/target/release/bundle/';
const EVIDENCE_ARTIFACT_EXTENSION = /\.(?:msi|exe|zip|sig)$/i;
const MANIFEST_ARTIFACT_EXTENSION = /\.(?:msi|exe|zip)$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function normalizeEvidenceArtifact(artifact) {
  requireObject(artifact, 'build evidence artifact');
  if (typeof artifact.path !== 'string' || !artifact.path) {
    throw new Error('build evidence artifact path is required');
  }

  const path = artifact.path.replaceAll('\\', '/');
  const segments = path.split('/');
  if (
    path.startsWith('/') ||
    /^[A-Za-z]:/.test(path) ||
    segments.some((segment) => segment === '..' || segment === '.' || segment === '') ||
    !path.startsWith(BUNDLE_PREFIX)
  ) {
    throw new Error('artifact path is outside the release bundle');
  }
  if (!EVIDENCE_ARTIFACT_EXTENSION.test(path)) {
    throw new Error(`build evidence contains an unsupported artifact type: ${path}`);
  }
  if (typeof artifact.sha256 !== 'string' || !SHA256.test(artifact.sha256)) {
    throw new Error(`invalid build evidence sha256 for ${path}`);
  }

  const filename = segments.at(-1);
  return {
    filename,
    filenameKey: filename.toLowerCase(),
    sha256: artifact.sha256.toLowerCase()
  };
}

function indexBuildArtifacts(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new Error('build evidence artifacts must be a non-empty array');
  }

  const byFilename = new Map();
  for (const artifact of artifacts) {
    const normalized = normalizeEvidenceArtifact(artifact);
    if (byFilename.has(normalized.filenameKey)) {
      throw new Error(`duplicate candidate artifact filename: ${normalized.filename}`);
    }
    byFilename.set(normalized.filenameKey, normalized);
  }
  return byFilename;
}

function filenameFromUrl(url) {
  if (typeof url !== 'string') throw new Error('candidate artifact URL is invalid');

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('candidate artifact URL is invalid');
  }

  const rawPath = /^https:\/\/[^/?#]+([^?#]*)/i.exec(url)?.[1] ?? '';
  for (const segment of rawPath.split('/')) {
    if (!segment) continue;
    let decodedSegment;
    try {
      decodedSegment = decodeURIComponent(segment);
    } catch {
      throw new Error('candidate artifact URL filename is invalid');
    }
    if (decodedSegment === '.' || decodedSegment === '..' || /[\\/]/.test(decodedSegment)) {
      throw new Error('candidate artifact URL filename is invalid');
    }
  }

  let filename;
  try {
    filename = decodeURIComponent(parsed.pathname.split('/').at(-1) ?? '');
  } catch {
    throw new Error('candidate artifact URL filename is invalid');
  }
  if (
    !filename ||
    filename === '.' ||
    filename === '..' ||
    /[\\/<>:"|?*\u0000]/.test(filename) ||
    /[. ]$/.test(filename)
  ) {
    throw new Error('candidate artifact URL filename is invalid');
  }
  if (!MANIFEST_ARTIFACT_EXTENSION.test(filename)) {
    throw new Error(`candidate manifest contains an unsupported artifact type: ${filename}`);
  }
  return filename;
}

function indexManifestArtifacts(manifest, buildArtifacts) {
  const expected = new Map();

  for (const [platform, publishedArtifact] of Object.entries(manifest.platforms)) {
    const filename = filenameFromUrl(publishedArtifact.url);
    const evidence = buildArtifacts.get(filename.toLowerCase());
    if (!evidence || evidence.filename !== filename) {
      throw new Error(`platform ${platform} artifact is missing from build evidence`);
    }

    const manifestSha = publishedArtifact.sha256.toLowerCase();
    if (evidence.sha256 !== manifestSha) {
      throw new Error(`platform ${platform} artifact SHA-256 does not match build evidence`);
    }
    if (typeof publishedArtifact.signature !== 'string' || !publishedArtifact.signature) {
      throw new Error(`platform ${platform} signature must be a non-empty string`);
    }

    const signatureFilename = `${filename}.sig`;
    const signatureEvidence = buildArtifacts.get(signatureFilename.toLowerCase());
    if (!signatureEvidence || signatureEvidence.filename !== signatureFilename) {
      throw new Error(`platform ${platform} signature is missing from build evidence`);
    }

    const key = filename.toLowerCase();
    const previous = expected.get(key);
    if (previous) {
      if (
        previous.sha256 !== evidence.sha256 ||
        previous.manifestSha !== manifestSha ||
        previous.signature !== publishedArtifact.signature ||
        previous.signatureSha256 !== signatureEvidence.sha256
      ) {
        throw new Error(`conflicting Dev manifest entries for artifact ${filename}`);
      }
      previous.platforms.push(platform);
      continue;
    }

    expected.set(key, {
      filename,
      sha256: evidence.sha256,
      manifestSha,
      signature: publishedArtifact.signature,
      signatureFilename,
      signatureSha256: signatureEvidence.sha256,
      platforms: [platform]
    });
  }

  return expected;
}

async function indexDownloadedFiles(downloadDirectory, expectedArtifacts) {
  const directory = resolve(downloadDirectory);
  let directoryStats;
  try {
    directoryStats = await lstat(directory);
  } catch {
    throw new Error('download directory is missing or unreadable');
  }
  if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) {
    throw new Error('download directory must be a real directory');
  }

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new Error('download directory is missing or unreadable');
  }

  const expectedNames = new Set();
  for (const artifact of expectedArtifacts.values()) {
    expectedNames.add(artifact.filename.toLowerCase());
    expectedNames.add(artifact.signatureFilename.toLowerCase());
  }

  const downloaded = new Map();
  for (const entry of entries) {
    const filenameKey = entry.name.toLowerCase();
    if (downloaded.has(filenameKey)) {
      throw new Error(`duplicate downloaded artifact filename: ${entry.name}`);
    }
    if (!entry.isFile()) {
      throw new Error(`unsupported downloaded artifact entry: ${entry.name}`);
    }
    if (!expectedNames.has(filenameKey)) {
      throw new Error(`unsupported downloaded artifact: ${entry.name}`);
    }
    downloaded.set(filenameKey, entry.name);
  }

  for (const artifact of expectedArtifacts.values()) {
    for (const filename of [artifact.filename, artifact.signatureFilename]) {
      const downloadedFilename = downloaded.get(filename.toLowerCase());
      if (!downloadedFilename) {
        throw new Error(`missing downloaded artifact: ${filename}`);
      }
      if (downloadedFilename !== filename) {
        throw new Error(`downloaded artifact filename does not match evidence: ${filename}`);
      }
    }
  }

  return { directory, downloaded };
}

async function readRegularFile(directory, filename) {
  const path = join(directory, filename);
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`downloaded artifact is not a regular file: ${filename}`);
  }
  return readFile(path);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Checks downloaded artifact byte identity against build evidence and the Dev
 * manifest. This does not verify Minisign signatures or establish promotion
 * acceptance.
 */
export async function verifyPromotionArtifacts({ buildEvidence, manifest, downloadDirectory }) {
  requireObject(buildEvidence, 'build evidence');
  requireObject(manifest, 'Dev manifest');
  if (typeof downloadDirectory !== 'string' || !downloadDirectory) {
    throw new Error('download directory is required');
  }

  validatePublishedManifest(manifest);
  if (manifest.channel !== 'dev') throw new Error('candidate manifest must target the dev channel');

  const buildArtifacts = indexBuildArtifacts(buildEvidence.artifacts);
  const expectedArtifacts = indexManifestArtifacts(manifest, buildArtifacts);
  const { directory } = await indexDownloadedFiles(downloadDirectory, expectedArtifacts);
  const verified = [];

  for (const artifact of expectedArtifacts.values()) {
    const binaryBytes = await readRegularFile(directory, artifact.filename);
    const actualSha = sha256(binaryBytes);
    if (actualSha !== artifact.sha256) {
      throw new Error(`downloaded artifact SHA-256 does not match build evidence: ${artifact.filename}`);
    }
    if (actualSha !== artifact.manifestSha) {
      throw new Error(`downloaded artifact SHA-256 does not match Dev manifest: ${artifact.filename}`);
    }

    const signatureBytes = await readRegularFile(directory, artifact.signatureFilename);
    const expectedSignatureBytes = Buffer.from(artifact.signature, 'utf8');
    if (!signatureBytes.equals(expectedSignatureBytes)) {
      throw new Error(`downloaded signature bytes do not match Dev manifest: ${artifact.signatureFilename}`);
    }
    if (sha256(signatureBytes) !== artifact.signatureSha256) {
      throw new Error(`downloaded signature SHA-256 does not match build evidence: ${artifact.signatureFilename}`);
    }

    verified.push({
      filename: artifact.filename,
      sha256: actualSha,
      signatureFilename: artifact.signatureFilename,
      platforms: [...artifact.platforms]
    });
  }

  return { artifacts: verified };
}
