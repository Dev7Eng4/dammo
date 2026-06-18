export type ChannelLanguage = 'en' | 'ko' | 'ja' | 'es';

const SUPPORTED = new Set<ChannelLanguage>(['en', 'ko', 'ja', 'es']);

const LEGACY_LANGUAGE_MAP: Record<string, ChannelLanguage> = {
  'EN-US': 'en',
  'EN-UK': 'en',
  'JA-JP': 'ja',
  'KO-KR': 'ko',
  'ES-ES': 'es',
  'FR-FR': 'en',
  'DE-DE': 'en',
  'PT-BR': 'es',
};

export function normalizeChannelLanguage(value: string): ChannelLanguage {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (SUPPORTED.has(lower as ChannelLanguage)) {
    return lower as ChannelLanguage;
  }
  return LEGACY_LANGUAGE_MAP[trimmed] ?? LEGACY_LANGUAGE_MAP[trimmed.toUpperCase()] ?? 'en';
}
