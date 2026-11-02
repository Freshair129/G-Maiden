import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';

const win = path.win32;

function normalized(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty path`);
  }
  return win.resolve(value).replace(/[\\/]+$/, '').toLowerCase();
}

function contains(parent, child) {
  const relative = win.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${win.sep}`) && !win.isAbsolute(relative);
}

function overlaps(left, right) {
  return left === right || contains(left, right) || contains(right, left);
}

function requireStrictChild(child, root, label) {
  if (!contains(root, child)) {
    throw new Error(`${label} must be strictly inside the isolated run root`);
  }
}

/** Resolve and fail closed unless persisted stores are isolated from the normal profile. */
export function resolveMvp009Isolation({ runRoot, normalLocalAppData, normalUserProfile }) {
  const root = normalized(runRoot, 'runRoot');
  const profile = normalized(normalUserProfile, 'normalUserProfile');
  const normalLocal = normalized(normalLocalAppData, 'normalLocalAppData');

  const isolatedLocalAppData = win.join(root, 'native-local-app-data');
  const nativeSettings = win.join(isolatedLocalAppData, 'G-Maiden', 'settings.json');
  const webviewData = win.join(root, 'webview2-user-data');
  const packageDataRoot = win.join(root, 'package-data');
  const normalSettings = win.join(normalLocal, 'G-Maiden', 'settings.json');
  const normalWebviewData = win.join(normalLocal, 'com.gmaiden.app', 'EBWebView');

  const isolated = [
    ['isolated LOCALAPPDATA', normalized(isolatedLocalAppData, 'isolatedLocalAppData')],
    ['native settings file', normalized(nativeSettings, 'nativeSettings')],
    ['WebView2 user-data directory', normalized(webviewData, 'webviewData')],
    ['package data root', normalized(packageDataRoot, 'packageDataRoot')],
  ];

  for (const [label, candidate] of isolated) {
    requireStrictChild(candidate, root, label);
    if (overlaps(candidate, profile)) {
      throw new Error(`${label} overlaps the normal Windows user profile`);
    }
    if (overlaps(candidate, normalLocal)) {
      throw new Error(`${label} overlaps normal LOCALAPPDATA`);
    }
  }

  if (overlaps(root, profile) || overlaps(root, normalLocal)) {
    throw new Error('isolated run root overlaps the normal Windows user profile');
  }
  if (overlaps(normalized(nativeSettings, 'nativeSettings'), normalized(webviewData, 'webviewData'))) {
    throw new Error('native settings and WebView2 data must use separate stores');
  }
  if (overlaps(normalized(nativeSettings, 'nativeSettings'), normalized(normalSettings, 'normalSettings'))) {
    throw new Error('native settings path overlaps the normal settings file');
  }
  if (overlaps(normalized(webviewData, 'webviewData'), normalized(normalWebviewData, 'normalWebviewData'))) {
    throw new Error('WebView2 data path overlaps the normal WebView2 profile');
  }

  return Object.freeze({
    runRoot: root,
    environment: Object.freeze({
      LOCALAPPDATA: win.join(root, 'native-local-app-data'),
      WEBVIEW2_USER_DATA_FOLDER: win.join(root, 'webview2-user-data'),
      GMAIDEN_PACKAGE_DATA_ROOT: packageDataRoot,
    }),
    nativeSettingsFile: nativeSettings,
    webview2UserDataDirectory: webviewData,
    normalSettingsFile: normalSettings,
    normalWebview2UserDataDirectory: normalWebviewData,
  });
}

/** Build child-process environment overrides using a fresh, isolated run root. */
export function createMvp009IsolatedLaunch({ tempParent, normalLocalAppData, normalUserProfile, baseEnvironment = {} }) {
  const canonicalDirectory = (value, label) => {
    const candidate = win.resolve(value);
    if (!fs.statSync(candidate).isDirectory()) throw new Error(`${label} must be an existing directory`);
    return fs.realpathSync.native(candidate);
  };
  const parent = canonicalDirectory(tempParent, 'tempParent');
  const normalLocal = canonicalDirectory(normalLocalAppData, 'normalLocalAppData');
  const profile = canonicalDirectory(normalUserProfile, 'normalUserProfile');
  let runRoot;
  do {
    runRoot = win.join(parent, `gmaiden-mvp009-${randomUUID()}`);
  } while (fs.existsSync(runRoot));
  const paths = resolveMvp009Isolation({
    runRoot,
    normalLocalAppData: normalLocal,
    normalUserProfile: profile,
  });
  const inheritedProcessEnvironment = {};
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']) {
    const actualKey = Object.keys(baseEnvironment).find((name) => name.toLowerCase() === key.toLowerCase());
    if (actualKey && typeof baseEnvironment[actualKey] === 'string') {
      inheritedProcessEnvironment[actualKey] = baseEnvironment[actualKey];
    }
  }
  const isolatedTemp = win.join(paths.runRoot, 'temp');
  return Object.freeze({
    ...paths,
    tempParent: parent,
    childEnvironment: Object.freeze({
      ...inheritedProcessEnvironment,
      TEMP: isolatedTemp,
      TMP: isolatedTemp,
      ...paths.environment,
      MVP009_ISOLATION_ROOT: paths.runRoot,
      MVP009_TEMP_PARENT: parent,
      MVP009_NORMAL_USER_PROFILE: profile,
      MVP009_NORMAL_LOCALAPPDATA: normalLocal,
    }),
  });
}
