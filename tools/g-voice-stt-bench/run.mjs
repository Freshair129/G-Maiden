#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, statSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem, type } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FASTER_WHISPER_WORKER_PATH, FasterWhisperSession, runFasterWhisper, substituteAdapterArguments, runGenericCli, runWhisperCpp } from './adapters/index.mjs';
import { loadNormalizationConfig, scoreTranscript } from './score.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT_DIR = join(HERE, 'out');
const SAMPLER_PATH = join(HERE, 'working-set.ps1');
const LANGUAGE_VALUES = new Set(['th', 'en', 'code-switch']);
const CONDITION_VALUES = new Set(['quiet', 'game-audio']);

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(path) {
  const descriptor = openSync(path, 'r');
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1_048_576);
  try {
    let bytesRead;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(descriptor);
  }
  return hash.digest('hex');
}

function sha256Directory(path) {
  const entries = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = join(directory, entry.name);
      const relativePath = relative(path, entryPath).split(sep).join('/');
      const stats = lstatSync(entryPath);
      if (stats.isSymbolicLink()) throw new Error(`model directory must not contain symbolic links: ${entryPath}`);
      if (stats.isDirectory()) visit(entryPath);
      else if (stats.isFile()) entries.push({ path: relativePath, size: stats.size, sha256: sha256File(entryPath) });
    }
  };
  visit(path);
  entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return sha256Bytes(`${JSON.stringify(entries)}\n`);
}

export function sha256Path(path) {
  const stats = statSync(path);
  return stats.isDirectory() ? sha256Directory(path) : sha256File(path);
}

function readJson(path, label) {
  try {
    return { value: JSON.parse(readFileSync(path, 'utf8')), sha256: sha256File(path) };
  } catch (error) {
    throw new Error(`Cannot read ${label} at ${path}: ${error.message}`);
  }
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value;
}

function resolveConfiguredPath(configDirectory, value, label) {
  const path = resolve(configDirectory, requireString(value, label));
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`);
  return path;
}

function validateCandidateConfig(config, configDirectory) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('candidate config must be an object');
  const adapter = requireString(config.adapter, 'adapter');
  if (!['generic-cli', 'whisper-cpp', 'faster-whisper'].includes(adapter)) {
    throw new Error('adapter must be generic-cli, whisper-cpp, or faster-whisper');
  }
  const timeoutMs = config.timeout_ms;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('timeout_ms must be a positive integer');
  if (adapter !== 'faster-whisper' && (!Array.isArray(config.engine_args) || !config.engine_args.every((argument) => typeof argument === 'string'))) {
    throw new Error('engine_args must be an array of strings');
  }
  const responseFormat = config.response_format ?? 'plain-text';
  if (!['plain-text', 'json'].includes(responseFormat)) throw new Error('response_format must be plain-text or json');
  const modelPath = resolveConfiguredPath(configDirectory, config.model_path, 'model_path');
  if (adapter === 'faster-whisper' && !statSync(modelPath).isDirectory()) {
    throw new Error(`faster-whisper model_path must be an existing local directory: ${modelPath}`);
  }
  const candidate = {
    name: typeof config.name === 'string' && config.name.trim() !== '' ? config.name : adapter,
    adapter,
    enginePath: resolveConfiguredPath(configDirectory, config.engine_path, 'engine_path'),
    engineArgs: config.engine_args ?? [],
    modelPath,
    timeoutMs,
    responseFormat,
  };
  if (adapter !== 'faster-whisper') return candidate;

  const device = config.device ?? 'cpu';
  const computeType = config.compute_type ?? 'int8';
  const language = config.language ?? null;
  const beamSize = config.beam_size ?? 5;
  if (typeof device !== 'string' || device.trim() === '') throw new Error('faster-whisper device must be a non-empty string');
  if (typeof computeType !== 'string' || computeType.trim() === '') throw new Error('faster-whisper compute_type must be a non-empty string');
  if (language !== null && language !== 'th' && language !== 'en') throw new Error('faster-whisper language must be th, en, or null');
  if (!Number.isInteger(beamSize) || beamSize < 1) throw new Error('faster-whisper beam_size must be a positive integer');
  return { ...candidate, device, computeType, language, beamSize };
}

function validateManifest(manifest, manifestDirectory) {
  const utterances = Array.isArray(manifest) ? manifest : manifest?.utterances;
  if (!Array.isArray(utterances) || utterances.length === 0) throw new Error('corpus manifest must contain a non-empty utterances array');
  const ids = new Set();
  return utterances.map((utterance, index) => {
    if (!utterance || typeof utterance !== 'object' || Array.isArray(utterance)) throw new Error(`utterance ${index} must be an object`);
    const id = requireString(utterance.id, `utterance ${index} id`);
    if (ids.has(id)) throw new Error(`corpus manifest has duplicate id: ${id}`);
    ids.add(id);
    const language = requireString(utterance.language, `utterance ${id} language`);
    const condition = requireString(utterance.condition, `utterance ${id} condition`);
    if (!LANGUAGE_VALUES.has(language)) throw new Error(`utterance ${id} has unsupported language: ${language}`);
    if (!CONDITION_VALUES.has(condition)) throw new Error(`utterance ${id} has unsupported condition: ${condition}`);
    const split = requireString(utterance.split, `utterance ${id} split`);
    if (!['tuning', 'holdout'].includes(split)) throw new Error(`utterance ${id} split must be tuning or holdout`);
    const wavPath = resolve(manifestDirectory, requireString(utterance.wav, `utterance ${id} wav`));
    if (!existsSync(wavPath)) throw new Error(`utterance ${id} WAV does not exist: ${wavPath}`);
    return {
      id,
      language,
      condition,
      speaker: requireString(utterance.speaker, `utterance ${id} speaker`),
      session: requireString(utterance.session, `utterance ${id} session`),
      split,
      reference: requireString(utterance.reference, `utterance ${id} reference`),
      intent: Object.hasOwn(utterance, 'intent') ? utterance.intent : undefined,
      slots: Object.hasOwn(utterance, 'slots') ? utterance.slots : undefined,
      wavPath,
    };
  });
}

function validatePcm16Mono16kWav(path) {
  const wav = readFileSync(path);
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`WAV must be RIFF/WAVE: ${path}`);
  }
  let offset = 12;
  let format;
  let dataBytes = 0;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > wav.length) throw new Error(`WAV has a truncated ${id} chunk: ${path}`);
    if (id === 'fmt ' && size >= 16) {
      format = {
        audioFormat: wav.readUInt16LE(body),
        channels: wav.readUInt16LE(body + 2),
        sampleRate: wav.readUInt32LE(body + 4),
        bitsPerSample: wav.readUInt16LE(body + 14),
      };
    }
    if (id === 'data') dataBytes = size;
    offset = body + size + (size % 2);
  }
  if (!format || dataBytes === 0 || format.audioFormat !== 1 || format.channels !== 1
    || format.sampleRate !== 16_000 || format.bitsPerSample !== 16) {
    throw new Error(`WAV must be mono 16 kHz PCM16: ${path}`);
  }
}

function gitSha(repoRoot) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function environmentSummary() {
  return {
    os: { platform: platform(), type: type(), release: release() },
    hardware: {
      arch: arch(),
      logical_cpu_count: cpus().length,
      cpu_model: cpus()[0]?.model ?? null,
      total_memory_bytes: totalmem(),
    },
  };
}

function sampleWorkingSet(pid) {
  if (platform() !== 'win32') return Promise.resolve(null);
  return new Promise((resolveSample) => {
    const child = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SAMPLER_PATH, '-ProcessId', String(pid),
    ], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.once('error', () => resolveSample(null));
    child.once('close', (code) => {
      const value = Number(stdout.trim());
      resolveSample(code === 0 && Number.isSafeInteger(value) && value >= 0 ? value : null);
    });
  });
}

function createWorkingSetSampler(pid) {
  const samples = [];
  const pending = new Set();
  let errors = 0;
  const takeSample = () => {
    const sample = sampleWorkingSet(pid).then((value) => {
      if (value === null) errors += 1;
      else samples.push(value);
    }).finally(() => pending.delete(sample));
    pending.add(sample);
  };
  takeSample();
  const timer = setInterval(takeSample, 1_000);
  return {
    async stop() {
      clearInterval(timer);
      await Promise.allSettled([...pending]);
      return { peak: samples.length === 0 ? null : Math.max(...samples), samples: samples.length, errors };
    },
  };
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function exactMatch(expected, actual, completed) {
  if (expected === undefined) return null;
  if (!completed || actual === null || actual === undefined) return false;
  return JSON.stringify(canonicalValue(expected)) === JSON.stringify(canonicalValue(actual));
}

function aggregateMetric(records, metric) {
  const relevant = records.filter((record) => record.score.metric === metric);
  const errors = relevant.reduce((sum, record) => sum + record.score.errors, 0);
  const referenceUnits = relevant.reduce((sum, record) => sum + record.score.reference_units, 0);
  return {
    utterances: relevant.length,
    errors,
    reference_units: referenceUnits,
    rate: referenceUnits === 0 ? null : errors / referenceUnits,
  };
}

function aggregateExact(records, key) {
  const evaluated = records.filter((record) => record[key] !== null);
  const exact = evaluated.filter((record) => record[key] === true).length;
  return { total: evaluated.length, exact, rate: evaluated.length === 0 ? null : exact / evaluated.length };
}

function summarize(records) {
  const succeeded = records.filter((record) => record.status === 'ok').length;
  return {
    utterances: records.length,
    wer: aggregateMetric(records, 'wer'),
    cer: aggregateMetric(records, 'cer'),
    intent_exact_match: aggregateExact(records, 'intent_exact_match'),
    slot_exact_match: aggregateExact(records, 'slot_exact_match'),
    completion: {
      total: records.length,
      succeeded,
      failed: records.length - succeeded,
      rate: records.length === 0 ? null : succeeded / records.length,
    },
  };
}

function percentile(sorted, percentileValue) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)];
}

function latencySummary(records) {
  const sorted = records.map((record) => record.latency_ms).sort((left, right) => left - right);
  return {
    samples: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length === 0 ? null : sorted.at(-1),
  };
}

function ensureOutputOutsideCorpus(outputDir, corpusDirectory) {
  const pathFromCorpus = relative(corpusDirectory, outputDir);
  if (pathFromCorpus === '' || (!pathFromCorpus.startsWith('..') && !isAbsolute(pathFromCorpus))) {
    throw new Error('output directory must not be the corpus directory or one of its children');
  }
}

function requestLanguage(candidate, utterance) {
  if (candidate.language !== null) return candidate.language;
  return utterance.language === 'code-switch' ? null : utterance.language;
}

async function runAdapter(candidate, utterance, outputDir, repoRoot, onProcess, fasterWhisperSession) {
  if (candidate.adapter === 'faster-whisper') {
    return runFasterWhisper({
      session: fasterWhisperSession,
      utteranceId: utterance.id,
      wavPath: utterance.wavPath,
      language: requestLanguage(candidate, utterance),
      timeoutMs: candidate.timeoutMs,
      onProcess,
    });
  }
  if (candidate.adapter === 'whisper-cpp') {
    return runWhisperCpp({
      enginePath: candidate.enginePath,
      engineArgs: candidate.engineArgs,
      modelPath: candidate.modelPath,
      wavPath: utterance.wavPath,
      outputDir,
      utteranceId: utterance.id,
      timeoutMs: candidate.timeoutMs,
      cwd: repoRoot,
      onSpawn: onProcess,
    });
  }
  return runGenericCli({
    command: candidate.enginePath,
    args: substituteAdapterArguments(candidate.engineArgs, { wavPath: utterance.wavPath, modelPath: candidate.modelPath }),
    timeoutMs: candidate.timeoutMs,
    cwd: repoRoot,
    responseFormat: candidate.responseFormat,
    onSpawn: onProcess,
  });
}

export async function runBenchmark({
  corpusPath,
  configPath,
  outputDir = DEFAULT_OUTPUT_DIR,
  repoRoot = resolve(HERE, '..', '..'),
  fasterWhisperWorkerPath = DEFAULT_FASTER_WHISPER_WORKER_PATH,
}) {
  const absoluteCorpusPath = resolve(corpusPath);
  const absoluteConfigPath = resolve(configPath);
  const absoluteOutputDir = resolve(outputDir);
  const corpusDirectory = dirname(absoluteCorpusPath);
  ensureOutputOutsideCorpus(absoluteOutputDir, corpusDirectory);
  mkdirSync(absoluteOutputDir, { recursive: true });

  const manifestFile = readJson(absoluteCorpusPath, 'corpus manifest');
  const candidateFile = readJson(absoluteConfigPath, 'candidate config');
  const utterances = validateManifest(manifestFile.value, corpusDirectory);
  const candidate = validateCandidateConfig(candidateFile.value, dirname(absoluteConfigPath));
  const normalization = loadNormalizationConfig();
  for (const utterance of utterances) validatePcm16Mono16kWav(utterance.wavPath);

  const records = [];
  const failures = [];
  const resourceRuns = [];
  const fasterWhisperSession = candidate.adapter === 'faster-whisper'
    ? new FasterWhisperSession({
      enginePath: candidate.enginePath,
      modelPath: candidate.modelPath,
      device: candidate.device,
      computeType: candidate.computeType,
      language: candidate.language,
      beamSize: candidate.beamSize,
      cwd: repoRoot,
      workerPath: fasterWhisperWorkerPath,
    })
    : null;
  try {
    for (const [index, utterance] of utterances.entries()) {
      let sampler = null;
      const result = await runAdapter(candidate, utterance, absoluteOutputDir, repoRoot, (pid) => {
        sampler = createWorkingSetSampler(pid);
      }, fasterWhisperSession);
      const sampled = sampler ? await sampler.stop() : { peak: null, samples: 0, errors: 0 };
      resourceRuns.push(sampled);
      const completed = result.status === 'ok';
      const transcript = typeof result.transcript === 'string' ? result.transcript : '';
      const score = scoreTranscript({ reference: utterance.reference, hypothesis: transcript, language: utterance.language, config: normalization.config });
      const latencyClass = candidate.adapter === 'faster-whisper'
        ? (result.worker_started ? 'cold' : 'warm')
        : (index === 0 ? 'cold' : 'warm');
      const record = {
        id: utterance.id,
        language: utterance.language,
        condition: utterance.condition,
        code_switch: utterance.language === 'code-switch',
        speaker: utterance.speaker,
        session: utterance.session,
        split: utterance.split,
        reference: utterance.reference,
        transcript: completed ? transcript : null,
        status: result.status,
        latency_ms: result.duration_ms,
        latency_class: latencyClass,
        score,
        intent_exact_match: exactMatch(utterance.intent, result.intent, completed),
        slot_exact_match: exactMatch(utterance.slots, result.slots, completed),
      };
      records.push(record);
      if (!completed) {
        failures.push({
          id: utterance.id,
          language: utterance.language,
          condition: utterance.condition,
          reason: result.reason ?? result.status,
          latency_ms: result.duration_ms,
          exit_code: result.exit_code ?? null,
        });
      }
      if (index === 0 && records.length !== 1) throw new Error('cold latency record was not retained');
    }
  } finally {
    await fasterWhisperSession?.close();
  }

  const byLanguage = Object.fromEntries([...LANGUAGE_VALUES].map((language) => [language, summarize(records.filter((record) => record.language === language))]));
  const byCondition = Object.fromEntries([...CONDITION_VALUES].map((condition) => [condition, summarize(records.filter((record) => record.condition === condition))]));
  const peaks = resourceRuns.map((run) => run.peak).filter((peak) => peak !== null);
  const receipt = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    git_sha: gitSha(repoRoot),
    environment: environmentSummary(),
    candidate: {
      name: candidate.name,
      adapter: candidate.adapter,
      timeout_ms: candidate.timeoutMs,
      config_sha256: candidateFile.sha256,
      engine: { path: candidate.enginePath, sha256: sha256Path(candidate.enginePath) },
      model: {
        path: candidate.modelPath,
        kind: statSync(candidate.modelPath).isDirectory() ? 'directory-manifest' : 'file',
        sha256: sha256Path(candidate.modelPath),
      },
    },
    normalization: { path: normalization.path, sha256: normalization.sha256 },
    corpus: { manifest_sha256: manifestFile.sha256, utterance_count: utterances.length },
    results: {
      aggregate: summarize(records),
      by_language: byLanguage,
      by_condition: byCondition,
      code_switch: summarize(records.filter((record) => record.code_switch)),
    },
    latency_ms: {
      mode: candidate.adapter === 'faster-whisper' ? 'persistent' : 'process-per-utterance',
      cold: latencySummary(records.filter((record) => record.latency_class === 'cold')),
      warm: latencySummary(records.filter((record) => record.latency_class === 'warm')),
      restart_cold_loads: candidate.adapter === 'faster-whisper'
        ? Math.max(0, records.filter((record) => record.latency_class === 'cold').length - 1)
        : 0,
    },
    candidate_process_peak_working_set_bytes: peaks.length === 0 ? null : Math.max(...peaks),
    resource_sampling: {
      scope: 'candidate process tree only; not whole-app accounting',
      interval_ms: 1_000,
      successful_samples: resourceRuns.reduce((sum, run) => sum + run.samples, 0),
      unavailable_samples: resourceRuns.reduce((sum, run) => sum + run.errors, 0),
    },
    failures,
    utterances: records,
  };
  writeFileSync(join(absoluteOutputDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return receipt;
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!['--corpus', '--config', '--output'].includes(name)) throw new Error(`Unknown argument: ${name}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a path`);
    values[name.slice(2)] = value;
    index += 1;
  }
  if (!values.corpus || !values.config) throw new Error('Usage: node run.mjs --corpus <manifest.json> --config <candidate.json> [--output <dir>]');
  return values;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const receipt = await runBenchmark({ corpusPath: args.corpus, configPath: args.config, outputDir: args.output ?? DEFAULT_OUTPUT_DIR });
  process.stdout.write(`Wrote local receipt for ${receipt.corpus.utterance_count} utterances to ${join(resolve(args.output ?? DEFAULT_OUTPUT_DIR), 'receipt.json')}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
