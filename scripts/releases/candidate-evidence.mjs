import { validatePublishedManifest } from './channel-manifest.mjs';

const CANDIDATE_WORKFLOW_PATH = '.github/workflows/candidate-release.yml';
const SOURCE_SHA = /^[0-9a-f]{40}$/i;
const ARTIFACT_SHA256 = /^[0-9a-f]{64}$/i;
const RELEASE_TAG = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?)$/;
const BUNDLE_PREFIX = 'src-tauri/target/release/bundle/';
const APPROVAL_FIELDS = ['approval', 'approver', 'approvedAt', 'approvedBy', 'promotion'];

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
}

function requireSha(value, name) {
  if (typeof value !== 'string' || !SOURCE_SHA.test(value) || /^0+$/.test(value)) {
    throw new Error(`${name} must be a full git SHA`);
  }
  return value.toLowerCase();
}

function rejectApprovalFields(value) {
  if (APPROVAL_FIELDS.some((field) => Object.hasOwn(value, field))) {
    throw new Error('human approval metadata must be supplied separately');
  }
}

function normalizeTag(tag, manifestVersion) {
  if (typeof tag !== 'string') throw new Error('candidate tag does not match manifest version');
  const match = RELEASE_TAG.exec(tag);
  if (!match || match[1] !== manifestVersion) {
    throw new Error('candidate tag does not match manifest version');
  }
  return match[1];
}

function normalizeBuildArtifact(artifact) {
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
  if (!/\.(?:msi|exe|zip|sig)$/i.test(path)) {
    throw new Error('build evidence contains an unsupported artifact type');
  }
  if (typeof artifact.sha256 !== 'string' || !ARTIFACT_SHA256.test(artifact.sha256)) {
    throw new Error(`invalid build evidence sha256 for ${path}`);
  }
  return {
    filename: segments.at(-1),
    filenameKey: segments.at(-1).toLowerCase(),
    sha256: artifact.sha256.toLowerCase()
  };
}

function filenameFromUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('candidate artifact URL is invalid');
  }
  let filename;
  try {
    filename = decodeURIComponent(parsed.pathname.split('/').at(-1) ?? '');
  } catch {
    throw new Error('candidate artifact URL filename is invalid');
  }
  if (!filename || filename.includes('/') || filename.includes('\\')) {
    throw new Error('candidate artifact URL filename is invalid');
  }
  return filename;
}

function indexBuildArtifacts(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    throw new Error('build evidence artifacts must be a non-empty array');
  }
  const byFilename = new Map();
  for (const artifact of artifacts) {
    const normalized = normalizeBuildArtifact(artifact);
    if (byFilename.has(normalized.filenameKey)) {
      throw new Error(`duplicate candidate artifact filename: ${normalized.filename}`);
    }
    byFilename.set(normalized.filenameKey, normalized);
  }
  return byFilename;
}

/**
 * Validates the candidate run, its uploaded build-evidence record, and the Dev
 * manifest together. This function is local and deterministic; human approval
 * is intentionally validated by the separate promotion path.
 */
export function validateCandidateEvidence(input) {
  requireObject(input, 'candidate evidence input');
  rejectApprovalFields(input);
  const { run, workflow, evidenceArtifact, buildEvidence, manifest } = input;
  requireObject(run, 'candidate run');
  requireObject(workflow, 'candidate workflow');
  requireObject(evidenceArtifact, 'evidence artifact');
  requireObject(buildEvidence, 'build evidence');
  requireObject(manifest, 'Dev manifest');
  rejectApprovalFields(buildEvidence);
  rejectApprovalFields(manifest);

  requirePositiveInteger(run.id, 'candidate run id');
  requirePositiveInteger(run.run_attempt, 'candidate run attempt');
  requirePositiveInteger(run.workflow_id, 'candidate run workflow id');
  requirePositiveInteger(workflow.id, 'candidate workflow id');
  requirePositiveInteger(evidenceArtifact.id, 'evidence artifact id');
  if (workflow.id !== run.workflow_id) {
    throw new Error('candidate run identity mismatch: workflow id');
  }
  if (typeof workflow.path !== 'string' || workflow.path.replaceAll('\\', '/') !== CANDIDATE_WORKFLOW_PATH) {
    throw new Error('candidate run must use the candidate-release workflow');
  }
  if (run.event !== 'workflow_dispatch') {
    throw new Error('candidate run must use workflow_dispatch');
  }
  if (run.status !== 'completed') throw new Error('candidate run is not completed');
  if (run.conclusion !== 'success') throw new Error('candidate run did not succeed');
  const workflowHeadSha = requireSha(run.head_sha, 'candidate run head_sha');

  if (evidenceArtifact.expired !== false) {
    throw new Error('candidate evidence artifact is expired or has unknown expiry');
  }
  if (evidenceArtifact.workflow_run?.id !== run.id) {
    throw new Error('evidence artifact does not belong to candidate run');
  }

  validatePublishedManifest(manifest);
  if (manifest.channel !== 'dev') throw new Error('candidate manifest must target the dev channel');
  const version = normalizeTag(buildEvidence.version, manifest.version);
  if (evidenceArtifact.name !== `candidate-evidence-${buildEvidence.version}`) {
    throw new Error('candidate run identity mismatch: evidence artifact name');
  }
  const generatedAt = typeof buildEvidence.generatedAt === 'string' ? Date.parse(buildEvidence.generatedAt) : NaN;
  if (!Number.isFinite(generatedAt) || generatedAt <= 0) {
    throw new Error('build evidence generatedAt must be a valid timestamp');
  }

  const sourceSha = requireSha(buildEvidence.sourceSha, 'sourceSha');
  if (sourceSha !== manifest.sourceSha.toLowerCase()) {
    throw new Error('source SHA does not match Dev manifest');
  }
  // workflow_dispatch may run from a branch while the workflow checks out the input tag;
  // the run's head SHA identifies the dispatch ref, and sourceSha identifies the candidate.
  const buildArtifacts = indexBuildArtifacts(buildEvidence.artifacts);
  const platforms = {};
  for (const [platform, publishedArtifact] of Object.entries(manifest.platforms)) {
    const filename = filenameFromUrl(publishedArtifact.url);
    const evidence = buildArtifacts.get(filename.toLowerCase());
    if (!evidence || evidence.filename !== filename) {
      throw new Error(`platform ${platform} artifact is missing from build evidence`);
    }
    if (evidence.sha256 !== publishedArtifact.sha256.toLowerCase()) {
      throw new Error(`platform ${platform} artifact SHA-256 does not match build evidence`);
    }
    platforms[platform] = { filename, sha256: evidence.sha256 };
  }

  return {
    runId: run.id,
    runAttempt: run.run_attempt,
    workflowId: workflow.id,
    workflowHeadSha,
    evidenceArtifactId: evidenceArtifact.id,
    version,
    sourceSha,
    platforms
  };
}
