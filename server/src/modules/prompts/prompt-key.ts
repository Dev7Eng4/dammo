import type { PromptLanguage } from './prompts.types.js';
import { promptsRepository } from './prompts.repository.js';

export function derivePromptKeyFromName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 80);

  return base || 'new_prompt';
}

export function resolveUniquePromptKey(
  name: string,
  language: PromptLanguage,
  excludeId?: string,
): string {
  const base = derivePromptKeyFromName(name);
  let candidate = base;
  let index = 2;

  while (true) {
    const existing = promptsRepository.findByKeyAndLanguage(candidate, language);
    if (!existing || existing.id === excludeId) {
      return candidate;
    }
    candidate = `${base}_${index}`;
    index += 1;
  }
}
