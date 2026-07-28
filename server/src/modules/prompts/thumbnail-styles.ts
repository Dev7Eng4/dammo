import { AppError } from '../../shared/http/errors.js';
import type { ChannelLanguage } from '../youtube-channels/channel-language.js';
import { promptsRepository } from './prompts.repository.js';
import type { PromptLanguage } from './prompts.types.js';

export interface ThumbnailStyleOption {
  key: string;
  name: string;
  useChannelBackgroundImage: boolean;
}

const STEP_SUFFIX_PATTERN = /_step_\d+$/;

function toPromptLanguage(language: ChannelLanguage | PromptLanguage): PromptLanguage {
  return language;
}

function resolveCanonicalKey(keys: string[]): string {
  if (keys.length === 1) return keys[0]!;

  const stepKey = keys.find(key => STEP_SUFFIX_PATTERN.test(key));
  if (stepKey) {
    return stepKey.replace(STEP_SUFFIX_PATTERN, '');
  }

  return keys.sort()[0]!;
}

export function listThumbnailStyleOptions(language: ChannelLanguage | PromptLanguage): ThumbnailStyleOption[] {
  const lang = toPromptLanguage(language);
  const thumbnailPrompts = promptsRepository
    .findAll()
    .filter(prompt => prompt.category === 'thumbnail' && (prompt.language === lang || prompt.language === 'all'));

  const groups = new Map<string, { keys: string[]; useChannelBackgroundImage: boolean }>();
  for (const prompt of thumbnailPrompts) {
    const name = prompt.name.trim();
    const existing = groups.get(name) ?? { keys: [], useChannelBackgroundImage: false };
    existing.keys.push(prompt.key);
    if (prompt.useChannelBackgroundImage) {
      existing.useChannelBackgroundImage = true;
    }
    groups.set(name, existing);
  }

  return [...groups.entries()]
    .map(([name, group]) => ({
      key: resolveCanonicalKey(group.keys),
      name,
      useChannelBackgroundImage: group.useChannelBackgroundImage,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function validateThumbnailStyleKey(key: string, language: ChannelLanguage | PromptLanguage): boolean {
  const normalized = key.trim();
  if (!normalized) return false;
  return listThumbnailStyleOptions(language).some(option => option.key === normalized);
}

export function resolveDefaultThumbnailStyleKey(language: ChannelLanguage | PromptLanguage): string | undefined {
  const options = listThumbnailStyleOptions(language);
  if (options.length === 0) return undefined;

  const horizontal = options.find(option => option.name.toLowerCase() === 'horizontal');
  return horizontal?.key ?? options[0]?.key;
}

export function resolveThumbnailStyleKey(
  key: string | undefined,
  language: ChannelLanguage | PromptLanguage,
): string | undefined {
  const trimmed = key?.trim();
  if (trimmed && validateThumbnailStyleKey(trimmed, language)) {
    return trimmed;
  }
  return resolveDefaultThumbnailStyleKey(language);
}

export function isHorizontalMultiStepStyle(
  styleKey: string,
  language: ChannelLanguage | PromptLanguage,
): boolean {
  const lang = toPromptLanguage(language);
  const base = styleKey.trim();
  if (!base) return false;

  const stepKeys = [1, 2, 3].map(step => `${base}_step_${step}`);
  return stepKeys.every((stepKey) => {
    const prompt = promptsRepository.findByKeyWithFallback(stepKey, lang);
    return prompt?.category === 'thumbnail';
  });
}

export function assertValidThumbnailStyleKey(
  key: string | undefined,
  language: ChannelLanguage,
  required: boolean,
): string | undefined {
  const trimmed = key?.trim();
  if (!trimmed) {
    if (required) {
      throw new AppError('Thumbnail style is required for reup channels', 400, 'VALIDATION_ERROR');
    }
    return undefined;
  }

  if (!validateThumbnailStyleKey(trimmed, language)) {
    throw new AppError('Invalid thumbnail style for selected language', 400, 'VALIDATION_ERROR');
  }

  return trimmed;
}
