import type { PlaygroundProvider, PromptCategory, PromptLanguage } from '../types/prompt';

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
