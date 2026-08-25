/**
 * Canvas, subtitle, disclaimer and overlay constants shared by every assemble
 * path (SI, AI slideshow, and any future variant). Nothing here may depend on a
 * specific video type.
 */

export const CANVAS_W = 1280;
export const CANVAS_H = 720;
export const FPS = 30;

export const SUBTITLE_FONT_SIZE = 90;
export const SUBTITLE_LINE_GAP_PX = 0;
export const SUBTITLE_PADDING_HORIZONTAL = 0;
export const SUBTITLE_MARGIN_BOTTOM_PX = 0;
/** Margin bottom cho caption không có nền xám (px). */
export const SUBTITLE_NO_BACKGROUND_MARGIN_BOTTOM_PX = 40;
export const SUBTITLE_BOX_OPACITY = 0.5;
export const SUBTITLE_CHAR_SPACING = 0;
export const SUBTITLE_FONT_ASS_NAME = 'Noto Sans JP Black';

/** Top-left disclaimer overlay (first N seconds of assembled video). */
export const DISCLAIMER_DURATION_SEC = 5;
export const DISCLAIMER_FONT_SIZE = 20;
export const DISCLAIMER_MARGIN_LEFT_PX = 20;
export const DISCLAIMER_MARGIN_TOP_PX = 20;
export const DISCLAIMER_OPACITY = 0.9;
/** #D9D9D9 @ DISCLAIMER_OPACITY → ASS &HAABBGGRR (alpha = round((1-opacity)*255)=0x19). */
export const DISCLAIMER_PRIMARY_COLOR = '&H19D9D9D9';
export const DISCLAIMER_TEXT =
  '【免責事項】\\N本動画の情報は一般知識の共有であり、医学的アドバイスではありません。健康状態や摂取については、必ず医師にご相談ください。';

export const AUDIO_SPEED_MIN = 0.95;
export const AUDIO_SPEED_MAX = 0.98;

export const CHANNEL_AVATAR_SIZE_PX = 100;
export const CHANNEL_AVATAR_MARGIN_TOP_PX = 30;
export const CHANNEL_AVATAR_MARGIN_RIGHT_PX = 30;
export const CHANNEL_AVATAR_BASENAME = 'avatar';

/** Channel overlay file value: pick a random asset at assemble time. */
export const OVERLAY_AUTO_SENTINEL = '__auto__';

/** Channel small-video value: pick a random clip from a small-video group at assemble time. */
export const SMALL_VIDEO_GROUP_PREFIX = 'group:';

export function parseSmallVideoGroupId(value: string): string | null {
  if (!value.startsWith(SMALL_VIDEO_GROUP_PREFIX)) return null;
  const id = value.slice(SMALL_VIDEO_GROUP_PREFIX.length).trim();
  return id || null;
}

export function encodeSmallVideoGroupSelection(groupId: string): string {
  return `${SMALL_VIDEO_GROUP_PREFIX}${groupId}`;
}

export function resolveSubtitleMarginBottomPx(showBackgroundBox: boolean): number {
  return showBackgroundBox ? SUBTITLE_MARGIN_BOTTOM_PX : SUBTITLE_NO_BACKGROUND_MARGIN_BOTTOM_PX;
}

export function resolveRandomAudioSpeed(): number {
  return AUDIO_SPEED_MIN + Math.random() * (AUDIO_SPEED_MAX - AUDIO_SPEED_MIN);
}
