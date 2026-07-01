import type { PlaygroundProvider, PromptCategory, PromptLanguage, PromptOutputType, ImageBrowserProvider, VideoBrowserProvider } from '../types/prompt';

export const PROMPT_CATEGORY_OPTIONS: { value: PromptCategory; label: string }[] = [
  { value: 'thumbnail', label: 'Thumbnail' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'meta', label: 'Meta' },
  { value: 'image', label: 'Image' },
];

export const PROMPT_LANGUAGE_OPTIONS: { value: PromptLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ko', label: 'Korean' },
  { value: 'ja', label: 'Japanese' },
  { value: 'es', label: 'Spanish' },
];

export const PROMPT_OUTPUT_TYPE_OPTIONS: { value: PromptOutputType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
];

export const IMAGE_PROVIDER_OPTIONS: { value: ImageBrowserProvider; label: string }[] = [
  { value: 'flow', label: 'Google Flow' },
  { value: 'meta', label: 'Meta AI' },
];

export const VIDEO_PROVIDER_OPTIONS: { value: VideoBrowserProvider; label: string }[] = [
  { value: 'meta', label: 'Meta AI' },
];

export const PLAYGROUND_PROVIDER_OPTIONS: { value: PlaygroundProvider; label: string }[] = [
  { value: 'gpt', label: 'ChatGPT' },
  { value: 'gemini', label: 'Gemini' },
];

export const PROMPT_CATEGORY_LABELS: Record<PromptCategory, string> = {
  thumbnail: 'Thumbnail',
  transcript: 'Transcript',
  meta: 'Meta',
  image: 'Image',
};

export const PROMPT_LANGUAGE_LABELS: Record<PromptLanguage, string> = {
  en: 'EN',
  ko: 'KO',
  ja: 'JA',
  es: 'ES',
};
