/** Canvas + stock pipeline (ported from oldversion STOCK_VIDEO). */
export const SI_CANVAS_W = 1280;
export const SI_CANVAS_H = 720;
export const SI_FPS = 30;

export const SI_STOCK_SKIP_START_SEC = 120;
export const SI_STOCK_SKIP_END_SEC = 120;
export const SI_STOCK_SLOWMO_FACTOR = 2;
export const SI_STOCK_ZOOM_FACTOR = 1.4;
export const SI_STOCK_RENDER_EXTRA_SEC = 2;

export const SI_CENTER_IMAGE_WIDTH_RATIO = 0.9;
export const SI_CENTER_IMAGE_OPACITY = 0.85;
export const SI_STOCK_DIM_FACTOR = 0.8;
export const SI_NOISE_ALPHA = 0.6;

export const SI_STOCK_OVERLAY_PTS_MULT = 3;
export const SI_STOCK_OVERLAY_ZOOM = 1.4;
export const SI_STOCK_OVERLAY_OPACITY = 0.5;

export const SI_SUBTITLE_FONT_SIZE = 90;
export const SI_SUBTITLE_LINE_GAP_PX = 0;
export const SI_SUBTITLE_PADDING_HORIZONTAL = 0;
export const SI_SUBTITLE_MARGIN_BOTTOM_PX = 40;
export const SI_SUBTITLE_BOX_OPACITY = 0.5;
export const SI_SUBTITLE_CHAR_SPACING = 0;
export const SI_SUBTITLE_FONT_ASS_NAME = 'Noto Sans JP Black';

export const SI_AUDIO_SPEED_MIN = 0.91;
export const SI_AUDIO_SPEED_MAX = 0.95;

export const SI_OUTPUT_VIDEO_BASENAME = 'video';

export function resolveRandomSiAudioSpeed(): number {
  return SI_AUDIO_SPEED_MIN + Math.random() * (SI_AUDIO_SPEED_MAX - SI_AUDIO_SPEED_MIN);
}

export function getSiEffectiveStockDuration(durationSec: number | undefined): number {
  const n = Number(durationSec);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const usable = Math.max(0, n - SI_STOCK_SKIP_START_SEC - SI_STOCK_SKIP_END_SEC);
  return usable * SI_STOCK_SLOWMO_FACTOR;
}
