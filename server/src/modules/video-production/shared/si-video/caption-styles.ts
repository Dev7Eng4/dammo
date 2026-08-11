import { AppError } from '../../../../shared/http/errors.js';

export const CAPTION_FONT_SIZE_WITH_BOX = 60;
export const CAPTION_FONT_SIZE_WITHOUT_BOX = 55;

export const CAPTION_STYLE_KEYS = [
  'default',
  'noto_sans_red_white',
  'noto_sans_red_white_box',
  'noto_sans_blue_white',
  'noto_sans_blue_white_box',
  'noto_sans_yellow',
  'noto_sans_yellow_box',
  'noto_sans_cyan_white',
  'noto_sans_cyan_white_box',
  'noto_sans_white_purple',
  'noto_sans_white_purple_box',
  'bizudp_gothic',
  'bizudp_gothic_red_white',
  'bizudp_gothic_red_white_box',
  'zen_kaku',
  'zen_kaku_blue_white',
  'zen_kaku_blue_white_box',
  'noto_serif',
  'serif_white_purple',
  'serif_white_purple_box',
  'serif_yellow',
  'serif_yellow_box',
  'serif_cyan_white',
  'serif_cyan_white_box',
  'serif_red_white',
  'serif_red_white_box',
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

type CaptionStyleDualBaseId =
  | 'noto_sans_red_white'
  | 'noto_sans_blue_white'
  | 'noto_sans_yellow'
  | 'noto_sans_cyan_white'
  | 'noto_sans_white_purple'
  | 'bizudp_gothic_red_white'
  | 'zen_kaku_blue_white'
  | 'serif_white_purple'
  | 'serif_yellow'
  | 'serif_cyan_white'
  | 'serif_red_white';

type CaptionStyleBase = {
  id: CaptionStyleDualBaseId;
  label: string;
  fontRelPath: string;
  fontAssName: string;
  primaryColor: string;
  outlineColor?: string;
  outlinePx: number;
  shadowPx: number;
  charSpacing?: number;
  assLayout?: CaptionAssLayout;
  glowPrimaryColor?: string;
  glowOutlineColor?: string;
  glowOutlinePx?: number;
  glowBlur?: number;
};

function expandBoxPair(base: CaptionStyleBase): [CaptionStylePreset, CaptionStylePreset] {
  const { id, label, ...style } = base;
  return [
    {
      ...style,
      key: id,
      label,
      showBackgroundBox: false,
      fontSize: CAPTION_FONT_SIZE_WITHOUT_BOX,
    },
    {
      ...style,
      key: `${id}_box`,
      label: `${label} + Box`,
      showBackgroundBox: true,
      fontSize: CAPTION_FONT_SIZE_WITH_BOX,
    },
  ];
}

function presetsFromPairs(...bases: CaptionStyleBase[]): Record<string, CaptionStylePreset> {
  return Object.fromEntries(bases.flatMap(base => expandBoxPair(base).map(preset => [preset.key, preset])));
}

const CAPTION_STYLE_DUAL_BASES: CaptionStyleBase[] = [
  {
    id: 'noto_sans_red_white',
    label: 'Noto Sans Red text + White stroke',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    primaryColor: '&H00250BB8',
    outlineColor: '&H00FFFFFF',
    outlinePx: 3.6,
    shadowPx: 1.5,
  },
  {
    id: 'noto_sans_blue_white',
    label: 'Noto Sans Blue text + White stroke',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    primaryColor: '&H00F0A843',
    outlineColor: '&H00FFFFFF',
    outlinePx: 2.4,
    shadowPx: 1.5,
    charSpacing: 2,
  },
  {
    id: 'noto_sans_yellow',
    label: 'Noto Sans Yellow text',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    primaryColor: '&H0000FFFF',
    outlinePx: 3.6,
    shadowPx: 1.5,
  },
  {
    id: 'noto_sans_cyan_white',
    label: 'Noto Sans Cyan text + White stroke',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    primaryColor: '&H00FFFF00',
    outlineColor: '&H00FFFFFF',
    outlinePx: 3.6,
    shadowPx: 1.5,
  },
  {
    id: 'noto_sans_white_purple',
    label: 'Noto Sans White text + Purple stroke',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    primaryColor: '&H00FFFFFF',
    outlineColor: '&H00F0435A',
    outlinePx: 4.0,
    shadowPx: 0.3,
    charSpacing: 4,
  },
  {
    id: 'bizudp_gothic_red_white',
    label: 'BIZ UDPGothic Red text + White stroke',
    fontRelPath: 'fonts/BIZUDPGothic-Regular.ttf',
    fontAssName: 'BIZ UDPGothic',
    primaryColor: '&H00250BB8',
    outlineColor: '&H00FFFFFF',
    outlinePx: 5.5,
    shadowPx: 0.3,
    charSpacing: 4,
  },
  {
    id: 'zen_kaku_blue_white',
    label: 'Zen Kaku Blue text + White stroke',
    fontRelPath: 'fonts/ZenKakuGothicNew-Regular.ttf',
    fontAssName: 'Zen Kaku Gothic New',
    primaryColor: '&H00F0A843',
    outlineColor: '&H00FFFFFF',
    outlinePx: 2.4,
    shadowPx: 1.5,
    charSpacing: 2,
  },
  {
    id: 'serif_white_purple',
    label: 'Noto Serif White text + Purple stroke',
    fontRelPath: 'fonts/NotoSerifJP-SemiBold.ttf',
    fontAssName: 'Noto Serif JP',
    primaryColor: '&H00FFFFFF',
    outlineColor: '&H00F0435A',
    outlinePx: 4.0,
    shadowPx: 0.3,
    charSpacing: 4,
  },
  {
    id: 'serif_yellow',
    label: 'Noto Serif Yellow text',
    fontRelPath: 'fonts/NotoSerifJP-SemiBold.ttf',
    fontAssName: 'Noto Serif JP',
    primaryColor: '&H0000FFFF',
    outlinePx: 4.0,
    shadowPx: 0.3,
    charSpacing: 4,
  },
  {
    id: 'serif_cyan_white',
    label: 'Noto Serif Cyan text + White stroke',
    fontRelPath: 'fonts/NotoSerifJP-SemiBold.ttf',
    fontAssName: 'Noto Serif JP',
    primaryColor: '&H00FFFF00',
    outlineColor: '&H00FFFFFF',
    outlinePx: 3.6,
    shadowPx: 1.5,
    charSpacing: 4,
  },
  {
    id: 'serif_red_white',
    label: 'Noto Serif Red text + White stroke',
    fontRelPath: 'fonts/NotoSerifJP-SemiBold.ttf',
    fontAssName: 'Noto Serif JP',
    primaryColor: '&H00250BB8',
    outlineColor: '&H00FFFFFF',
    outlinePx: 4.0,
    shadowPx: 0.3,
    charSpacing: 4,
  },
];

export const CAPTION_STYLE_PRESETS: Record<CaptionStyleKey, CaptionStylePreset> = {
  default: {
    key: 'default',
    label: 'Default',
    fontRelPath: 'fonts/NotoSansJP-Black.ttf',
    fontAssName: 'Noto Sans JP Black',
    fontSize: CAPTION_FONT_SIZE_WITH_BOX,
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
    fontSize: CAPTION_FONT_SIZE_WITH_BOX,
    primaryColor: '&H00FFFFFF',
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
    fontSize: CAPTION_FONT_SIZE_WITH_BOX,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: true,
    outlinePx: 5.5,
    shadowPx: 0.3,
  },
  noto_serif: {
    key: 'noto_serif',
    label: 'Noto Serif',
    fontRelPath: 'fonts/NotoSerifJP-SemiBold.ttf',
    fontAssName: 'Noto Serif JP',
    fontSize: CAPTION_FONT_SIZE_WITHOUT_BOX,
    primaryColor: '&H00FFFFFF',
    showBackgroundBox: false,
    outlinePx: 4.0,
    shadowPx: 0.3,
    charSpacing: 4,
  },
  ...(presetsFromPairs(...CAPTION_STYLE_DUAL_BASES) as Record<CaptionStyleDualBaseId | `${CaptionStyleDualBaseId}_box`, CaptionStylePreset>),
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
