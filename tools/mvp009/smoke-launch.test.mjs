import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { runMvp009IsolatedSmoke } from './smoke-launch.mjs';

const normalPaths = {
  tempParent: 'D:\\',
  normalLocalAppData: process.env.LOCALAPPDATA,
  normalUserProfile: process.env.USERPROFILE,
  baseEnvironment: {
    PATH: 'system-path',
    SystemRoot: 'C:\\Windows',
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    WEBVIEW2_USER_DATA_FOLDER: 'C:\\Users\\player\\AppData\\Local\\com.gmaiden.app\\EBWebView',
    API_KEY: 'must-not-forward',
    USERPROFILE: 'C:\\Users\\player',
  },
};

test('root no-bundle smoke script builds then invokes the isolated launcher', async () => {
  const rootPackage = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(rootPackage.scripts['mvp009:smoke'], /tauri build --no-bundle/);
  assert.match(rootPackage.scripts['mvp009:smoke'], /tools\/mvp009\/smoke-launch\.mjs/);
  assert.match(rootPackage.scripts['mvp009:smoke'], /--path-isolation-only/);
  assert.match(rootPackage.scripts['mvp009:smoke'], /src-tauri\/target\/release\/g-maiden\.exe/);
  assert.ok(path.isAbsolute(new URL('../../package.json', import.meta.url).pathname));
});

function safeReader() {
  const read = async (keys) => {
    assert.deepEqual(keys, ['gm-settings', 'gm-deck-audio-rail']);
    return {
      'gm-settings': { volume: 80, voiceName: '', signalSensitivity: 'med', personaPreset: 'coach' },
      'gm-deck-audio-rail': null,
    };
  };
  read.supportedReadOnlyKeyScoped = true;
  return read;
}

test('smoke launcher passes only isolated storage paths to the executable', async () => {
  let spawnCall;
  const result = await runMvp009IsolatedSmoke({
    ...normalPaths,
    command: 'D:\\build\\g-maiden.exe',
    args: ['--smoke'],
    readNormalAffectedSettings: safeReader(),
    spawnCommand: (command, args, options) => {
      spawnCall = { command, args, options };
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', 0, null));
      return child;
    },
  });

  assert.equal(spawnCall.command, 'D:\\build\\g-maiden.exe');
  assert.deepEqual(spawnCall.args, ['--smoke', '--mvp009-isolated-smoke']);
  assert.equal(spawnCall.options.shell, false);
  assert.equal(spawnCall.options.env.LOCALAPPDATA, `${result.runRoot}\\native-local-app-data`);
  assert.equal(spawnCall.options.env.WEBVIEW2_USER_DATA_FOLDER, result.webview2UserDataDirectory);
  assert.equal(spawnCall.options.env.TEMP, `${result.runRoot}\\temp`);
  assert.equal(spawnCall.options.env.TMP, `${result.runRoot}\\temp`);
  assert.equal(spawnCall.options.env.MVP009_ISOLATION_ROOT, result.runRoot);
  assert.equal(spawnCall.options.env.MVP009_TEMP_PARENT, result.tempParent);
  assert.equal(spawnCall.options.env.GMAIDEN_PACKAGE_DATA_ROOT, `${result.runRoot}\\package-data`);
  assert.equal(spawnCall.options.env.MVP009_NORMAL_USER_PROFILE.toLowerCase(), process.env.USERPROFILE.toLowerCase());
  assert.equal(spawnCall.options.env.MVP009_NORMAL_LOCALAPPDATA.toLowerCase(), process.env.LOCALAPPDATA.toLowerCase());
  assert.equal(spawnCall.options.env.API_KEY, undefined);
  assert.equal(spawnCall.options.env.USERPROFILE, undefined);
  assert.equal(existsSync(spawnCall.options.env.TEMP), true);
  assert.ok(result.nativeSettingsFile.startsWith(`${result.runRoot}\\`));
  assert.ok(result.webview2UserDataDirectory.startsWith(`${result.runRoot}\\`));
  assert.equal(result.exitCode, 0);
  assert.match(result.runRoot, /^d:\\gmaiden-mvp009-[0-9a-f-]+$/);
  rmSync(result.runRoot, { recursive: true, force: true });
});

test('refuses to spawn when no supported key-scoped reader is configured', async () => {
  let spawned = false;
  await assert.rejects(
    runMvp009IsolatedSmoke({
      ...normalPaths,
      command: 'D:\\build\\g-maiden.exe',
      spawnCommand: () => { spawned = true; },
    }),
    /no supported read-only key-scoped reader is available/,
  );
  assert.equal(spawned, false);
});

test('permits the explicit path-isolation-only smoke mode without a profile reader', async () => {
  let spawnCall;
  const result = await runMvp009IsolatedSmoke({
    ...normalPaths,
    command: 'D:\\build\\g-maiden.exe',
    requireProfileSnapshot: false,
    spawnCommand: (command, args, options) => {
      spawnCall = { command, args, options };
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('close', 0, null));
      return child;
    },
  });

  assert.deepEqual(spawnCall.args, ['--mvp009-isolated-smoke']);
  assert.equal(spawnCall.options.env.WEBVIEW2_USER_DATA_FOLDER, result.webview2UserDataDirectory);
  assert.equal(result.normalSettingsSnapshotVerified, false);
  rmSync(result.runRoot, { recursive: true, force: true });
});

test('refuses to spawn when the temp parent overlaps normal LOCALAPPDATA', async () => {
  let spawned = false;
  await assert.rejects(
    runMvp009IsolatedSmoke({
      ...normalPaths,
      tempParent: process.env.LOCALAPPDATA,
      command: 'D:\\build\\g-maiden.exe',
      readNormalAffectedSettings: safeReader(),
      spawnCommand: () => { spawned = true; },
    }),
    /overlaps the normal Windows user profile|overlaps normal LOCALAPPDATA/,
  );
  assert.equal(spawned, false);
});

test('rejects a profile projection that contains credential fields before spawning', async () => {
  let spawned = false;
  const reader = async () => ({
    'gm-settings': { masterApiKey: 'redacted-test-only' },
    'gm-deck-audio-rail': null,
  });
  reader.supportedReadOnlyKeyScoped = true;
  await assert.rejects(
    runMvp009IsolatedSmoke({
      ...normalPaths,
      command: 'D:\\build\\g-maiden.exe',
      readNormalAffectedSettings: reader,
      spawnCommand: () => { spawned = true; },
    }),
    /unsupported field/,
  );
  assert.equal(spawned, false);
});

test('fails the run if the two-key normal-profile projection changes during smoke', async () => {
  let reads = 0;
  let spawned = false;
  let runRoot;
  const reader = async () => {
    reads += 1;
    return {
      'gm-settings': { volume: reads === 1 ? 80 : 81 },
      'gm-deck-audio-rail': null,
    };
  };
  reader.supportedReadOnlyKeyScoped = true;
  await assert.rejects(
    runMvp009IsolatedSmoke({
      ...normalPaths,
      command: 'D:\\build\\g-maiden.exe',
      readNormalAffectedSettings: reader,
      spawnCommand: (_command, _args, options) => {
        spawned = true;
        runRoot = path.dirname(options.env.TEMP);
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('close', 0, null));
        return child;
      },
    }),
    /normal-profile affected settings changed/,
  );
  assert.equal(spawned, true);
  assert.equal(reads, 2);
  assert.match(runRoot, /^d:\\gmaiden-mvp009-[0-9a-f-]+$/);
  rmSync(runRoot, { recursive: true, force: true });
});
