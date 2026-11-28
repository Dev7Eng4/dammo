import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import type { ImageBrowserProvider, LlmTextProvider } from '../llm-browser/core/types.js';
import type { PromptsSettings } from './prompts-settings.types.js';

const DEFAULT_LLM_PROVIDER: LlmTextProvider = 'gpt';

const DEFAULT_SETTINGS: PromptsSettings = {
  defaultLlmProvider: DEFAULT_LLM_PROVIDER,
  scriptRemakeLlmProvider: DEFAULT_LLM_PROVIDER,
  scenePromptLlmProvider: DEFAULT_LLM_PROVIDER,
  metadataLlmProvider: DEFAULT_LLM_PROVIDER,
  contentChromeProfileId: null,
  scriptRemakeChromeProfileId: null,
  scenePromptChromeProfileId: null,
  metadataChromeProfileId: null,
  defaultReferenceImageProvider: 'flow',
  defaultSceneImageProvider: 'flow',
  defaultThumbnailProvider: 'flow',
  defaultVideoProvider: 'flow',
};

type StoredPromptsSettings = Partial<PromptsSettings> & {
  /** @deprecated Migrated into reference + scene providers. */
  defaultImageProvider?: ImageBrowserProvider;
};

const PROFILE_KEYS = [
  'contentChromeProfileId',
  'scriptRemakeChromeProfileId',
  'scenePromptChromeProfileId',
  'metadataChromeProfileId',
] as const;

type ProfileKey = (typeof PROFILE_KEYS)[number];

const TASK_LLM_KEYS = ['scriptRemakeLlmProvider', 'scenePromptLlmProvider', 'metadataLlmProvider'] as const;

function resolveImageProvider(
  value: ImageBrowserProvider | undefined,
  legacy: ImageBrowserProvider | undefined,
  fallback: ImageBrowserProvider,
): ImageBrowserProvider {
  return value ?? legacy ?? fallback;
}

/** Trimmed id; blank → null. `undefined` (not set) → fallback. */
function resolveProfileId(value: unknown, fallback: string | null): string | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}

/** The metadata profile used to live in app settings; carry it over until saved here. */
function legacyMetadataProfileId(): string | null {
  const appSettings = readJson<{ metadataChromeProfileId?: unknown }>(paths.appSettings);
  return resolveProfileId(appSettings?.metadataChromeProfileId, null);
}

function loadSettings(): PromptsSettings {
  let stored = readJson<StoredPromptsSettings>(paths.promptsSettings);
  if (!stored || !('metadataChromeProfileId' in stored)) {
    // Save the carried-over value here once, so a later app-settings save (which no longer keeps it) can't lose it.
    const legacy = legacyMetadataProfileId();
    if (legacy) {
      stored = { ...stored, metadataChromeProfileId: legacy };
      writeJson(paths.promptsSettings, stored);
    }
  }
  const legacyImage = stored?.defaultImageProvider;
  const llm = stored?.defaultLlmProvider ?? DEFAULT_SETTINGS.defaultLlmProvider;
  return {
    defaultLlmProvider: llm,
    // Task LLMs follow the content LLM until chosen, so nothing changes for existing setups.
    scriptRemakeLlmProvider: stored?.scriptRemakeLlmProvider ?? llm,
    scenePromptLlmProvider: stored?.scenePromptLlmProvider ?? llm,
    metadataLlmProvider: stored?.metadataLlmProvider ?? llm,
    contentChromeProfileId: resolveProfileId(stored?.contentChromeProfileId, null),
    scriptRemakeChromeProfileId: resolveProfileId(stored?.scriptRemakeChromeProfileId, null),
    scenePromptChromeProfileId: resolveProfileId(stored?.scenePromptChromeProfileId, null),
    metadataChromeProfileId: resolveProfileId(stored?.metadataChromeProfileId, null),
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
    // Meta AI is no longer offered for video; a stored `meta` becomes Flow, which the video steps use.
    defaultVideoProvider: stored?.defaultVideoProvider ?? DEFAULT_SETTINGS.defaultVideoProvider,
  };
}

export type UpdatePromptsSettingsInput = Partial<Omit<PromptsSettings, ProfileKey>> &
  Partial<Record<ProfileKey, string | null>>;

export class PromptsSettingsService {
  get(): PromptsSettings {
    return loadSettings();
  }

  update(input: UpdatePromptsSettingsInput): PromptsSettings {
    const current = loadSettings();
    const next: PromptsSettings = {
      defaultLlmProvider: input.defaultLlmProvider ?? current.defaultLlmProvider,
      scriptRemakeLlmProvider: input.scriptRemakeLlmProvider ?? current.scriptRemakeLlmProvider,
      scenePromptLlmProvider: input.scenePromptLlmProvider ?? current.scenePromptLlmProvider,
      metadataLlmProvider: input.metadataLlmProvider ?? current.metadataLlmProvider,
      contentChromeProfileId: resolveProfileId(input.contentChromeProfileId, current.contentChromeProfileId),
      scriptRemakeChromeProfileId: resolveProfileId(input.scriptRemakeChromeProfileId, current.scriptRemakeChromeProfileId),
      scenePromptChromeProfileId: resolveProfileId(input.scenePromptChromeProfileId, current.scenePromptChromeProfileId),
      metadataChromeProfileId: resolveProfileId(input.metadataChromeProfileId, current.metadataChromeProfileId),
      defaultReferenceImageProvider:
        input.defaultReferenceImageProvider ?? current.defaultReferenceImageProvider,
      defaultSceneImageProvider: input.defaultSceneImageProvider ?? current.defaultSceneImageProvider,
      defaultThumbnailProvider: input.defaultThumbnailProvider ?? current.defaultThumbnailProvider,
      defaultVideoProvider: input.defaultVideoProvider ?? current.defaultVideoProvider,
    };
    // A task LLM never chosen keeps following the content LLM, so don't freeze it on this save.
    const stored = readJson<StoredPromptsSettings>(paths.promptsSettings);
    const toStore: Partial<PromptsSettings> = { ...next };
    for (const key of TASK_LLM_KEYS) {
      if (input[key] === undefined && stored?.[key] === undefined) delete toStore[key];
    }
    writeJson(paths.promptsSettings, toStore);
    return next;
  }
}

export const promptsSettingsService = new PromptsSettingsService();
