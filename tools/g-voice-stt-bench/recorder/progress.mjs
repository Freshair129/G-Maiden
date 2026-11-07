export function coveredPromptCount(prompts, entries, language, condition) {
  return prompts
    .filter((prompt) => prompt.language === language)
    .filter((prompt) => entries.some((entry) => entry.language === language
      && entry.condition === condition
      && entry.id.startsWith(`${language}-${prompt.id}-${condition}-`))).length;
}
