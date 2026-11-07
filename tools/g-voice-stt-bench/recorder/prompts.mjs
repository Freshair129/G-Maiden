export const INTENTS = Object.freeze([
  'enemy_location', 'item_advice', 'skill_advice', 'objective_timing',
  'own_status', 'matchup_advice', 'repeat', 'cancel',
]);

export const SLOT_KEYS = new Set(['hero', 'lane', 'item', 'objective', 'stat']);

const LANGUAGES = new Set(['th', 'en', 'code-switch']);
const SLOT_REQUIREMENTS = {
  enemy_location: new Set(['hero', 'lane']),
  item_advice: new Set(['item']),
  skill_advice: new Set(),
  objective_timing: new Set(['objective']),
  own_status: new Set(['stat']),
  matchup_advice: new Set(['hero']),
  repeat: new Set(),
  cancel: new Set(),
};
const ENUM_SLOT_VALUES = {
  lane: new Set(['mid', 'top', 'bot']),
  objective: new Set(['roshan', 'rune', 'tormentor', 'outpost']),
  stat: new Set(['gold', 'net_worth', 'level', 'kda']),
};

function text(value, name) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${name} must be non-empty text`);
  return value.trim();
}

export function validatePromptSet(promptSet) {
  if (!promptSet || typeof promptSet !== 'object' || Array.isArray(promptSet)) throw new Error('prompt file must be an object');
  if (!LANGUAGES.has(promptSet.language)) throw new Error('prompt file has an unsupported language');
  if (!Array.isArray(promptSet.prompts) || promptSet.prompts.length === 0) throw new Error('prompt file must contain prompts');
  const ids = new Set();
  return promptSet.prompts.map((prompt, index) => {
    if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) throw new Error(`prompt ${index} must be an object`);
    const id = text(prompt.id, `prompt ${index} id`);
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(id)) throw new Error(`prompt ${id} has an unsafe id`);
    if (ids.has(id)) throw new Error(`prompt file has a duplicate id: ${id}`);
    ids.add(id);
    const intent = text(prompt.intent, `prompt ${id} intent`);
    if (!INTENTS.includes(intent)) throw new Error(`prompt ${id} has an unsupported intent`);
    const slots = prompt.slots ?? {};
    if (!slots || typeof slots !== 'object' || Array.isArray(slots)) throw new Error(`prompt ${id} slots must be an object`);
    const expectedSlots = SLOT_REQUIREMENTS[intent];
    const slotNames = Object.keys(slots);
    for (const name of slotNames) {
      if (!SLOT_KEYS.has(name) || !expectedSlots.has(name)) throw new Error(`prompt ${id} has an unsupported slot ${name}`);
      const value = text(slots[name], `prompt ${id} slot ${name}`);
      if (value !== value.toLowerCase() || !/^[a-z0-9_]+$/.test(value)) throw new Error(`prompt ${id} slot ${name} must be lowercase canonical English`);
      if (ENUM_SLOT_VALUES[name] && !ENUM_SLOT_VALUES[name].has(value)) throw new Error(`prompt ${id} slot ${name} must use a canonical inventory value`);
    }
    if (expectedSlots.size === 0 && slotNames.length !== 0) throw new Error(`prompt ${id} must not have slots`);
    if (expectedSlots.size > 0 && slotNames.length === 0) throw new Error(`prompt ${id} is missing its critical slot`);
    return {
      id,
      language: promptSet.language,
      reference: text(prompt.reference, `prompt ${id} reference`),
      intent,
      slots: { ...slots },
    };
  });
}

export function parsePromptText(textValue) {
  try {
    return validatePromptSet(JSON.parse(textValue));
  } catch (error) {
    throw new Error(`invalid prompt file: ${error.message}`);
  }
}

export async function loadPromptFiles(handles) {
  if (!Array.isArray(handles) || handles.length !== 3) throw new Error('choose the three shipped prompt JSON files');
  const sets = await Promise.all(handles.map(async (handle) => {
    const file = typeof handle.getFile === 'function' ? await handle.getFile() : handle;
    return parsePromptText(await file.text());
  }));
  const byLanguage = new Map();
  for (const prompts of sets) {
    const language = prompts[0].language;
    if (byLanguage.has(language)) throw new Error(`duplicate ${language} prompt file`);
    byLanguage.set(language, prompts);
  }
  if (byLanguage.size !== 3 || ![...LANGUAGES].every((language) => byLanguage.has(language))) {
    throw new Error('prompt files must include th, en, and code-switch');
  }
  return byLanguage;
}
