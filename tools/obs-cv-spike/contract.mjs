const KNOWN_SOURCE_TYPES = new Set(['game_capture', 'desktop_capture', 'webcam']);
const GAME_PROCESS = 'dota2.exe';
const OBS_VIRTUAL_CAMERA = 'obs_virtual_camera';
const GAME_CAPTURE = 'game_capture';
const FLOAT_EPSILON = 1e-9;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function hasValidDimensions(value) {
  return isRecord(value) && isPositiveInteger(value.width) && isPositiveInteger(value.height);
}

function isNonNegativeFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function classifyObsFrameSource(descriptor) {
  if (!isRecord(descriptor) || descriptor.transport !== OBS_VIRTUAL_CAMERA) {
    return { eligible: false, reason: 'unsupported_transport' };
  }

  if (!KNOWN_SOURCE_TYPES.has(descriptor.sourceType)) {
    return { eligible: false, reason: 'unknown_source_type' };
  }
  if (descriptor.sourceType !== GAME_CAPTURE) {
    return { eligible: false, reason: 'non_game_source' };
  }
  if (typeof descriptor.targetProcessName !== 'string'
    || descriptor.targetProcessName.trim().toLowerCase() !== GAME_PROCESS) {
    return { eligible: false, reason: 'target_process_not_dota' };
  }

  const visibleTypes = descriptor.visibleSceneSourceTypes;
  if (!Array.isArray(visibleTypes) || visibleTypes.length === 0) {
    return { eligible: false, reason: 'scene_composition_unverified' };
  }
  if (visibleTypes.some((type) => !KNOWN_SOURCE_TYPES.has(type))) {
    return { eligible: false, reason: 'unknown_scene_source_type' };
  }
  if (visibleTypes.some((type) => type !== GAME_CAPTURE)) {
    return { eligible: false, reason: 'scene_not_game_only' };
  }

  return { eligible: true, reason: 'game_only' };
}

export function fitAspectViewport(source, target) {
  if (!hasValidDimensions(source) || !hasValidDimensions(target)) return null;

  const scale = Math.min(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  if (![scale, width, height].every(Number.isFinite) || scale <= 0 || width <= 0 || height <= 0) {
    return null;
  }

  return {
    x: (target.width - width) / 2,
    y: (target.height - height) / 2,
    width,
    height,
    scale,
  };
}

function hasValidTargetRoi(roi, target) {
  return isRecord(roi)
    && Number.isSafeInteger(roi.x)
    && Number.isSafeInteger(roi.y)
    && isPositiveInteger(roi.width)
    && isPositiveInteger(roi.height)
    && roi.x >= 0
    && roi.y >= 0
    && roi.x + roi.width <= target.width
    && roi.y + roi.height <= target.height;
}

export function mapTargetRoiToSource(roi, source, target) {
  if (!hasValidDimensions(source)
    || !hasValidDimensions(target)
    || !hasValidTargetRoi(roi, target)) {
    return null;
  }

  const viewport = fitAspectViewport(source, target);
  if (!viewport) return null;

  const targetRight = roi.x + roi.width;
  const targetBottom = roi.y + roi.height;
  if (roi.x < viewport.x - FLOAT_EPSILON
    || roi.y < viewport.y - FLOAT_EPSILON
    || targetRight > viewport.x + viewport.width + FLOAT_EPSILON
    || targetBottom > viewport.y + viewport.height + FLOAT_EPSILON) {
    return null;
  }

  const sourceLeft = (roi.x - viewport.x) / viewport.scale;
  const sourceTop = (roi.y - viewport.y) / viewport.scale;
  const sourceRight = (targetRight - viewport.x) / viewport.scale;
  const sourceBottom = (targetBottom - viewport.y) / viewport.scale;
  if (![sourceLeft, sourceTop, sourceRight, sourceBottom].every(Number.isFinite)) return null;

  const x = Math.max(0, Math.floor(sourceLeft));
  const y = Math.max(0, Math.floor(sourceTop));
  const right = Math.min(source.width, Math.ceil(sourceRight));
  const bottom = Math.min(source.height, Math.ceil(sourceBottom));
  if (right <= x || bottom <= y) return null;

  return { x, y, width: right - x, height: bottom - y };
}

export function makeFrameReceipt({ receivedAtMonotonicMs, sourceTimestamp = null } = {}) {
  if (!isNonNegativeFinite(receivedAtMonotonicMs)) return null;

  const validSourceTimestamp = isRecord(sourceTimestamp)
    && isNonNegativeFinite(sourceTimestamp.value)
    && typeof sourceTimestamp.clockDomain === 'string'
    && sourceTimestamp.clockDomain.trim().length > 0;

  return {
    receivedAtMonotonicMs,
    sourceTimestamp: validSourceTimestamp
      ? { value: sourceTimestamp.value, clockDomain: sourceTimestamp.clockDomain }
      : null,
  };
}

export function assessFrameFreshness({ source, frame, receipt, nowMonotonicMs, maxAgeMs } = {}) {
  if (!classifyObsFrameSource(source).eligible) {
    return { status: 'unavailable', reason: 'source_not_eligible', ageMs: null };
  }
  if (frame === null || frame === undefined) {
    return { status: 'unavailable', reason: 'frame_lost', ageMs: null };
  }
  if (!hasValidDimensions(frame)) {
    return { status: 'unavailable', reason: 'frame_geometry_invalid', ageMs: null };
  }
  if (!isRecord(receipt) || !isNonNegativeFinite(receipt.receivedAtMonotonicMs)) {
    return { status: 'unavailable', reason: 'receipt_time_missing', ageMs: null };
  }
  if (!isNonNegativeFinite(nowMonotonicMs) || !isNonNegativeFinite(maxAgeMs)) {
    return { status: 'unavailable', reason: 'freshness_clock_invalid', ageMs: null };
  }

  const ageMs = nowMonotonicMs - receipt.receivedAtMonotonicMs;
  if (ageMs < 0) {
    return { status: 'unavailable', reason: 'receipt_time_from_future', ageMs: null };
  }
  if (ageMs > maxAgeMs) {
    return { status: 'stale', reason: 'frame_stale', ageMs };
  }

  return { status: 'ready', reason: null, ageMs };
}
