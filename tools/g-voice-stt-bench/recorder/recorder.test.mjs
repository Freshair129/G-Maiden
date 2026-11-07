import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { runBenchmark } from '../run.mjs';
import { releaseCaptureResources } from './capture.mjs';
import { labelCapturedMicrophone } from './microphone.mjs';
import { coveredPromptCount } from './progress.mjs';
import { scanRecorderSources } from './source-scan.mjs';
import { createStartGate } from './start-gate.mjs';
import { createManifestEntry, upsertManifest } from './manifest.mjs';
import { INTENTS, SLOT_KEYS, validatePromptSet } from './prompts.mjs';
import { encodePcm16Wav, resampleMono } from './wav.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ENGINE = join(HERE, '..', 'fixtures', 'fake-engine.mjs');

function loadPromptFile(name) {
  return JSON.parse(readFileSync(join(HERE, name), 'utf8'));
}

test('encodes a mono 16 kHz PCM16 WAV header', () => {
  const wav = encodePcm16Wav(new Float32Array([0, 0.5, -0.5]), 16_000);
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  assert.equal(Buffer.from(wav.subarray(0, 4)).toString('ascii'), 'RIFF');
  assert.equal(Buffer.from(wav.subarray(8, 12)).toString('ascii'), 'WAVE');
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16_000);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 6);
});

test('resamples a mono buffer to the expected 16 kHz length', () => {
  const input = Float32Array.from({ length: 48_000 }, (_, index) => index / 48_000);
  const output = resampleMono(input, 48_000, 16_000);
  assert.equal(output.length, 16_000);
  assert.equal(output[0], input[0]);
  assert.ok(output.at(-1) <= 1);
});

test('releases microphone tracks and audio nodes after an interrupted capture', async () => {
  let stopped = 0; let disconnected = 0; let closed = 0;
  await releaseCaptureResources({
    stream: { getTracks: () => [{ stop: () => { stopped += 1; } }] },
    source: { disconnect: () => { disconnected += 1; } },
    processor: { disconnect: () => { disconnected += 1; } },
    silent: { disconnect: () => { disconnected += 1; } },
    context: { state: 'running', close: async () => { closed += 1; } },
  });
  assert.equal(stopped, 1);
  assert.equal(disconnected, 3);
  assert.equal(closed, 1);
});

test('PTT start gate rejects concurrent starts and release before permission resolves', () => {
  const gate = createStartGate();
  gate.setPttHeld(true);
  const token = gate.start({ ptt: true });
  assert.equal(typeof token, 'number');
  assert.equal(gate.start({ ptt: false }), null);
  gate.setPttHeld(false);
  assert.equal(gate.canActivate(token), false);
  gate.finish(token);
  assert.equal(gate.isStarting(), false);
});

test('uses the acquired microphone device label rather than a separately selected device', () => {
  const label = labelCapturedMicrophone(
    { label: 'Default microphone', getSettings: () => ({ deviceId: 'usb-device' }) },
    [
      { kind: 'audioinput', deviceId: 'default-device', label: 'Laptop microphone' },
      { kind: 'audioinput', deviceId: 'usb-device', label: 'USB headset microphone' },
    ],
  );
  assert.equal(label, 'USB headset microphone');
});

test('progress counts each expected prompt once despite duplicate sessions', () => {
  const prompts = [
    { id: 'en-enemy-01', language: 'en' },
    { id: 'en-enemy-02', language: 'en' },
  ];
  const entries = [
    { id: 'en-en-enemy-01-quiet-session-a', language: 'en', condition: 'quiet' },
    { id: 'en-en-enemy-01-quiet-session-b', language: 'en', condition: 'quiet' },
    { id: 'en-en-enemy-02-game-audio-session-a', language: 'en', condition: 'game-audio' },
  ];
  assert.equal(coveredPromptCount(prompts, entries, 'en', 'quiet'), 1);
  assert.equal(coveredPromptCount(prompts, entries, 'en', 'game-audio'), 1);
});

test('recorder manifest entries pass the harness validation unchanged', async () => {
  const root = mkdtempSync(join(tmpdir(), 'g-voice-recorder-'));
  try {
    const corpusDir = join(root, 'corpus');
    mkdirSync(corpusDir);
    const entry = createManifestEntry({
      prompt: {
        id: 'en-001', language: 'en', reference: 'hello maiden',
        intent: 'enemy_location', slots: { lane: 'mid' },
      },
      condition: 'quiet', speaker: 'boss-01', session: 'session-a', split: 'holdout',
      mic: 'Local microphone', gameAudioNote: 'not applicable', recordedAt: '2026-11-07T00:00:00.000Z',
    });
    assert.equal(entry.id, 'en-en-001-quiet-session-a');
    assert.equal(entry.wav, 'en-en-001-quiet-session-a.wav');
    const manifest = upsertManifest({ schema_version: 1, utterances: [] }, entry);
    writeFileSync(join(corpusDir, entry.wav), encodePcm16Wav(new Float32Array([0, 0.25, -0.25]), 16_000));
    writeFileSync(join(corpusDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');
    writeFileSync(join(root, 'model.bin'), 'local-only synthetic model', 'utf8');
    writeFileSync(join(root, 'candidate.json'), JSON.stringify({
      schema_version: 1,
      adapter: 'generic-cli',
      engine_path: process.execPath,
      engine_args: [FIXTURE_ENGINE, '{wav}'],
      model_path: 'model.bin',
      timeout_ms: 5_000,
      response_format: 'json',
    }), 'utf8');

    const receipt = await runBenchmark({
      corpusPath: join(corpusDir, 'manifest.json'),
      configPath: join(root, 'candidate.json'),
      outputDir: join(root, 'results'),
      repoRoot: join(HERE, '..', '..', '..'),
    });
    assert.equal(receipt.utterances.length, 1);
    assert.equal(receipt.utterances[0].id, entry.id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('prompt files meet frozen CR-045 inventory and count requirements', () => {
  const expectedCounts = new Map([
    ['prompts.th.json', 100],
    ['prompts.en.json', 100],
    ['prompts.code-switch.json', 40],
  ]);
  for (const [name, minimum] of expectedCounts) {
    const promptSet = loadPromptFile(name);
    const prompts = validatePromptSet(promptSet);
    assert.ok(prompts.length >= minimum, `${name} must contain at least ${minimum} prompts`);
    assert.deepEqual(new Set(prompts.map((prompt) => prompt.intent)), new Set(INTENTS));
    assert.equal(new Set(prompts.map((prompt) => prompt.id)).size, prompts.length);
    for (const prompt of prompts) {
      for (const key of Object.keys(prompt.slots)) assert.ok(SLOT_KEYS.has(key), `${name} uses unsupported slot ${key}`);
    }
  }
});

test('prompt validation rejects values outside the frozen slot inventory', () => {
  assert.throws(() => validatePromptSet({
    language: 'en',
    prompts: [{ id: 'bad-objective', reference: 'when is dragon up', intent: 'objective_timing', slots: { objective: 'dragon' } }],
  }), /canonical/);
});

test('recorder production files have no network APIs or external URLs', () => {
  const scan = scanRecorderSources(HERE);
  assert.deepEqual(scan.violations, []);
  assert.ok(scan.files.includes('index.html'));
  assert.ok(scan.files.includes('app.mjs'));
});
