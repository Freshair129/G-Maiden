import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyPromotionArtifacts } from './promotion-artifacts.mjs';

const BUNDLE = 'src-tauri/target/release/bundle/msi';
const BINARY_NAME = 'G-Maiden_1.2.3_x64_en-US.msi';
const SIGNATURE_NAME = `${BINARY_NAME}.sig`;
const BINARY_BYTES = Buffer.from('synthetic installer bytes');
const SIGNATURE_BYTES = Buffer.from('synthetic signature record');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function createInput() {
  const binarySha = sha256(BINARY_BYTES);
  const signatureSha = sha256(SIGNATURE_BYTES);
  const artifact = {
    url: `https://github.com/Freshair129/G-Maiden/releases/download/v1.2.3/${BINARY_NAME}`,
    signature: SIGNATURE_BYTES.toString('utf8'),
    sha256: binarySha
  };

  return {
    buildEvidence: {
      artifacts: [
        { path: `${BUNDLE}/${BINARY_NAME}`, sha256: binarySha },
        { path: `${BUNDLE}/${SIGNATURE_NAME}`, sha256: signatureSha }
      ]
    },
    manifest: {
      schemaVersion: 1,
      channel: 'dev',
      version: '1.2.3',
      sourceSha: 'a'.repeat(40),
      publishedAt: '2026-11-02T00:00:00.000Z',
      platforms: {
        'windows-x86_64': artifact,
        'windows-x86_64-msi': structuredClone(artifact)
      }
    },
    files: {
      [BINARY_NAME]: BINARY_BYTES,
      [SIGNATURE_NAME]: SIGNATURE_BYTES
    }
  };
}

async function inTempDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), 'gm-promotion-artifacts-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function writeFiles(directory, files) {
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(join(directory, name), bytes);
  }
}

describe('promotion artifact byte identity', () => {
  it('matches downloaded binaries and exact signature bytes to evidence and the Dev manifest', async () => {
    const input = createInput();

    await inTempDirectory(async (downloadDirectory) => {
      await writeFiles(downloadDirectory, input.files);
      const result = await verifyPromotionArtifacts({
        buildEvidence: input.buildEvidence,
        manifest: input.manifest,
        downloadDirectory
      });

      assert.deepEqual(result.artifacts, [{
        filename: BINARY_NAME,
        sha256: sha256(BINARY_BYTES),
        signatureFilename: SIGNATURE_NAME,
        platforms: ['windows-x86_64', 'windows-x86_64-msi']
      }]);
    });
  });

  it('rejects missing binary or signature downloads', async () => {
    const input = createInput();

    await inTempDirectory(async (downloadDirectory) => {
      await assert.rejects(
        verifyPromotionArtifacts({ ...input, downloadDirectory }),
        /missing downloaded artifact/
      );
    });

    await inTempDirectory(async (downloadDirectory) => {
      await writeFile(join(downloadDirectory, BINARY_NAME), BINARY_BYTES);
      await assert.rejects(
        verifyPromotionArtifacts({ ...input, downloadDirectory }),
        /missing downloaded artifact/
      );
    });
  });

  it('rejects duplicate evidence filenames and traversal paths', async () => {
    const duplicate = createInput();
    duplicate.buildEvidence.artifacts.push({
      path: `src-tauri/target/release/bundle/other/${BINARY_NAME}`,
      sha256: sha256(BINARY_BYTES)
    });
    await inTempDirectory(async (downloadDirectory) => {
      await writeFiles(downloadDirectory, duplicate.files);
      await assert.rejects(
        verifyPromotionArtifacts({ ...duplicate, downloadDirectory }),
        /duplicate candidate artifact filename/
      );
    });

    const traversal = createInput();
    traversal.buildEvidence.artifacts[0].path = `src-tauri/target/release/bundle/../../outside/${BINARY_NAME}`;
    await inTempDirectory(async (downloadDirectory) => {
      await writeFiles(downloadDirectory, traversal.files);
      await assert.rejects(
        verifyPromotionArtifacts({ ...traversal, downloadDirectory }),
        /artifact path is outside the release bundle/
      );
    });
  });

  for (const [label, encodedFilename] of [
    ['NUL', 'G-Maiden_1.2.3_%00_x64_en-US.msi'],
    ['U+0001', 'G-Maiden_1.2.3_%01_x64_en-US.msi'],
    ['U+001F', 'G-Maiden_1.2.3_%1F_x64_en-US.msi'],
    ['reserved device name CON.msi', 'CON.msi']
  ]) {
    it(`rejects ${label} in promotion manifest URL-derived filenames`, async () => {
      const input = createInput();
      input.manifest.platforms['windows-x86_64'].url =
        `https://github.com/Freshair129/G-Maiden/releases/download/v1.2.3/${encodedFilename}`;

      await inTempDirectory(async (downloadDirectory) => {
        await assert.rejects(
          verifyPromotionArtifacts({ ...input, downloadDirectory }),
          /candidate artifact URL filename is invalid for Windows/
        );
      });
    });
  }

  for (const [label, filename] of [
    ['NUL', 'G-Maiden_1.2.3_\u0000_x64_en-US.msi'],
    ['U+0001', 'G-Maiden_1.2.3_\u0001_x64_en-US.msi'],
    ['U+001F', 'G-Maiden_1.2.3_\u001f_x64_en-US.msi'],
    ['reserved device name CON.msi', 'CON.msi']
  ]) {
    it(`rejects ${label} in promotion build-evidence path basenames`, async () => {
      const input = createInput();
      input.buildEvidence.artifacts[0].path = `${BUNDLE}/${filename}`;

      await inTempDirectory(async (downloadDirectory) => {
        await assert.rejects(
          verifyPromotionArtifacts({ ...input, downloadDirectory }),
          /build evidence artifact filename is invalid for Windows/
        );
      });
    });
  }

  it('rejects unsupported and unreferenced downloaded files', async () => {
    const unsupportedEvidence = createInput();
    unsupportedEvidence.buildEvidence.artifacts[0].path = `${BUNDLE}/payload.dll`;
    await inTempDirectory(async (downloadDirectory) => {
      await writeFiles(downloadDirectory, unsupportedEvidence.files);
      await assert.rejects(
        verifyPromotionArtifacts({ ...unsupportedEvidence, downloadDirectory }),
        /unsupported artifact type/
      );
    });

    const extraDownload = createInput();
    await inTempDirectory(async (downloadDirectory) => {
      await writeFiles(downloadDirectory, extraDownload.files);
      await writeFile(join(downloadDirectory, 'unexpected.txt'), 'synthetic extra file');
      await assert.rejects(
        verifyPromotionArtifacts({ ...extraDownload, downloadDirectory }),
        /unsupported downloaded artifact/
      );
    });
  });

  it('rejects binary hash mismatches and signatures that differ by even one byte', async () => {
    const input = createInput();
    await inTempDirectory(async (downloadDirectory) => {
      await writeFiles(downloadDirectory, {
        ...input.files,
        [BINARY_NAME]: Buffer.from('different synthetic installer bytes')
      });
      await assert.rejects(
        verifyPromotionArtifacts({ ...input, downloadDirectory }),
        /downloaded artifact SHA-256 does not match build evidence/
      );
    });

    await inTempDirectory(async (downloadDirectory) => {
      await writeFiles(downloadDirectory, {
        ...input.files,
        [SIGNATURE_NAME]: Buffer.concat([SIGNATURE_BYTES, Buffer.from('\n')])
      });
      await assert.rejects(
        verifyPromotionArtifacts({ ...input, downloadDirectory }),
        /downloaded signature bytes do not match Dev manifest/
      );
    });
  });

  it('rejects a manifest SHA that differs from build evidence', async () => {
    const input = createInput();
    input.manifest.platforms['windows-x86_64'].sha256 = 'f'.repeat(64);

    await inTempDirectory(async (downloadDirectory) => {
      await writeFiles(downloadDirectory, input.files);
      await assert.rejects(
        verifyPromotionArtifacts({ ...input, downloadDirectory }),
        /artifact SHA-256 does not match build evidence/
      );
    });
  });
});
