import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { ImageBrowserProvider } from '../../infrastructure/llm-browser/llm-browser.types.js';
import type { PromptsSettings } from './prompts-settings.types.js';

const DEFAULT_SETTINGS: PromptsSettings = {
  defaultLlmProvider: 'gpt',
  defaultReferenceImageProvider: 'flow',
  defaultSceneImageProvider: 'flow',
  defaultThumbnailProvider: 'flow',
  defaultVideoProvider: 'meta',
};

type StoredPromptsSettings = Partial<PromptsSettings> & {
  /** @deprecated Migrated into reference + scene providers. */
  defaultImageProvider?: ImageBrowserProvider;
};

function resolveImageProvider(
  value: ImageBrowserProvider | undefined,
  legacy: ImageBrowserProvider | undefined,
  fallback: ImageBrowserProvider,
): ImageBrowserProvider {
  return value ?? legacy ?? fallback;
}

function loadSettings(): PromptsSettings {
  const stored = readJson<StoredPromptsSettings>(paths.promptsSettings);
  const legacyImage = stored?.defaultImageProvider;
  return {
    defaultLlmProvider: stored?.defaultLlmProvider ?? DEFAULT_SETTINGS.defaultLlmProvider,
    defaultReferenceImageProvider: resolveImageProvider(
      stored?.defaultReferenceImageProvider,
      legacyImage,
      DEFAULT_SETTINGS.defaultReferenceImageProvider,
    ),
    defaultSceneImageProvider: resolveImageProvider(
      stored?.defaultSceneImageProvider,
      legacyImage,
      DEFAULT_SETTINGS.defaultSceneImageProvider,
    ),
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
      defaultReferenceImageProvider:
        input.defaultReferenceImageProvider ?? current.defaultReferenceImageProvider,
      defaultSceneImageProvider: input.defaultSceneImageProvider ?? current.defaultSceneImageProvider,
      defaultThumbnailProvider: input.defaultThumbnailProvider ?? current.defaultThumbnailProvider,
      defaultVideoProvider: input.defaultVideoProvider ?? current.defaultVideoProvider,
    };
    writeJson(paths.promptsSettings, next);
    return next;
  }
}

export const promptsSettingsService = new PromptsSettingsService();
