const LANGUAGES = new Set(['th', 'en', 'code-switch']);
const CONDITIONS = new Set(['quiet', 'game-audio']);
const SPLITS = new Set(['tuning', 'holdout']);
const SAFE_ID_PART = /^[a-z0-9][a-z0-9_-]*$/;

function required(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} is required`);
  return value.trim();
}

function idPart(value, name) {
  const part = required(value, name);
  if (!SAFE_ID_PART.test(part)) throw new Error(`${name} must use lowercase letters, digits, hyphens, or underscores`);
  return part;
}

export function makeRecordingId({ language, promptId, condition, session }) {
  if (!LANGUAGES.has(language)) throw new Error('language is unsupported');
  if (!CONDITIONS.has(condition)) throw new Error('condition is unsupported');
  return `${language}-${idPart(promptId, 'prompt id')}-${condition}-${idPart(session, 'session id')}`;
}

export function createManifestEntry({
  prompt, condition, speaker, session, split, mic, gameAudioNote, recordedAt,
}) {
  if (!prompt || typeof prompt !== 'object') throw new Error('prompt is required');
  const language = required(prompt.language, 'prompt language');
  if (!LANGUAGES.has(language)) throw new Error('prompt language is unsupported');
  if (!CONDITIONS.has(condition)) throw new Error('condition is unsupported');
  if (!SPLITS.has(split)) throw new Error('split is unsupported');
  const id = makeRecordingId({ language, promptId: prompt.id, condition, session });
  const entry = {
    id,
    language,
    condition,
    speaker: required(speaker, 'speaker pseudonym'),
    session: idPart(session, 'session id'),
    split,
    reference: required(prompt.reference, 'prompt reference'),
    intent: required(prompt.intent, 'prompt intent'),
    slots: prompt.slots ?? {},
    wav: `${id}.wav`,
  };
  if (typeof mic === 'string' && mic.trim() !== '') entry.mic = mic.trim();
  if (typeof gameAudioNote === 'string' && gameAudioNote.trim() !== '') entry.game_audio_note = gameAudioNote.trim();
  if (typeof recordedAt === 'string' && recordedAt.trim() !== '') entry.recorded_at = recordedAt;
  return entry;
}

export function upsertManifest(manifest, entry) {
  if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') throw new Error('manifest entry must include an id');
  if (manifest !== undefined && (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))) {
    throw new Error('existing manifest must be an object');
  }
  const priorEntries = manifest?.utterances ?? [];
  if (!Array.isArray(priorEntries)) throw new Error('existing manifest utterances must be an array');
  const position = priorEntries.findIndex((existing) => existing?.id === entry.id);
  const utterances = priorEntries.slice();
  if (position === -1) utterances.push(entry);
  else utterances[position] = entry;
  return { ...manifest, schema_version: manifest?.schema_version ?? 1, utterances };
}
