import { AppError } from '../../../../shared/http/errors.js';

export const CAPTION_STYLE_KEYS = ['default', 'klee_one', 'green', 'blue_glow'] as const;

export type CaptionStyleKey = (typeof CAPTION_STYLE_KEYS)[number];

export type CaptionAssLayout = 'single' | 'glow_dual';

export interface CaptionStylePreset {
  key: CaptionStyleKey;
  label: string;
  fontRelPath: string;
  fontAssName: string;
  fontSize: number;
  primaryColor: string;
  showBackgroundBox: boolean;
  outlinePx: number;
  shadowPx: number;
  assLayout?: CaptionAssLayout;
  glowPrimaryColor?: string;
  glowOutlinePx?: number;
  glowBlur?: number;
}

export const CAPTION_STYLE_PRESETS: Record<CaptionStyleKey, CaptionStylePreset> = {
  default: {
    key: 'default',
    label: 'Default',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    fontSize: 70,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 5.5,
    shadowPx: 0.3,
  },
  klee_one: {
    key: 'klee_one',
    label: 'Klee One',
    fontRelPath: 'fonts/KleeOne-Regular.ttf',
    fontAssName: 'Klee One',
    fontSize: 90,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 5.4,
    shadowPx: 1.5,
  },
  green: {
    key: 'green',
    label: 'Cyan',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    fontSize: 60,
    primaryColor: '&H0000FFFF',
    showBackgroundBox: false,
    outlinePx: 3.6,
    shadowPx: 1.5,
  },
  blue_glow: {
    key: 'blue_glow',
    label: 'White + Blue glow',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    fontSize: 60,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: false,
    outlinePx: 3.6,
    shadowPx: 0,
    assLayout: 'glow_dual',
    glowPrimaryColor: '&H00C8FF00',
    glowOutlinePx: 10,
    glowBlur: 10,
  },
};

export function shouldShowCaptionBackgroundBox(key?: string | null): boolean {
  return getCaptionStylePreset(key).showBackgroundBox;
}

export function isCaptionStyleKey(value: string): value is CaptionStyleKey {
  return (CAPTION_STYLE_KEYS as readonly string[]).includes(value);
}

export function resolveCaptionStyleKey(key?: string | null): CaptionStyleKey {
  const trimmed = key?.trim();
  if (trimmed && isCaptionStyleKey(trimmed)) {
    return trimmed;
  }
  return 'default';
}

export function assertValidCaptionStyleKey(key: string | undefined, required = false): CaptionStyleKey | undefined {
  const trimmed = key?.trim();
  if (!trimmed) {
    if (required) {
      throw new AppError('Caption style is required for Reup Audio channels', 400, 'VALIDATION_ERROR');
    }
    return undefined;
  }

  if (!isCaptionStyleKey(trimmed)) {
    throw new AppError(`Invalid caption style: ${trimmed}`, 400, 'VALIDATION_ERROR');
  }

  return trimmed;
}

export function getCaptionStylePreset(key?: string | null): CaptionStylePreset {
  return CAPTION_STYLE_PRESETS[resolveCaptionStyleKey(key)];
}
