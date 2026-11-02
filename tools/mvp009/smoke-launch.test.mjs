import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { runMvp009IsolatedSmoke } from './smoke-launch.mjs';

const normalPaths = {
  tempParent: 'D:\\',
  normalLocalAppData: 'D:\\normal-local-app-data',
  normalUserProfile: 'D:\\normal-user-profile',
  baseEnvironment: {
    PATH: 'system-path',
    SystemRoot: 'C:\\Windows',
    LOCALAPPDATA: 'C:\\Users\\player\\AppData\\Local',
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

function isolatedProfileFixture() {
  const driveRoot = path.win32.parse(process.cwd()).root;
  const root = mkdtempSync(path.win32.join(driveRoot, 'mvp009-profile-snapshot-'));
  const tempParent = mkdtempSync(path.win32.join(driveRoot, 'mvp009-smoke-temp-parent-'));
  const normalLocalAppData = path.win32.join(root, 'local-app-data');
  const normalUserProfile = path.win32.join(root, 'user-profile');
  mkdirSync(normalLocalAppData, { recursive: true });
  mkdirSync(normalUserProfile, { recursive: true });
  return {
    ...normalPaths,
    root,
    tempParent,
    normalLocalAppData,
    normalUserProfile,
  };
}

function removeSmokeArtifacts(fixture, runRoot) {
  const resolvedRunRoot = typeof runRoot === 'string' ? path.win32.resolve(runRoot) : null;
  const resolvedTempParent = typeof fixture.tempParent === 'string'
    ? path.win32.resolve(fixture.tempParent)
    : null;
  const isOwnedRunRoot = resolvedRunRoot !== null
    && resolvedTempParent !== null
    && path.win32.dirname(resolvedRunRoot).toLowerCase() === resolvedTempParent.toLowerCase()
    && /^gmaiden-mvp009-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      path.win32.basename(resolvedRunRoot),
    );
  if (isOwnedRunRoot) rmSync(resolvedRunRoot, { recursive: true, force: true });
  if (fixture.root) rmSync(fixture.root, { recursive: true, force: true });
  if (fixture.tempParent) {
    try {
      rmdirSync(fixture.tempParent);
    } catch (error) {
      if (!['ENOTEMPTY', 'EEXIST', 'ENOENT'].includes(error?.code)) throw error;
    }
  }
}

test('smoke test cleanup preserves a sentinel outside its owned temp parent', () => {
  const fixture = isolatedProfileFixture();
  const outsideParent = mkdtempSync(path.win32.join(path.win32.parse(process.cwd()).root, 'mvp009-outside-cleanup-'));
  const outsideRunRoot = path.win32.join(outsideParent, 'gmaiden-mvp009-11111111-2222-4333-8444-555555555555');
  const sentinel = path.win32.join(outsideRunRoot, 'sentinel.txt');
  mkdirSync(outsideRunRoot, { recursive: true });
  writeFileSync(sentinel, 'fixture sentinel');
  try {
    removeSmokeArtifacts(fixture, outsideRunRoot);
    assert.equal(existsSync(sentinel), true);
  } finally {
    rmSync(outsideParent, { recursive: true, force: true });
    removeSmokeArtifacts(fixture);
  }
});

test('smoke test cleanup preserves a sentinel under an unrecognized child name', () => {
  const fixture = isolatedProfileFixture();
  const unrecognizedRunRoot = path.win32.join(fixture.tempParent, 'mvp009-unrecognized-child');
  const sentinel = path.win32.join(unrecognizedRunRoot, 'sentinel.txt');
  mkdirSync(unrecognizedRunRoot, { recursive: true });
  writeFileSync(sentinel, 'fixture sentinel');
  try {
    removeSmokeArtifacts(fixture, unrecognizedRunRoot);
    assert.equal(existsSync(sentinel), true);
  } finally {
    rmSync(unrecognizedRunRoot, { recursive: true, force: true });
    removeSmokeArtifacts(fixture);
  }
});

test('smoke launcher passes only isolated storage paths to the executable', async () => {
  const fixture = isolatedProfileFixture();
  let spawnCall;
  let runRoot;
  try {
    const result = await runMvp009IsolatedSmoke({
      ...fixture,
      command: 'D:\\build\\g-maiden.exe',
      args: ['--smoke'],
      readNormalAffectedSettings: safeReader(),
      spawnCommand: (command, args, options) => {
        spawnCall = { command, args, options };
        runRoot = path.win32.dirname(options.env.TEMP);
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
    assert.equal(spawnCall.options.env.MVP009_NORMAL_USER_PROFILE.toLowerCase(), fixture.normalUserProfile.toLowerCase());
    assert.equal(spawnCall.options.env.MVP009_NORMAL_LOCALAPPDATA.toLowerCase(), fixture.normalLocalAppData.toLowerCase());
    assert.equal(spawnCall.options.env.API_KEY, undefined);
    assert.equal(spawnCall.options.env.USERPROFILE, undefined);
    assert.equal(existsSync(spawnCall.options.env.TEMP), true);
    assert.ok(result.nativeSettingsFile.startsWith(`${result.runRoot}\\`));
    assert.ok(result.webview2UserDataDirectory.startsWith(`${result.runRoot}\\`));
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.normalSettingsSnapshot, {
      localStorage: 'unchanged',
      nativeSettings: 'absent',
    });
    assert.equal(path.win32.dirname(result.runRoot).toLowerCase(), fixture.tempParent.toLowerCase());
    assert.match(
      path.win32.basename(result.runRoot),
      /^gmaiden-mvp009-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  } finally {
    removeSmokeArtifacts(fixture, runRoot);
  }
});

test('injects the localStorage reader with only the affected keys and normal WebView2 profile path', async () => {
  const fixture = isolatedProfileFixture();
  const calls = [];
  const reader = async (keys, sources) => {
    calls.push({ keys, sources });
    return {
      'gm-settings': { volume: 80 },
      'gm-deck-audio-rail': null,
    };
  };
  reader.supportedReadOnlyKeyScoped = true;
  let runRoot;
  try {
    const result = await runMvp009IsolatedSmoke({
      ...fixture,
      command: 'D:\\build\\g-maiden.exe',
      readNormalAffectedSettings: reader,
      spawnCommand: (_command, _args, options) => {
        runRoot = path.win32.dirname(options.env.TEMP);
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('close', 0, null));
        return child;
      },
    });

    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.deepEqual(call.keys, ['gm-settings', 'gm-deck-audio-rail']);
      assert.equal(
        call.sources?.webview2UserDataDirectory.toLowerCase(),
        path.win32.join(fixture.normalLocalAppData, 'com.gmaiden.app', 'EBWebView').toLowerCase(),
      );
    }
    assert.equal(result.normalSettingsSnapshot.localStorage, 'unchanged');
  } finally {
    removeSmokeArtifacts(fixture, runRoot);
  }
});

test('snapshots the native settings mirror without returning its values', async () => {
  const fixture = isolatedProfileFixture();
  const nativeFile = path.win32.join(fixture.normalLocalAppData, 'G-Maiden', 'settings.json');
  const nativeContents = JSON.stringify({ volume: 80, voiceName: 'private-value', masterApiKey: 'secret-marker' });
  mkdirSync(path.win32.dirname(nativeFile), { recursive: true });
  writeFileSync(nativeFile, nativeContents);
  let runRoot;
  try {
    const result = await runMvp009IsolatedSmoke({
      ...fixture,
      command: 'D:\\build\\g-maiden.exe',
      readNormalAffectedSettings: safeReader(),
      spawnCommand: (_command, _args, options) => {
        runRoot = path.win32.dirname(options.env.TEMP);
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('close', 0, null));
        return child;
      },
    });

    assert.deepEqual(result.normalSettingsSnapshot, {
      localStorage: 'unchanged',
      nativeSettings: 'unchanged',
    });
    const output = JSON.stringify(result);
    assert.equal(output.includes('private-value'), false);
    assert.equal(output.includes('secret-marker'), false);
    assert.equal(output.includes(nativeContents), false);
  } finally {
    removeSmokeArtifacts(fixture, runRoot);
  }
});

test('reports the native settings mirror absent when it is absent before and after smoke', async () => {
  const fixture = isolatedProfileFixture();
  let runRoot;
  try {
    const result = await runMvp009IsolatedSmoke({
      ...fixture,
      command: 'D:\\build\\g-maiden.exe',
      readNormalAffectedSettings: safeReader(),
      spawnCommand: (_command, _args, options) => {
        runRoot = path.win32.dirname(options.env.TEMP);
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('close', 0, null));
        return child;
      },
    });
    assert.equal(result.normalSettingsSnapshot.nativeSettings, 'absent');
  } finally {
    removeSmokeArtifacts(fixture, runRoot);
  }
});

test('fails with native settings status changed without exposing either snapshot', async () => {
  const fixture = isolatedProfileFixture();
  const nativeFile = path.win32.join(fixture.normalLocalAppData, 'G-Maiden', 'settings.json');
  const beforeValue = 'before-private-value';
  const afterValue = 'after-private-value';
  mkdirSync(path.win32.dirname(nativeFile), { recursive: true });
  writeFileSync(nativeFile, JSON.stringify({ voiceName: beforeValue }));
  let runRoot;
  try {
    await assert.rejects(
      runMvp009IsolatedSmoke({
        ...fixture,
        command: 'D:\\build\\g-maiden.exe',
        readNormalAffectedSettings: safeReader(),
        spawnCommand: (_command, _args, options) => {
          runRoot = path.win32.dirname(options.env.TEMP);
          writeFileSync(nativeFile, JSON.stringify({ voiceName: afterValue }));
          const child = new EventEmitter();
          queueMicrotask(() => child.emit('close', 0, null));
          return child;
        },
      }),
      (error) => {
        assert.match(error.message, /native settings: changed/);
        assert.equal(error.message.includes(beforeValue), false);
        assert.equal(error.message.includes(afterValue), false);
        return true;
      },
    );
  } finally {
    removeSmokeArtifacts(fixture, runRoot);
  }
});

test('refuses to spawn when no supported key-scoped reader is configured', async () => {
  const fixture = isolatedProfileFixture();
  let spawned = false;
  try {
    await assert.rejects(
      runMvp009IsolatedSmoke({
        ...fixture,
        command: 'D:\\build\\g-maiden.exe',
        spawnCommand: () => { spawned = true; },
      }),
      /localStorage status: unverified.*no supported read-only key-scoped reader is available/,
    );
    assert.equal(spawned, false);
  } finally {
    removeSmokeArtifacts(fixture);
  }
});

test('permits the explicit path-isolation-only smoke mode without a profile reader', async () => {
  const fixture = isolatedProfileFixture();
  let spawnCall;
  let runRoot;
  try {
    const result = await runMvp009IsolatedSmoke({
      ...fixture,
      command: 'D:\\build\\g-maiden.exe',
      requireProfileSnapshot: false,
      spawnCommand: (command, args, options) => {
        spawnCall = { command, args, options };
        runRoot = path.win32.dirname(options.env.TEMP);
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('close', 0, null));
        return child;
      },
    });

    assert.deepEqual(spawnCall.args, ['--mvp009-isolated-smoke']);
    assert.equal(spawnCall.options.env.WEBVIEW2_USER_DATA_FOLDER, result.webview2UserDataDirectory);
    assert.deepEqual(result.normalSettingsSnapshot, {
      localStorage: 'unverified',
      nativeSettings: 'absent',
    });
  } finally {
    removeSmokeArtifacts(fixture, runRoot);
  }
});

test('refuses to spawn when the temp parent overlaps normal LOCALAPPDATA', async () => {
  const fixture = isolatedProfileFixture();
  let spawned = false;
  try {
    await assert.rejects(
      runMvp009IsolatedSmoke({
        ...fixture,
        tempParent: fixture.normalLocalAppData,
        command: 'D:\\build\\g-maiden.exe',
        readNormalAffectedSettings: safeReader(),
        spawnCommand: () => { spawned = true; },
      }),
      /overlaps the normal Windows user profile|overlaps normal LOCALAPPDATA/,
    );
    assert.equal(spawned, false);
  } finally {
    removeSmokeArtifacts(fixture);
  }
});

test('rejects a profile projection that contains credential fields before spawning', async () => {
  const fixture = isolatedProfileFixture();
  let spawned = false;
  const reader = async () => ({
    'gm-settings': { masterApiKey: 'redacted-test-only' },
    'gm-deck-audio-rail': null,
  });
  reader.supportedReadOnlyKeyScoped = true;
  try {
    await assert.rejects(
      runMvp009IsolatedSmoke({
        ...fixture,
        command: 'D:\\build\\g-maiden.exe',
        readNormalAffectedSettings: reader,
        spawnCommand: () => { spawned = true; },
      }),
      /unsupported field/,
    );
    assert.equal(spawned, false);
  } finally {
    removeSmokeArtifacts(fixture);
  }
});

test('fails the run if the two-key normal-profile projection changes during smoke', async () => {
  const fixture = isolatedProfileFixture();
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
      ...fixture,
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
    /normal-profile settings snapshot changed.*localStorage: changed/,
  );
  assert.equal(spawned, true);
  assert.equal(reads, 2);
  assert.equal(path.win32.dirname(runRoot).toLowerCase(), fixture.tempParent.toLowerCase());
  assert.match(
    path.win32.basename(runRoot),
    /^gmaiden-mvp009-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  removeSmokeArtifacts(fixture, runRoot);
});
