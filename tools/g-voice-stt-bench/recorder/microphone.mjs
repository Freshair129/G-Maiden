export function labelCapturedMicrophone(track, devices) {
  const deviceId = track?.getSettings?.().deviceId;
  const inputs = devices.filter((device) => device.kind === 'audioinput');
  const matched = inputs.find((device) => deviceId && device.deviceId === deviceId)
    ?? inputs.find((device) => track?.label && device.label === track.label);
  return matched?.label || track?.label || 'Browser did not expose the microphone label';
}
