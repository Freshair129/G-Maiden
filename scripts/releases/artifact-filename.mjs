const WINDOWS_INVALID_FILENAME_CHARS = /[\u0000-\u001f<>:"/\\|?*]/;
const WINDOWS_RESERVED_DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|COM[1-9¹²³]|LPT[1-9¹²³])$/i;

export function isValidWindowsArtifactBasename(filename) {
  if (
    typeof filename !== 'string' ||
    !filename ||
    filename === '.' ||
    filename === '..' ||
    WINDOWS_INVALID_FILENAME_CHARS.test(filename) ||
    /[. ]$/.test(filename)
  ) {
    return false;
  }

  const deviceName = filename.split('.')[0].replace(/[ .]+$/, '');
  return !WINDOWS_RESERVED_DEVICE_NAME.test(deviceName);
}
