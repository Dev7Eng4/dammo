import type {
  PlaygroundProvider, TextLlmProvider,
  PromptCategory,
  PromptLanguage,
  PromptOutputType,
  PromptPlatform,
  ImageBrowserProvider,
  VideoBrowserProvider,
  SpecificPromptLanguage,
} from '../types/prompt';
import i18n from '../i18n'

/** Sentinel for prompts that apply to every niche. */
export const PROMPT_NICHE_ALL = 'all';

/** Platform a prompt targets; `all` (default) applies to every platform. */
export const PROMPT_PLATFORM_ALL: PromptPlatform = 'all';

export const IMAGE_PROVIDER_OPTIONS: { value: ImageBrowserProvider; label: string }[] = [
  { value: 'flow', label: 'Google Flow' },
  { value: 'meta', label: 'Meta AI' },
  { value: 'muse', label: 'Muse' },
];

export const VIDEO_PROVIDER_OPTIONS: { value: VideoBrowserProvider; label: string }[] = [
  { value: 'flow', label: 'Google Flow' },
  { value: 'muse', label: 'Muse' },
  { value: 'meta', label: 'Meta AI' },
];

export const PLAYGROUND_PROVIDER_OPTIONS: { value: PlaygroundProvider; label: string }[] = [
  { value: 'gpt', label: 'ChatGPT' },
  { value: 'gemini', label: 'Gemini' },
];

/** All text LLMs (= the LLM Content options on Chrome profiles). */
export const TEXT_LLM_OPTIONS: { value: TextLlmProvider; label: string }[] = [
  ...PLAYGROUND_PROVIDER_OPTIONS,
  { value: 'claude', label: 'Claude' },
];

export const PROMPT_LANGUAGE_LABELS: Record<PromptLanguage, string> = {
  all: 'ALL',
  en: 'EN',
  ko: 'KO',
  ja: 'JA',
  es: 'ES',
};

// Labels below follow the app language, so call these while rendering.

const PROMPT_CATEGORIES: PromptCategory[] = ['thumbnail', 'transcript', 'meta', 'image', 'remake'];
const PROMPT_LANGUAGES: SpecificPromptLanguage[] = ['en', 'ko', 'ja', 'es'];
const PROMPT_OUTPUT_TYPES: PromptOutputType[] = ['text', 'image', 'video'];

export function promptCategoryLabel(category: PromptCategory): string {
  return i18n.t(`content:prompts.option.category.${category}`);
}

export function promptCategoryOptions(): { value: PromptCategory; label: string }[] {
  return PROMPT_CATEGORIES.map((value) => ({ value, label: promptCategoryLabel(value) }));
}

export function promptPlatformOptions(): { value: PromptPlatform; label: string }[] {
  return [
    { value: PROMPT_PLATFORM_ALL, label: i18n.t('common:filter.all') },
    { value: 'youtube', label: 'YouTube' },
    { value: 'facebook', label: 'Facebook' },
    { value: 'tiktok', label: 'TikTok' },
  ];
}

export function promptLanguageOptions(): { value: SpecificPromptLanguage; label: string }[] {
  return PROMPT_LANGUAGES.map((value) => ({ value, label: i18n.t(`youtube:language.${value}`) }));
}

/** Language options for create/edit form, including the shared `all` namespace. */
export function promptFormLanguageOptions(): { value: PromptLanguage; label: string }[] {
  return [{ value: 'all', label: i18n.t('common:filter.all') }, ...promptLanguageOptions()];
}

export function promptOutputTypeOptions(): { value: PromptOutputType; label: string }[] {
  return PROMPT_OUTPUT_TYPES.map((value) => ({ value, label: i18n.t(`content:prompts.option.outputType.${value}`) }));
}
