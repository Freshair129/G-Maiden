import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { createMvp009IsolatedLaunch } from './isolation.mjs';

const SETTINGS_FIELDS = new Set([
  'overlayVisible', 'position', 'customX', 'customY', 'opacity', 'alertEnabled', 'alertThreshold',
  'voiceEnabled', 'voiceName', 'voiceRate', 'volume', 'announcerEnabled', 'signalEnabled',
  'personaLines', 'autoAdvice', 'gankVisuals', 'killVisuals', 'signalSensitivity', 'masterEnabled',
  'masterBackend', 'masterAuth', 'masterOllamaModel', 'cvDebug', 'calibration', 'efficacyStudy',
  'telemetrySource', 'uiMode', 'layout', 'showTimer', 'showScore', 'showHeroBar', 'showKda',
  'showGold', 'personaPreset',
]);
const BOOLEAN_SETTINGS = new Set([
  'overlayVisible', 'alertEnabled', 'voiceEnabled', 'announcerEnabled', 'signalEnabled', 'personaLines',
  'autoAdvice', 'gankVisuals', 'killVisuals', 'masterEnabled', 'cvDebug', 'calibration', 'efficacyStudy',
  'showTimer', 'showScore', 'showHeroBar', 'showKda', 'showGold',
]);
const NUMBER_SETTINGS = new Map([
  ['customX', [0, 100]], ['customY', [0, 100]], ['opacity', [0, 1]], ['alertThreshold', [0, 100]],
  ['voiceRate', [-10, 10]], ['volume', [0, 100]],
]);
const ENUM_SETTINGS = new Map([
  ['position', new Set(['top', 'left', 'right', 'custom'])],
  ['signalSensitivity', new Set(['low', 'med', 'high'])],
  ['masterBackend', new Set(['auto', 'claude', 'ollama'])],
  ['masterAuth', new Set(['plan', 'apikey'])],
  ['telemetrySource', new Set(['auto', 'feeder', 'gtelemetry', 'off'])],
  ['uiMode', new Set(['full'])],
  ['personaPreset', new Set(['coach', 'silent', 'caster', 'meme'])],
]);
const LAYOUT_MODULES = new Set([
  'alert', 'gmeter', 'toast', 'companion', 'advice', 'buyback', 'missing', 'banner', 'lowhp', 'vol',
  'standby', 'clock', 'kda', 'gold', 'gpm', 'xpm', 'nw', 'score', 'hero',
]);
const LEGACY_AUDIO_FIELDS = new Set(['volume', 'master', 'annEnabled', 'signalEnabled']);
const AFFECTED_KEYS = Object.freeze(['gm-settings', 'gm-deck-audio-rail']);

function assertLayoutProjection(layout, label) {
  if (layout === null || typeof layout !== 'object' || Array.isArray(layout)) {
    throw new Error(`${label}.layout must be a projected object`);
  }
  for (const [moduleId, config] of Object.entries(layout)) {
    if (!LAYOUT_MODULES.has(moduleId) || config === null || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`${label}.layout contains an invalid module projection`);
    }
    for (const key of Object.keys(config)) {
      if (!['x', 'y', 'scale', 'enabled'].includes(key)) {
        throw new Error(`${label}.layout contains an unsupported field`);
      }
    }
    for (const key of ['x', 'y']) {
      if (key in config && (typeof config[key] !== 'number' || !Number.isFinite(config[key]) || config[key] < 0 || config[key] > 100)) {
        throw new Error(`${label}.layout position is outside the settings schema`);
      }
    }
    if ('scale' in config && (typeof config.scale !== 'number' || !Number.isFinite(config.scale) || config.scale < 0.25 || config.scale > 4)) {
      throw new Error(`${label}.layout scale is outside the settings schema`);
    }
    if ('enabled' in config && typeof config.enabled !== 'boolean') {
      throw new Error(`${label}.layout enabled must be boolean`);
    }
  }
}

function assertProjection(value, allowedFields, label) {
  if (value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a key-scoped object or null`);
  }
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) throw new Error(`${label} contains an unsupported field`);
    if (/api.?key|token|credential|password|secret|email/i.test(key)) {
      throw new Error(`${label} contains a sensitive field`);
    }
    const fieldValue = value[key];
    if (label === 'gm-settings') {
      if (BOOLEAN_SETTINGS.has(key) && typeof fieldValue !== 'boolean') {
        throw new Error(`${label}.${key} must be boolean`);
      }
      if (NUMBER_SETTINGS.has(key)) {
        const [min, max] = NUMBER_SETTINGS.get(key);
        if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue) || fieldValue < min || fieldValue > max) {
          throw new Error(`${label}.${key} is outside the settings schema`);
        }
      }
      if (ENUM_SETTINGS.has(key) && !ENUM_SETTINGS.get(key).has(fieldValue)) {
        throw new Error(`${label}.${key} is outside the settings enum`);
      }
      if (['voiceName', 'masterOllamaModel'].includes(key)
          && (typeof fieldValue !== 'string' || fieldValue.length > 128)) {
        throw new Error(`${label}.${key} is outside the settings schema`);
      }
      if (key === 'layout') assertLayoutProjection(fieldValue, label);
    } else if (key === 'volume' || key === 'master') {
      if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) {
        throw new Error(`${label}.${key} must be a finite number`);
      }
    } else if (typeof fieldValue !== 'boolean') {
      throw new Error(`${label}.${key} must be boolean`);
    }
  }
}

function assertAffectedSnapshot(snapshot) {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('normal-profile reader must return a settings-only snapshot');
  }
  const keys = Object.keys(snapshot).sort();
  if (!isDeepStrictEqual(keys, [...AFFECTED_KEYS].sort())) {
    throw new Error('normal-profile snapshot must contain only the two affected storage keys');
  }
  assertProjection(snapshot['gm-settings'], SETTINGS_FIELDS, 'gm-settings');
  assertProjection(snapshot['gm-deck-audio-rail'], LEGACY_AUDIO_FIELDS, 'gm-deck-audio-rail');
}

/**
 * Launch a smoke executable with native, WebView2, and package data rooted in
 * a fresh, validated run directory. A supported key-scoped reader can
 * additionally prove the normal profile's affected settings were unchanged.
 */
export async function runMvp009IsolatedSmoke({
  command,
  args = [],
  tempParent,
  normalLocalAppData,
  normalUserProfile,
  baseEnvironment = process.env,
  readNormalAffectedSettings,
  requireProfileSnapshot = true,
  spawnCommand = spawn,
}) {
  if (typeof command !== 'string' || command.trim() === '') throw new Error('smoke command is required');
  const launch = createMvp009IsolatedLaunch({
    tempParent,
    normalLocalAppData,
    normalUserProfile,
    baseEnvironment,
  });
  const canReadNormalSettings = typeof readNormalAffectedSettings === 'function'
    && readNormalAffectedSettings.supportedReadOnlyKeyScoped === true;
  if (requireProfileSnapshot && !canReadNormalSettings) {
    throw new Error('refusing to launch: no supported read-only key-scoped reader is available for normal-profile settings');
  }

  const readSnapshot = canReadNormalSettings ? async () => {
    const snapshot = await readNormalAffectedSettings(AFFECTED_KEYS);
    assertAffectedSnapshot(snapshot);
    return snapshot;
  } : null;
  const before = readSnapshot ? await readSnapshot() : null;
  let exit = null;
  let launchError = null;
  try {
    fs.mkdirSync(launch.childEnvironment.TEMP, { recursive: true });
    const child = spawnCommand(command, [...args, '--mvp009-isolated-smoke'], {
      env: launch.childEnvironment,
      shell: false,
      stdio: 'inherit',
    });
    exit = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
  } catch (error) {
    launchError = error;
  }

  const after = readSnapshot ? await readSnapshot() : null;
  if (readSnapshot && !isDeepStrictEqual(before, after)) {
    throw new Error('normal-profile affected settings changed during isolated smoke; snapshots withheld');
  }
  if (launchError) throw launchError;
  if (exit.code !== 0) throw new Error(`smoke command exited with code ${exit.code ?? 'unknown'}`);
  return Object.freeze({
    exitCode: exit.code,
    runRoot: launch.runRoot,
    tempParent: launch.tempParent,
    nativeSettingsFile: launch.nativeSettingsFile,
    webview2UserDataDirectory: launch.webview2UserDataDirectory,
    normalSettingsSnapshotVerified: Boolean(readSnapshot),
  });
}

async function main() {
  const [command, ...requestedArgs] = process.argv.slice(2);
  if (!command) {
    throw new Error('usage: node tools/mvp009/smoke-launch.mjs <release-executable> [args...] [--path-isolation-only]');
  }
  const pathIsolationOnly = requestedArgs.includes('--path-isolation-only');
  const args = requestedArgs.filter((arg) => arg !== '--path-isolation-only');
  if (pathIsolationOnly) {
    process.stderr.write('Normal settings were not snapshot-verified; native, WebView2, and package data paths are isolated for this smoke run.\n');
  }
  const result = await runMvp009IsolatedSmoke({
    command: path.resolve(command),
    args,
    tempParent: process.env.MVP009_TEMP_PARENT ?? path.dirname(path.resolve(command)),
    normalLocalAppData: process.env.LOCALAPPDATA,
    normalUserProfile: process.env.USERPROFILE,
    baseEnvironment: process.env,
    requireProfileSnapshot: !pathIsolationOnly,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
}
