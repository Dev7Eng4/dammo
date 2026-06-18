import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { PromptsSettings } from './prompts-settings.types.js';

const DEFAULT_SETTINGS: PromptsSettings = {
  defaultLlmProvider: 'gpt',
};

function loadSettings(): PromptsSettings {
  return readJson<PromptsSettings>(paths.promptsSettings) ?? DEFAULT_SETTINGS;
}

export class PromptsSettingsService {
  get(): PromptsSettings {
    return loadSettings();
  }

  update(input: PromptsSettings): PromptsSettings {
    const next: PromptsSettings = {
      defaultLlmProvider: input.defaultLlmProvider,
    };
    writeJson(paths.promptsSettings, next);
    return next;
  }
}

export const promptsSettingsService = new PromptsSettingsService();
