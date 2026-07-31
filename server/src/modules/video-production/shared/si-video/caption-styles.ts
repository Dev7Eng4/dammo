import { AppError } from '../../../../shared/http/errors.js';

export const CAPTION_STYLE_KEYS = [
  'default',
  'noto_sans_red_white',
  'bizudp_gothic',
  'zen_kaku',
  'noto_serif',
  'noto_sans_yellow',
  'noto_sans_cyan_white',
  'zen_kaku_blue_white',
  'noto_sans_blue_white',
  'serif_white_purple',
  'serif_red_white',
  'bizudp_gothic_red_white',
] as const;

export type CaptionStyleKey = (typeof CAPTION_STYLE_KEYS)[number];

export type CaptionAssLayout = 'single' | 'glow_dual';

export interface CaptionStylePreset {
  key: CaptionStyleKey;
  label: string;
  fontRelPath: string;
  fontAssName: string;
  fontSize: number;
  primaryColor: string;
  /** ASS OutlineColour (&HAABBGGRR). Default black when omitted. */
  outlineColor?: string;
  showBackgroundBox: boolean;
  outlinePx: number;
  shadowPx: number;
  /** ASS Spacing (extra px between characters). Defaults to SI_SUBTITLE_CHAR_SPACING. */
  charSpacing?: number;
  assLayout?: CaptionAssLayout;
  glowPrimaryColor?: string;
  glowOutlineColor?: string;
  glowOutlinePx?: number;
  glowBlur?: number;
}

export const CAPTION_STYLE_PRESETS: Record<CaptionStyleKey, CaptionStylePreset> = {
  default: {
    key: 'default',
    label: 'Default',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    fontSize: 60,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 5.5,
    shadowPx: 0.3,
  },
  noto_sans_red_white: {
    key: 'noto_sans_red_white',
    label: 'Noto Sans Red text + White stroke',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    fontSize: 60,
    primaryColor: '&H00250BB8',
    outlineColor: '&H00FFFFFF',
    showBackgroundBox: false,
    outlinePx: 3.6,
    shadowPx: 1.5,
  },
  noto_sans_blue_white: {
    key: 'noto_sans_blue_white',
    label: 'Noto Sans Blue text + White stroke',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    fontSize: 60,
    primaryColor: '&H00F0A843',
    outlineColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 2.4,
    shadowPx: 1.5,
    charSpacing: 2,
  },
  noto_sans_yellow: {
    key: 'noto_sans_yellow',
    label: 'Noto Sans Yellow text',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    fontSize: 60,
    primaryColor: '&H0000FFFF',
    showBackgroundBox: false,
    outlinePx: 3.6,
    shadowPx: 1.5,
  },
  noto_sans_cyan_white: {
    key: 'noto_sans_cyan_white',
    label: 'Noto Sans Cyan text + White stroke',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    fontSize: 60,
    primaryColor: '&H00FFFF00',
    outlineColor: '&H00FFFFFF',
    showBackgroundBox: false,
    outlinePx: 3.6,
    shadowPx: 1.5,
  },
  bizudp_gothic: {
    key: 'bizudp_gothic',
    label: 'BIZ UDPGothic',
    fontRelPath: 'fonts/BIZUDPGothic-Regular.ttf',
    fontAssName: 'BIZ UDPGothic',
    fontSize: 55,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 5.5,
    shadowPx: 0.3,
    charSpacing: 4,
  },
  bizudp_gothic_red_white: {
    key: 'bizudp_gothic_red_white',
    label: 'BIZ UDPGothic Red text + White stroke',
    fontRelPath: 'fonts/BIZUDPGothic-Regular.ttf',
    fontAssName: 'BIZ UDPGothic',
    fontSize: 55,
    primaryColor: '&H00250BB8',
    outlineColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 5.5,
    shadowPx: 0.3,
    charSpacing: 4,
  },
  zen_kaku: {
    key: 'zen_kaku',
    label: 'Zen Kaku',
    fontRelPath: 'fonts/ZenKakuGothicNew-Regular.ttf',
    fontAssName: 'Zen Kaku Gothic New',
    fontSize: 60,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 5.5,
    shadowPx: 0.3,
  },
  zen_kaku_blue_white: {
    key: 'zen_kaku_blue_white',
    label: 'Zen Kaku Blue text + White stroke',
    fontRelPath: 'fonts/ZenKakuGothicNew-Regular.ttf',
    fontAssName: 'Zen Kaku Gothic New',
    fontSize: 60,
    primaryColor: '&H00F0A843',
    outlineColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 2.4,
    shadowPx: 1.5,
    charSpacing: 2,
  },
  noto_serif: {
    key: 'noto_serif',
    label: 'Noto Serif',
    fontRelPath: 'fonts/NotoSerifJP-SemiBold.ttf',
    fontAssName: 'Noto Serif JP',
    fontSize: 55,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: false,
    outlinePx: 4.0,
    shadowPx: 0.3,
    charSpacing: 4,
  },
  serif_white_purple: {
    key: 'serif_white_purple',
    label: 'Noto Serif White text + Purple stroke',
    fontRelPath: 'fonts/NotoSerifJP-SemiBold.ttf',
    fontAssName: 'Noto Serif JP',
    fontSize: 55,
    primaryColor: '&H00FFFFFF',
    outlineColor: '&H00F0435A',
    showBackgroundBox: true,
    outlinePx: 4.0,
    shadowPx: 0.3,
    charSpacing: 4,
  },
  serif_red_white: {
    key: 'serif_red_white',
    label: 'Noto Serif Red text + White stroke',
    fontRelPath: 'fonts/NotoSerifJP-SemiBold.ttf',
    fontAssName: 'Noto Serif JP',
    fontSize: 55,
    primaryColor: '&H00250BB8',
    outlineColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 4.0,
    shadowPx: 0.3,
    charSpacing: 4,
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
  if (!trimmed) return 'default';
  return isCaptionStyleKey(trimmed) ? trimmed : 'default';
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
