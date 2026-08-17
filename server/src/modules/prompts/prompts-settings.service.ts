import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { PromptsSettings } from './prompts-settings.types.js';

const DEFAULT_SETTINGS: PromptsSettings = {
  defaultLlmProvider: 'gpt',
  defaultImageProvider: 'flow',
  defaultThumbnailProvider: 'flow',
  defaultVideoProvider: 'meta',
};

function loadSettings(): PromptsSettings {
  const stored = readJson<Partial<PromptsSettings>>(paths.promptsSettings);
  return {
    defaultLlmProvider: stored?.defaultLlmProvider ?? DEFAULT_SETTINGS.defaultLlmProvider,
    defaultImageProvider: stored?.defaultImageProvider ?? DEFAULT_SETTINGS.defaultImageProvider,
    defaultThumbnailProvider: stored?.defaultThumbnailProvider ?? DEFAULT_SETTINGS.defaultThumbnailProvider,
    defaultVideoProvider: stored?.defaultVideoProvider ?? DEFAULT_SETTINGS.defaultVideoProvider,
  };
}

export class PromptsSettingsService {
  get(): PromptsSettings {
    return loadSettings();
  }

  update(input: Partial<PromptsSettings>): PromptsSettings {
    const current = loadSettings();
    const next: PromptsSettings = {
      defaultLlmProvider: input.defaultLlmProvider ?? current.defaultLlmProvider,
      defaultImageProvider: input.defaultImageProvider ?? current.defaultImageProvider,
      defaultThumbnailProvider: input.defaultThumbnailProvider ?? current.defaultThumbnailProvider,
      defaultVideoProvider: input.defaultVideoProvider ?? current.defaultVideoProvider,
    };
    writeJson(paths.promptsSettings, next);
    return next;
  }
}

export const promptsSettingsService = new PromptsSettingsService();
