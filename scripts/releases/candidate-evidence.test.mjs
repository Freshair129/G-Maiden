import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/candidate-evidence-valid.json', import.meta.url), 'utf8'));

async function validate(input) {
  const { validateCandidateEvidence } = await import('./candidate-evidence.mjs');
  return validateCandidateEvidence(input);
}

function cloneFixture() {
  return structuredClone(fixture);
}

describe('candidate build evidence', () => {
  it('ties the evidence artifact to a successful candidate run and normalizes its tag', async () => {
    const result = await validate(fixture);

    assert.equal(result.runId, 334455);
    assert.equal(result.runAttempt, 2);
    assert.equal(result.evidenceArtifactId, 7788);
    assert.equal(result.version, '0.13.5');
    assert.equal(result.sourceSha, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.deepEqual(result.platforms, {
      'windows-x86_64': {
        filename: 'G-Maiden_0.13.5_x64_en-US.msi',
        sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      },
      'windows-x86_64-msi': {
        filename: 'G-Maiden_0.13.5_x64_en-US.msi',
        sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      },
      'windows-x86_64-nsis': {
        filename: 'G-Maiden_0.13.5_x64-setup.exe',
        sha256: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
      }
    });
    assert.equal(Object.hasOwn(result, 'approval'), false);
    assert.equal(Object.hasOwn(result, 'promotion'), false);
  });

  it('rejects evidence artifacts owned by a different workflow run', async () => {
    const input = cloneFixture();
    input.evidenceArtifact.workflow_run.id++;

    await assert.rejects(validate(input), /evidence artifact does not belong to candidate run/);
  });

  it('requires a completed successful workflow-dispatch run from the candidate-release workflow', async () => {
    for (const [mutate, message] of [
      [input => { input.run.status = 'in_progress'; }, /candidate run is not completed/],
      [input => { input.run.conclusion = 'failure'; }, /candidate run did not succeed/],
      [input => { input.run.event = 'push'; }, /candidate run must use workflow_dispatch/],
      [input => { input.workflow.path = '.github/workflows/promote-release.yml'; }, /candidate-release workflow/],
      [input => { input.workflow.path = 77; }, /candidate-release workflow/]
    ]) {
      const input = cloneFixture();
      mutate(input);
      await assert.rejects(validate(input), message);
    }
  });

  it('requires the candidate evidence artifact name and workflow identity to match the run', async () => {
    for (const mutate of [
      input => { input.evidenceArtifact.name = 'candidate-evidence-v0.13.4'; },
      input => { input.run.workflow_id++; },
      input => { input.workflow.id++; }
    ]) {
      const input = cloneFixture();
      mutate(input);
      await assert.rejects(validate(input), /candidate run identity mismatch/);
    }
  });

  it('requires the full candidate source SHA to match the Dev manifest', async () => {
    const invalidSha = cloneFixture();
    invalidSha.buildEvidence.sourceSha = 'abc123';
    await assert.rejects(validate(invalidSha), /sourceSha must be a full git SHA/);

    const mismatch = cloneFixture();
    mismatch.manifest.sourceSha = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    await assert.rejects(validate(mismatch), /source SHA does not match Dev manifest/);
  });

  it('rejects a build tag that does not normalize to the manifest version', async () => {
    for (const version of ['v0.13.4', '0.13.5', 'v0.13']) {
      const input = cloneFixture();
      input.buildEvidence.version = version;
      await assert.rejects(validate(input), /candidate tag does not match manifest version/);
    }
  });

  it('requires every updater artifact filename and SHA-256 to match build evidence', async () => {
    const hashMismatch = cloneFixture();
    hashMismatch.manifest.platforms['windows-x86_64-nsis'].sha256 = 'f'.repeat(64);
    await assert.rejects(validate(hashMismatch), /artifact SHA-256 does not match build evidence/);

    const missingArtifact = cloneFixture();
    missingArtifact.manifest.platforms['windows-x86_64-nsis'].url =
      'https://github.com/Freshair129/G-Maiden/releases/download/v0.13.5/missing-setup.exe';
    await assert.rejects(validate(missingArtifact), /artifact is missing from build evidence/);
  });

  it('rejects an invalid build evidence generation timestamp', async () => {
    const input = cloneFixture();
    input.buildEvidence.generatedAt = 'not-a-timestamp';

    await assert.rejects(validate(input), /generatedAt must be a valid timestamp/);
  });

  it('rejects a malformed publishedAt in the candidate manifest', async () => {
    const input = cloneFixture();
    input.manifest.publishedAt = 'not-a-timestamp';

    await assert.rejects(validate(input), /published manifest requires a real publishedAt/);
  });

  it('rejects ambiguous artifact identities and paths outside the candidate bundle', async () => {
    const duplicate = cloneFixture();
    duplicate.buildEvidence.artifacts.push({
      path: 'src-tauri/target/release/bundle/other/G-Maiden_0.13.5_x64_en-US.msi',
      sha256: 'f'.repeat(64)
    });
    await assert.rejects(validate(duplicate), /duplicate candidate artifact filename/);

    const traversal = cloneFixture();
    traversal.buildEvidence.artifacts[0].path = '../outside/G-Maiden_0.13.5_x64_en-US.msi';
    await assert.rejects(validate(traversal), /artifact path is outside the release bundle/);
  });

  it('keeps human approval metadata separate from build evidence', async () => {
    const input = cloneFixture();
    input.buildEvidence.approval = { approver: 'Owner', approvedAt: '2026-11-02T01:00:00.000Z' };

    await assert.rejects(validate(input), /human approval metadata must be supplied separately/);

    const mixed = cloneFixture();
    mixed.approval = { approver: 'Owner', approvedAt: '2026-11-02T01:00:00.000Z' };
    await assert.rejects(validate(mixed), /human approval metadata must be supplied separately/);
  });
});
