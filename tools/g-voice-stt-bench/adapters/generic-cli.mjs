import { spawn } from 'node:child_process';

function assertTimeout(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('timeout_ms must be a positive integer and is required before each utterance starts');
  }
}

function parseOutput(stdout, responseFormat) {
  const text = stdout.trim();
  if (responseFormat === 'ignore') return { status: 'ok', transcript: null, intent: null, slots: null };
  if (responseFormat === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { status: 'engine_error', reason: 'invalid_json_output', transcript: null };
    }
    if (!parsed || typeof parsed.transcript !== 'string') {
      return { status: 'engine_error', reason: 'invalid_json_output', transcript: null };
    }
    if (parsed.transcript.trim() === '') return { status: 'no_speech', reason: 'no_speech', transcript: '' };
    return {
      status: 'ok',
      transcript: parsed.transcript.trim(),
      intent: typeof parsed.intent === 'string' ? parsed.intent : null,
      slots: parsed.slots && typeof parsed.slots === 'object' && !Array.isArray(parsed.slots) ? parsed.slots : null,
    };
  }
  if (text === '') return { status: 'no_speech', reason: 'no_speech', transcript: '' };
  return { status: 'ok', transcript: text, intent: null, slots: null };
}

export function substituteAdapterArguments(args, values) {
  if (!Array.isArray(args) || !args.every((argument) => typeof argument === 'string')) {
    throw new Error('engine_args must be an array of strings');
  }
  return args.map((argument) => argument
    .replaceAll('{wav}', values.wavPath)
    .replaceAll('{model}', values.modelPath));
}

export async function runGenericCli({ command, args, timeoutMs, cwd, responseFormat = 'plain-text', onSpawn }) {
  assertTimeout(timeoutMs);
  if (typeof command !== 'string' || command === '') throw new Error('engine_path must be a non-empty string');
  if (!Array.isArray(args) || !args.every((argument) => typeof argument === 'string')) {
    throw new Error('adapter arguments must be strings');
  }
  if (!['plain-text', 'json', 'ignore'].includes(responseFormat)) throw new Error('response_format must be plain-text, json, or ignore');

  const startedAt = performance.now();
  return new Promise((resolveRun) => {
    let settled = false;
    let timedOut = false;
    let stdout = '';
    let stderr = '';
    let child;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveRun({ ...result, duration_ms: performance.now() - startedAt, stdout, stderr });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      if (child?.pid) child.kill();
    }, timeoutMs);

    try {
      child = spawn(command, args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      finish({ status: 'engine_error', reason: 'spawn_error', error: String(error?.message ?? error), transcript: null });
      return;
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      finish({ status: 'engine_error', reason: 'spawn_error', error: String(error.message), transcript: null });
    });
    child.once('spawn', () => {
      try {
        onSpawn?.(child.pid);
      } catch (error) {
        child.kill();
        finish({ status: 'engine_error', reason: 'sampler_error', error: String(error?.message ?? error), transcript: null });
      }
    });
    child.once('close', (exitCode, signal) => {
      if (timedOut) {
        finish({ status: 'timeout', reason: 'timeout', transcript: null, exit_code: exitCode, signal });
        return;
      }
      if (exitCode !== 0) {
        finish({ status: 'engine_error', reason: 'engine_error', transcript: null, exit_code: exitCode, signal });
        return;
      }
      finish({ ...parseOutput(stdout, responseFormat), exit_code: exitCode, signal });
    });
  });
}
