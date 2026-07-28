import type { PlaygroundProvider, PromptCategory, PromptLanguage, PromptOutputType, ImageBrowserProvider, VideoBrowserProvider } from '../types/prompt';

export const PROMPT_CATEGORY_OPTIONS: { value: PromptCategory; label: string }[] = [
  { value: 'thumbnail', label: 'Ảnh thumbnail' },
  { value: 'transcript', label: 'Bản ghi' },
  { value: 'meta', label: 'Meta' },
  { value: 'image', label: 'Hình ảnh' },
];

export const PROMPT_LANGUAGE_OPTIONS: { value: PromptLanguage; label: string }[] = [
  { value: 'en', label: 'Tiếng Anh' },
  { value: 'ko', label: 'Tiếng Hàn' },
  { value: 'ja', label: 'Tiếng Nhật' },
  { value: 'es', label: 'Tiếng Tây Ban Nha' },
];

/** Language options for create/edit form, including "all languages". */
export const PROMPT_FORM_LANGUAGE_OPTIONS: { value: PromptLanguage | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  ...PROMPT_LANGUAGE_OPTIONS,
];

export const PROMPT_OUTPUT_TYPE_OPTIONS: { value: PromptOutputType; label: string }[] = [
  { value: 'text', label: 'Văn bản' },
  { value: 'image', label: 'Hình ảnh' },
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
  thumbnail: 'Ảnh thumbnail',
  transcript: 'Bản ghi',
  meta: 'Meta',
  image: 'Hình ảnh',
};

export const PROMPT_LANGUAGE_LABELS: Record<PromptLanguage, string> = {
  en: 'EN',
  ko: 'KO',
  ja: 'JA',
  es: 'ES',
};
