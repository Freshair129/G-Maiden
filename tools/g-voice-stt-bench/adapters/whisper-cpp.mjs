import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runGenericCli } from './generic-cli.mjs';

export function buildWhisperCppArgs({ modelPath, wavPath, outputBase, extraArgs = [] }) {
  if (!Array.isArray(extraArgs) || !extraArgs.every((argument) => typeof argument === 'string')) {
    throw new Error('engine_args must be an array of strings');
  }
  return [...extraArgs, '-m', modelPath, '-f', wavPath, '-otxt', '-of', outputBase];
}

export async function runWhisperCpp({ enginePath, engineArgs = [], modelPath, wavPath, outputDir, utteranceId, timeoutMs, cwd, onSpawn }) {
  const tempDir = mkdtempSync(join(outputDir, '.whisper-cpp-'));
  const outputBase = join(tempDir, utteranceId);
  try {
    const result = await runGenericCli({
      command: enginePath,
      args: buildWhisperCppArgs({ modelPath, wavPath, outputBase, extraArgs: engineArgs }),
      timeoutMs,
      cwd,
      onSpawn,
      responseFormat: 'ignore',
    });
    if (result.status !== 'ok') return result;
    let transcript = '';
    try {
      transcript = readFileSync(`${outputBase}.txt`, 'utf8').trim();
    } catch {
      return { ...result, status: 'no_speech', reason: 'no_speech', transcript: '' };
    }
    return transcript === ''
      ? { ...result, status: 'no_speech', reason: 'no_speech', transcript: '' }
      : { ...result, transcript };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
