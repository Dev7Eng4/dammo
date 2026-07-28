import { AppError } from '../../shared/http/errors.js';
import type { ChannelLanguage } from '../youtube-channels/channel-language.js';
import { promptsRepository } from './prompts.repository.js';
import type { PromptLanguage } from './prompts.types.js';

export interface ThumbnailStyleOption {
  key: string;
  name: string;
  useChannelBackgroundImage: boolean;
}

function toPromptLanguage(language: ChannelLanguage | PromptLanguage): PromptLanguage {
  return language;
}

export function listThumbnailStyleOptions(language: ChannelLanguage | PromptLanguage): ThumbnailStyleOption[] {
  const lang = toPromptLanguage(language);
  return promptsRepository
    .findAll()
    .filter(set => set.category === 'thumbnail' && set.language === lang)
    .map(set => ({
      key: set.key,
      name: set.name,
      useChannelBackgroundImage: set.steps.some(step => step.useChannelBackgroundImage === true),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function validateThumbnailStyleKey(key: string, language: ChannelLanguage | PromptLanguage): boolean {
  const normalized = key.trim();
  if (!normalized) return false;
  return listThumbnailStyleOptions(language).some(option => option.key === normalized);
}

export function resolveDefaultThumbnailStyleKey(language: ChannelLanguage | PromptLanguage): string | undefined {
  const lang = toPromptLanguage(language);
  const defaultSet = promptsRepository.findDefault(lang, 'thumbnail');
  if (defaultSet) return defaultSet.key;

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
  const set = promptsRepository.findByKeyAndLanguage(styleKey.trim(), lang);
  if (!set || set.category !== 'thumbnail') return false;
  return set.steps.length >= 3;
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
