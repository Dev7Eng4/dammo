import { AppError } from '../../../../shared/http/errors.js';

export const CAPTION_STYLE_KEYS = ['default', 'bizudp_gothic', 'zen_kaku', 'noto_serif', 'cyan', 'cyan_navy', 'yellow'] as const;

export type CaptionStyleKey = (typeof CAPTION_STYLE_KEYS)[number];

/** Legacy keys persisted before rename/removal. */
const LEGACY_CAPTION_STYLE_ALIASES: Record<string, CaptionStyleKey> = {
  green: 'cyan',
  klee_one: 'default',
  blue_glow: 'cyan_navy',
};

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
    fontSize: 70,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 5.5,
    shadowPx: 0.3,
  },
  bizudp_gothic: {
    key: 'bizudp_gothic',
    label: 'BIZ UDPGothic',
    fontRelPath: 'fonts/BIZUDPGothic-Regular.ttf',
    fontAssName: 'BIZ UDPGothic',
    fontSize: 70,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 5.5,
    shadowPx: 0.3,
  },
  zen_kaku: {
    key: 'zen_kaku',
    label: 'Zen Kaku Gothic New',
    fontRelPath: 'fonts/ZenKakuGothicNew-Regular.ttf',
    fontAssName: 'Zen Kaku Gothic New',
    fontSize: 70,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 5.5,
    shadowPx: 0.3,
  },
  noto_serif: {
    key: 'noto_serif',
    label: 'Noto Serif JP',
    fontRelPath: 'fonts/NotoSerifJP-SemiBold.ttf',
    fontAssName: 'Noto Serif JP',
    fontSize: 55,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: false,
    outlinePx: 4.0,
    shadowPx: 0.3,
    charSpacing: 4,
  },
  cyan: {
    key: 'cyan',
    label: 'Cyan text',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    fontSize: 60,
    primaryColor: '&H0000FFFF',
    showBackgroundBox: false,
    outlinePx: 3.6,
    shadowPx: 1.5,
  },
  cyan_navy: {
    key: 'cyan_navy',
    label: 'Cyan + Navy stroke',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    fontSize: 60,
    // #00FFFF → ASS &HAABBGGRR
    primaryColor: '&H00FFFF00',
    // #000080 → ASS &HAABBGGRR
    outlineColor: '&H00800000',
    showBackgroundBox: false,
    outlinePx: 3.6,
    shadowPx: 1.5,
  },
  yellow: {
    key: 'yellow',
    label: 'Yellow text',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    fontSize: 50,
    // #FFFF00 → ASS &HAABBGGRR
    primaryColor: '&H0000FFFF',
    showBackgroundBox: false,
    outlinePx: 2.4,
    shadowPx: 1.5,
    charSpacing: 2,
  },
};

export function shouldShowCaptionBackgroundBox(key?: string | null): boolean {
  return getCaptionStylePreset(key).showBackgroundBox;
}

export function isCaptionStyleKey(value: string): value is CaptionStyleKey {
  return (CAPTION_STYLE_KEYS as readonly string[]).includes(value);
}

function normalizeCaptionStyleKey(value: string): CaptionStyleKey | undefined {
  if (isCaptionStyleKey(value)) return value;
  return LEGACY_CAPTION_STYLE_ALIASES[value];
}

export function resolveCaptionStyleKey(key?: string | null): CaptionStyleKey {
  const trimmed = key?.trim();
  if (!trimmed) return 'default';
  return normalizeCaptionStyleKey(trimmed) ?? 'default';
}

export function assertValidCaptionStyleKey(key: string | undefined, required = false): CaptionStyleKey | undefined {
  const trimmed = key?.trim();
  if (!trimmed) {
    if (required) {
      throw new AppError('Caption style is required for Reup Audio channels', 400, 'VALIDATION_ERROR');
    }
    return undefined;
  }

  const resolved = normalizeCaptionStyleKey(trimmed);
  if (!resolved) {
    throw new AppError(`Invalid caption style: ${trimmed}`, 400, 'VALIDATION_ERROR');
  }

  return resolved;
}

export function getCaptionStylePreset(key?: string | null): CaptionStylePreset {
  return CAPTION_STYLE_PRESETS[resolveCaptionStyleKey(key)];
}
