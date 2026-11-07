import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FASTER_WHISPER_WORKER_PATH = join(HERE, 'faster_whisper_worker.py');

function assertTimeout(timeoutMs) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('timeout_ms must be a positive integer and is required before each utterance starts');
  }
}

function workerResult(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { status: 'engine_error', reason: 'invalid_worker_output', transcript: null };
  }
  if (typeof message.error === 'string') {
    return { status: 'engine_error', reason: 'engine_error', error: message.error, transcript: null };
  }
  if (typeof message.transcript !== 'string') {
    return { status: 'engine_error', reason: 'invalid_worker_output', transcript: null };
  }
  if (message.transcript.trim() === '') return { status: 'no_speech', reason: 'no_speech', transcript: '' };
  return { status: 'ok', transcript: message.transcript.trim(), intent: null, slots: null };
}

export class FasterWhisperSession {
  constructor({ enginePath, modelPath, device = 'cpu', computeType = 'int8', language = null, beamSize = 5, cwd, workerPath = DEFAULT_FASTER_WHISPER_WORKER_PATH }) {
    this.enginePath = enginePath;
    this.modelPath = modelPath;
    this.device = device;
    this.computeType = computeType;
    this.language = language;
    this.beamSize = beamSize;
    this.cwd = cwd;
    this.workerPath = workerPath;
    this.child = null;
    this.pending = null;
    this.stdout = '';
  }

  get pid() {
    return this.child?.pid ?? null;
  }

  startWorker() {
    if (this.child) return false;
    const languageArgument = this.language === null ? 'auto' : this.language;
    const child = spawn(this.enginePath, [
      this.workerPath,
      '--model-path', this.modelPath,
      '--device', this.device,
      '--compute-type', this.computeType,
      '--language', languageArgument,
      '--beam-size', String(this.beamSize),
    ], {
      cwd: this.cwd,
      env: {
        ...process.env,
        HF_HUB_OFFLINE: '1',
        TRANSFORMERS_OFFLINE: '1',
      },
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    this.stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => this.handleStdout(child, chunk));
    // Drain worker diagnostics so a full stderr pipe cannot stall transcription.
    child.stderr.resume();
    child.stdin.on('error', (error) => this.handleWorkerFailure(child, 'worker_stdin_error', error));
    child.once('error', (error) => this.handleWorkerFailure(child, 'spawn_error', error));
    child.once('close', (exitCode, signal) => this.handleWorkerClose(child, exitCode, signal));
    return true;
  }

  handleStdout(child, chunk) {
    this.stdout += chunk;
    let newline;
    while ((newline = this.stdout.indexOf('\n')) >= 0) {
      const line = this.stdout.slice(0, newline).trim();
      this.stdout = this.stdout.slice(newline + 1);
      if (line !== '') this.handleWorkerLine(child, line);
    }
  }

  handleWorkerLine(child, line) {
    const pending = this.pending;
    if (!pending || pending.child !== child) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.finishPending(pending, { status: 'engine_error', reason: 'invalid_worker_output', transcript: null });
      return;
    }
    if (message?.id !== pending.id) {
      this.finishPending(pending, { status: 'engine_error', reason: 'invalid_worker_output', transcript: null });
      return;
    }
    this.finishPending(pending, workerResult(message));
  }

  handleWorkerFailure(child, reason, error) {
    if (this.child === child) this.child = null;
    const pending = this.pending;
    if (pending?.child === child) {
      this.finishPending(pending, {
        status: 'engine_error',
        reason,
        error: String(error?.message ?? error),
        transcript: null,
      });
    }
  }

  handleWorkerClose(child, exitCode, signal) {
    if (this.child === child) this.child = null;
    const pending = this.pending;
    if (pending?.child === child) {
      this.finishPending(pending, {
        status: 'engine_error',
        reason: 'engine_error',
        transcript: null,
        exit_code: exitCode,
        signal,
      });
    }
  }

  finishPending(pending, result) {
    if (this.pending !== pending) return;
    this.pending = null;
    clearTimeout(pending.timeout);
    pending.resolve({
      ...result,
      duration_ms: performance.now() - pending.startedAt,
      worker_started: pending.workerStarted,
    });
  }

  async stopWorker(child = this.child) {
    if (!child || child.exitCode !== null || this.child !== child) return;
    await new Promise((resolveStopped) => {
      const done = () => resolveStopped();
      child.once('close', done);
      try {
        child.kill();
      } catch {
        done();
      }
    });
  }

  async transcribe({ id, wavPath, language, timeoutMs, onProcess }) {
    assertTimeout(timeoutMs);
    const startedAt = performance.now();
    let workerStarted;
    try {
      workerStarted = this.startWorker();
    } catch (error) {
      return {
        status: 'engine_error',
        reason: 'spawn_error',
        error: String(error?.message ?? error),
        transcript: null,
        duration_ms: performance.now() - startedAt,
        worker_started: true,
      };
    }
    const child = this.child;
    if (!child?.pid) {
      return {
        status: 'engine_error',
        reason: 'spawn_error',
        transcript: null,
        duration_ms: performance.now() - startedAt,
        worker_started: workerStarted,
      };
    }
    try {
      onProcess?.(child.pid);
    } catch (error) {
      await this.stopWorker(child);
      return {
        status: 'engine_error',
        reason: 'sampler_error',
        error: String(error?.message ??error),
        transcript: null,
        duration_ms: performance.now() - startedAt,
        worker_started: workerStarted,
      };
    }

    return new Promise((resolveRun) => {
      const pending = {
        id,
        child,
        startedAt,
        workerStarted,
        resolve: resolveRun,
        timeout: null,
      };
      this.pending = pending;
      pending.timeout = setTimeout(async () => {
        if (this.pending !== pending) return;
        this.pending = null;
        await this.stopWorker(child);
        resolveRun({
          status: 'timeout',
          reason: 'timeout',
          transcript: null,
          duration_ms: performance.now() - startedAt,
          worker_started: workerStarted,
        });
      }, timeoutMs);
      try {
        child.stdin.write(`${JSON.stringify({ id, wav: wavPath, language })}\n`);
      } catch (error) {
        this.finishPending(pending, {
          status: 'engine_error',
          reason: 'worker_stdin_error',
          error: String(error?.message ?? error),
          transcript: null,
        });
      }
    });
  }

  async close() {
    await this.stopWorker();
  }
}

export function runFasterWhisper({ session, utteranceId, wavPath, language, timeoutMs, onProcess }) {
  return session.transcribe({ id: utteranceId, wavPath, language, timeoutMs, onProcess });
}
