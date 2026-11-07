import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  loadNormalizationConfig,
  metricForLanguage,
  normalizeText,
  scoreCer,
  scoreWer,
  segmentGraphemes,
} from './score.mjs';
import { buildWhisperCppArgs } from './adapters/whisper-cpp.mjs';
import { runBenchmark, sha256Path } from './run.mjs';
import { scanHarnessSources } from './source-scan.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ENGINE = join(HERE, 'fixtures', 'fake-engine.mjs');
const FIXTURE_FASTER_WHISPER_WORKER = join(HERE, 'fixtures', 'fake-faster-whisper-worker.mjs');

function writePcm16Mono16kWav(path) {
  const sampleRate = 16_000;
  const samples = 16;
  const dataBytes = samples * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataBytes, 40);
  writeFileSync(path, wav);
}

function createBenchmarkFixture({ includeTimeout = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'g-voice-stt-bench-'));
  const corpusDir = join(root, 'corpus');
  const outputDir = join(root, 'receipt-output');
  const modelPath = join(root, 'placeholder-model.bin');
  const configPath = join(root, 'candidate.json');
  const manifestPath = join(corpusDir, 'manifest.json');
  const utterances = [
    {
      id: 'ok-en', language: 'en', condition: 'quiet', speaker: 's1', session: 'a', split: 'holdout',
      reference: 'hello maiden', intent: 'ask_status', slots: { lane: 'mid' }, wav: 'ok-en.wav',
    },
    ...(includeTimeout ? [{
      id: 'timeout-en', language: 'en', condition: 'game-audio', speaker: 's2', session: 'b', split: 'holdout',
      reference: 'hello maiden', intent: 'ask_status', slots: { lane: 'mid' }, wav: 'timeout-en.wav',
    }] : []),
    {
      id: 'error-th', language: 'th', condition: 'quiet', speaker: 's3', session: 'c', split: 'holdout',
      reference: 'ไทย', intent: 'ask_status', slots: { lane: 'mid' }, wav: 'error-th.wav',
    },
    {
      id: 'no-speech-en', language: 'en', condition: 'quiet', speaker: 's4', session: 'd', split: 'holdout',
      reference: 'hello maiden', intent: 'ask_status', slots: { lane: 'mid' }, wav: 'no-speech-en.wav',
    },
  ];
  mkdirSync(corpusDir, { recursive: true });
  for (const utterance of utterances) writePcm16Mono16kWav(join(corpusDir, utterance.wav));
  writeFileSync(modelPath, 'local placeholder model - never downloaded\n', 'utf8');
  writeFileSync(manifestPath, JSON.stringify({ schema_version: 1, utterances }, null, 2), 'utf8');
  writeFileSync(configPath, JSON.stringify({
    schema_version: 1,
    name: 'fake-local-engine',
    adapter: 'generic-cli',
    engine_path: process.execPath,
    engine_args: [FIXTURE_ENGINE, '{wav}'],
    model_path: modelPath,
    timeout_ms: 5_000,
    response_format: 'json',
  }, null, 2), 'utf8');
  return { root, configPath, manifestPath, outputDir };
}

function createFasterWhisperFixture() {
  const root = mkdtempSync(join(tmpdir(), 'g-voice-faster-whisper-'));
  const corpusDir = join(root, 'corpus');
  const outputDir = join(root, 'receipt-output');
  const modelPath = join(root, 'local-model');
  const configPath = join(root, 'candidate.json');
  const manifestPath = join(corpusDir, 'manifest.json');
  const utterances = [
    { id: 'environment', language: 'en', condition: 'quiet', speaker: 's1', session: 'a', split: 'holdout', reference: 'offline enabled', wav: 'environment.wav' },
    { id: 'ok', language: 'en', condition: 'quiet', speaker: 's2', session: 'b', split: 'holdout', reference: 'hello maiden', wav: 'ok.wav' },
    { id: 'error', language: 'th', condition: 'quiet', speaker: 's3', session: 'c', split: 'holdout', reference: 'ไทย', wav: 'error.wav' },
    { id: 'timeout', language: 'code-switch', condition: 'game-audio', speaker: 's4', session: 'd', split: 'holdout', reference: 'hello maiden', wav: 'timeout.wav' },
    { id: 'after-timeout', language: 'en', condition: 'game-audio', speaker: 's5', session: 'e', split: 'holdout', reference: 'hello maiden', wav: 'after-timeout.wav' },
  ];
  mkdirSync(corpusDir, { recursive: true });
  mkdirSync(join(modelPath, 'nested'), { recursive: true });
  writeFileSync(join(modelPath, 'config.json'), '{"local":true}\n', 'utf8');
  writeFileSync(join(modelPath, 'nested', 'weights.bin'), 'synthetic model bytes\n', 'utf8');
  for (const utterance of utterances) writePcm16Mono16kWav(join(corpusDir, utterance.wav));
  writeFileSync(manifestPath, JSON.stringify({ schema_version: 1, utterances }, null, 2), 'utf8');
  writeFileSync(configPath, JSON.stringify({
    schema_version: 1,
    name: 'fake-faster-whisper',
    adapter: 'faster-whisper',
    engine_path: process.execPath,
    model_path: modelPath,
    timeout_ms: 1_000,
    device: 'cpu',
    compute_type: 'int8',
    language: null,
    beam_size: 1,
  }, null, 2), 'utf8');
  return { root, configPath, manifestPath, outputDir, modelPath };
}

test('scores English WER with a known word-level Levenshtein answer', () => {
  const result = scoreWer('the quick brown fox', 'the fast brown');
  assert.deepEqual(result, { errors: 2, reference_units: 4, rate: 0.5 });
});

test('scores Thai CER by grapheme and keeps a Thai combining mark together', () => {
  const result = scoreCer('ไทย', 'ไท');
  assert.deepEqual(result, { errors: 1, reference_units: 3, rate: 1 / 3 });
  assert.equal(segmentGraphemes('ก้').length, 1);
});

test('normalization ignores punctuation for WER and whitespace for Thai CER', () => {
  assert.deepEqual(scoreWer('Hello, Maiden.', 'hello maiden'), { errors: 0, reference_units: 2, rate: 0 });
  assert.deepEqual(scoreCer('สวัสดี ครับ', 'สวัสดีครับ'), { errors: 0, reference_units: 7, rate: 0 });
});

test('scores code-switch utterances with grapheme-safe CER', () => {
  assert.equal(metricForLanguage('code-switch'), 'cer');
  assert.equal(metricForLanguage('en'), 'wer');
});

test('loads a frozen normalizer with a stable hash', () => {
  const normalization = loadNormalizationConfig();
  assert.equal(normalization.sha256, 'fc0340cdce003e4adb3b76ea638db04a541613cb8a2c7ac6d3e8696aa4e2de80');
  assert.ok(Object.isFrozen(normalization.config));
  assert.equal(normalizeText('  HELLO\u200b   WORLD  ', normalization.config), 'hello world');
});

test('builds whisper.cpp CLI arguments without a shell command', () => {
  const args = buildWhisperCppArgs({
    modelPath: 'C:/models/ggml-small.bin',
    wavPath: 'C:/corpus/utterance.wav',
    outputBase: 'C:/output/utterance',
    extraArgs: ['-l', 'auto'],
  });
  assert.deepEqual(args, ['-l', 'auto', '-m', 'C:/models/ggml-small.bin', '-f', 'C:/corpus/utterance.wav', '-otxt', '-of', 'C:/output/utterance']);
});

test('records adapter timeouts and engine errors as failed denominator entries', async () => {
  const fixture = createBenchmarkFixture();
  try {
    const receipt = await runBenchmark({
      corpusPath: fixture.manifestPath,
      configPath: fixture.configPath,
      outputDir: fixture.outputDir,
      repoRoot: process.cwd(),
    });
    assert.equal(receipt.results.aggregate.completion.total, 4);
    assert.equal(receipt.results.aggregate.completion.succeeded, 1);
    assert.equal(receipt.results.aggregate.completion.failed, 3);
    assert.deepEqual(receipt.failures.map((failure) => failure.reason).sort(), ['engine_error', 'no_speech', 'timeout']);
    assert.ok(receipt.failures.find((failure) => failure.reason === 'timeout').latency_ms < 10_000);
    assert.equal(receipt.results.by_language.en.completion.failed, 2);
    assert.equal(receipt.results.by_language.th.completion.failed, 1);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('writes a local receipt with required benchmark fields and no raw audio', async () => {
  const fixture = createBenchmarkFixture({ includeTimeout: false });
  try {
    const receipt = await runBenchmark({
      corpusPath: fixture.manifestPath,
      configPath: fixture.configPath,
      outputDir: fixture.outputDir,
      repoRoot: process.cwd(),
    });
    const persisted = JSON.parse(readFileSync(join(fixture.outputDir, 'receipt.json'), 'utf8'));
    assert.equal(persisted.git_sha, receipt.git_sha);
    assert.equal(typeof persisted.environment.os.platform, 'string');
    assert.equal(typeof persisted.environment.hardware.arch, 'string');
    assert.equal(typeof persisted.candidate.engine.sha256, 'string');
    assert.equal(typeof persisted.candidate.model.sha256, 'string');
    assert.equal(typeof persisted.normalization.sha256, 'string');
    assert.ok(persisted.results.by_language.en);
    assert.ok(persisted.results.by_condition.quiet);
    assert.ok(persisted.results.code_switch);
    assert.ok(persisted.latency_ms.cold);
    assert.ok(persisted.latency_ms.warm);
    assert.equal(persisted.latency_ms.mode, 'process-per-utterance');
    assert.ok(Object.hasOwn(persisted, 'candidate_process_peak_working_set_bytes'));
    assert.ok(Array.isArray(persisted.failures));
    assert.equal(JSON.stringify(persisted).includes('RIFF'), false);
    assert.equal(persisted.utterances.some((utterance) => Object.hasOwn(utterance, 'wav')), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('runs faster-whisper persistently, restarts after timeout, and preserves offline mode', async () => {
  const fixture = createFasterWhisperFixture();
  try {
    const initialHash = sha256Path(fixture.modelPath);
    assert.equal(sha256Path(fixture.modelPath), initialHash);
    const receipt = await runBenchmark({
      corpusPath: fixture.manifestPath,
      configPath: fixture.configPath,
      outputDir: fixture.outputDir,
      repoRoot: process.cwd(),
      fasterWhisperWorkerPath: FIXTURE_FASTER_WHISPER_WORKER,
    });
    assert.equal(receipt.candidate.model.kind, 'directory-manifest');
    assert.equal(receipt.candidate.model.sha256, initialHash);
    assert.equal(receipt.latency_ms.mode, 'persistent');
    assert.deepEqual(receipt.utterances.map((utterance) => utterance.latency_class), ['cold', 'warm', 'warm', 'warm', 'cold']);
    assert.equal(receipt.latency_ms.restart_cold_loads, 1);
    assert.equal(receipt.utterances[0].transcript, 'offline enabled');
    assert.deepEqual(receipt.failures.map((failure) => failure.reason).sort(), ['engine_error', 'timeout']);
    assert.equal(receipt.utterances.at(-1).status, 'ok');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('production harness modules contain no network APIs', () => {
  const scan = scanHarnessSources(HERE);
  assert.deepEqual(scan.violations, []);
});
