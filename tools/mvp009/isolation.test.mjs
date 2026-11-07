import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMvp009IsolatedLaunch, resolveMvp009Isolation } from './isolation.mjs';

const normal = {
  normalLocalAppData: 'C:\\Users\\player\\AppData\\Local',
  normalUserProfile: 'C:\\Users\\player',
};

test('resolves native settings and WebView2 stores under a separate run root', () => {
  const result = resolveMvp009Isolation({ runRoot: 'D:\\gm-test\\run-001', ...normal });

  assert.equal(result.environment.LOCALAPPDATA, 'd:\\gm-test\\run-001\\native-local-app-data');
  assert.equal(result.nativeSettingsFile, 'd:\\gm-test\\run-001\\native-local-app-data\\G-Maiden\\settings.json');
  assert.equal(result.environment.WEBVIEW2_USER_DATA_FOLDER, 'd:\\gm-test\\run-001\\webview2-user-data');
  assert.equal(result.webview2UserDataDirectory, result.environment.WEBVIEW2_USER_DATA_FOLDER);
});

test('assigns isolated stores to a unique child-process environment', () => {
  const args = {
    tempParent: 'D:\\',
    normalLocalAppData: process.env.LOCALAPPDATA,
    normalUserProfile: process.env.USERPROFILE,
    baseEnvironment: { PATH: 'unchanged', API_KEY: 'never-forward', USERPROFILE: 'C:\\Users\\player' },
  };
  const first = createMvp009IsolatedLaunch(args);
  const second = createMvp009IsolatedLaunch(args);

  assert.notEqual(first.runRoot, second.runRoot);
  assert.equal(first.childEnvironment.PATH, 'unchanged');
  assert.equal(first.childEnvironment.API_KEY, undefined);
  assert.equal(first.childEnvironment.USERPROFILE, undefined);
  assert.equal(first.childEnvironment.TEMP, `${first.runRoot}\\temp`);
  assert.equal(first.childEnvironment.TMP, `${first.runRoot}\\temp`);
  assert.equal(first.childEnvironment.LOCALAPPDATA, first.environment.LOCALAPPDATA);
  assert.equal(first.childEnvironment.WEBVIEW2_USER_DATA_FOLDER, first.webview2UserDataDirectory);
  assert.equal(first.childEnvironment.MVP009_ISOLATION_ROOT, first.runRoot);
  assert.equal(first.childEnvironment.MVP009_TEMP_PARENT.toLowerCase(), 'd:\\');
  assert.equal(first.childEnvironment.MVP009_NORMAL_USER_PROFILE.toLowerCase(), process.env.USERPROFILE.toLowerCase());
  assert.equal(first.childEnvironment.MVP009_NORMAL_LOCALAPPDATA.toLowerCase(), process.env.LOCALAPPDATA.toLowerCase());
  assert.ok(first.nativeSettingsFile.startsWith(`${first.runRoot}\\`));
  assert.ok(first.webview2UserDataDirectory.startsWith(`${first.runRoot}\\`));
});

test('keeps package installer writes under the isolated run root', () => {
  const launch = createMvp009IsolatedLaunch({
    tempParent: 'D:\\',
    normalLocalAppData: process.env.LOCALAPPDATA,
    normalUserProfile: process.env.USERPROFILE,
    baseEnvironment: {
      GMAIDEN_PACKAGE_DATA_ROOT: `${process.env.LOCALAPPDATA}\\G-Maiden\\packages`,
    },
  });

  assert.equal(
    launch.childEnvironment.GMAIDEN_PACKAGE_DATA_ROOT,
    `${launch.runRoot}\\package-data`,
  );
});

test('fails closed when the run root is inside the normal Windows profile', () => {
  assert.throws(
    () => resolveMvp009Isolation({ runRoot: 'C:\\Users\\player\\AppData\\Local\\Temp\\gm-test', ...normal }),
    /overlaps the normal Windows user profile/,
  );
});

test('fails closed when either requested store resolves to a normal profile path', () => {
  assert.throws(
    () => resolveMvp009Isolation({ runRoot: 'D:\\gm-test\\run-002', ...normal, normalLocalAppData: 'D:\\gm-test\\run-002\\native-local-app-data' }),
    /overlaps normal LOCALAPPDATA/,
  );
});

test('rejects a run root nested beneath the normal WebView2 profile', () => {
  assert.throws(
    () => resolveMvp009Isolation({ runRoot: 'C:\\Users\\player\\AppData\\Local\\com.gmaiden.app\\EBWebView\\test-child', ...normal }),
    /overlaps the normal Windows user profile/,
  );
});
