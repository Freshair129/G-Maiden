import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_NORMALIZATION_PATH = join(HERE, 'normalization.json');

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function assertNormalizationConfig(config) {
  if (config?.version !== 1 || config.unicode_form !== 'NFC' || typeof config.lowercase !== 'boolean'
    || !Array.isArray(config.remove_characters) || typeof config.collapse_whitespace !== 'boolean'
    || !Array.isArray(config.strip_unicode_categories) || typeof config.trim !== 'boolean') {
    throw new Error('normalization.json does not match the frozen version 1 schema');
  }
  if (!config.remove_characters.every((character) => typeof character === 'string' && character.length > 0)) {
    throw new Error('normalization.json remove_characters must contain non-empty strings');
  }
  if (!config.strip_unicode_categories.every((category) => category === 'P' || category === 'S')) {
    throw new Error('normalization.json strip_unicode_categories only supports P and S');
  }
}

export function loadNormalizationConfig(configPath = DEFAULT_NORMALIZATION_PATH) {
  const absolutePath = resolve(configPath);
  const raw = readFileSync(absolutePath);
  const config = JSON.parse(raw.toString('utf8'));
  assertNormalizationConfig(config);
  return Object.freeze({
    path: absolutePath,
    sha256: createHash('sha256').update(raw).digest('hex'),
    config: deepFreeze(config),
  });
}

function escapedCharacterClass(characters) {
  return characters.map((character) => character.replace(/[\\\]^-]/gu, '\\$&')).join('');
}

export function normalizeText(value, config = loadNormalizationConfig().config) {
  let normalized = String(value).normalize(config.unicode_form);
  if (config.remove_characters.length > 0) {
    normalized = normalized.replace(new RegExp(`[${escapedCharacterClass(config.remove_characters)}]`, 'gu'), '');
  }
  if (config.strip_unicode_categories.length > 0) {
    const categories = config.strip_unicode_categories.map((category) => `\\p{${category}}`).join('');
    normalized = normalized.replace(new RegExp(`[${categories}]`, 'gu'), '');
  }
  if (config.lowercase) normalized = normalized.toLowerCase();
  if (config.collapse_whitespace) normalized = normalized.replace(/\s+/gu, ' ');
  return config.trim ? normalized.trim() : normalized;
}

export function segmentGraphemes(value) {
  const text = String(value);
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
}

export function levenshtein(referenceUnits, hypothesisUnits) {
  let previous = Array.from({ length: hypothesisUnits.length + 1 }, (_, index) => index);
  for (let referenceIndex = 1; referenceIndex <= referenceUnits.length; referenceIndex += 1) {
    const current = [referenceIndex];
    for (let hypothesisIndex = 1; hypothesisIndex <= hypothesisUnits.length; hypothesisIndex += 1) {
      const substitution = previous[hypothesisIndex - 1]
        + (referenceUnits[referenceIndex - 1] === hypothesisUnits[hypothesisIndex - 1] ? 0 : 1);
      current[hypothesisIndex] = Math.min(
        previous[hypothesisIndex] + 1,
        current[hypothesisIndex - 1] + 1,
        substitution,
      );
    }
    previous = current;
  }
  return previous[hypothesisUnits.length];
}

function scoreUnits(referenceUnits, hypothesisUnits) {
  const errors = levenshtein(referenceUnits, hypothesisUnits);
  const referenceUnitsCount = referenceUnits.length;
  return {
    errors,
    reference_units: referenceUnitsCount,
    rate: referenceUnitsCount === 0 ? null : errors / referenceUnitsCount,
  };
}

export function scoreWer(reference, hypothesis, config = loadNormalizationConfig().config) {
  const referenceText = normalizeText(reference, config);
  const hypothesisText = normalizeText(hypothesis, config);
  const referenceWords = referenceText === '' ? [] : referenceText.split(' ');
  const hypothesisWords = hypothesisText === '' ? [] : hypothesisText.split(' ');
  return scoreUnits(referenceWords, hypothesisWords);
}

export function scoreCer(reference, hypothesis, config = loadNormalizationConfig().config) {
  return scoreUnits(
    segmentGraphemes(normalizeText(reference, config).replace(/\s+/gu, '')),
    segmentGraphemes(normalizeText(hypothesis, config).replace(/\s+/gu, '')),
  );
}

export function metricForLanguage(language) {
  return language === 'en' ? 'wer' : 'cer';
}

export function scoreTranscript({ reference, hypothesis, language, config = loadNormalizationConfig().config }) {
  const metric = metricForLanguage(language);
  return {
    metric,
    ...(metric === 'cer' ? scoreCer(reference, hypothesis, config) : scoreWer(reference, hypothesis, config)),
  };
}
