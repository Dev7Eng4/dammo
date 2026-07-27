/** Canvas + stock pipeline (ported from oldversion STOCK_VIDEO). */
export const SI_CANVAS_W = 1280;
export const SI_CANVAS_H = 720;
export const SI_FPS = 30;

export const SI_STOCK_SKIP_START_SEC = 120;
export const SI_STOCK_SKIP_END_SEC = 120;
export const SI_STOCK_SLOWMO_FACTOR = 2;
export const SI_STOCK_ZOOM_FACTOR = 1.4;
export const SI_STOCK_RENDER_EXTRA_SEC = 2;

/** Local stock prepare (`prepare:si-local-stock`): cut / zoom / slowmo trên video thô. */
export const SI_LOCAL_STOCK_SKIP_START_SEC = 0;
export const SI_LOCAL_STOCK_SKIP_END_SEC = 0;
export const SI_LOCAL_STOCK_SLOWMO_FACTOR = 1.5;
export const SI_LOCAL_STOCK_ZOOM_FACTOR = 1.2;

export { YOUTUBE_VIDEO_DOWNLOAD_FORMATS as SI_STOCK_DOWNLOAD_FORMATS } from '../../../../infrastructure/youtube/youtube-download.constants.js';

export const SI_STOCK_MAX_SELECT_ATTEMPTS = 3;

export const SI_CENTER_IMAGE_WIDTH_RATIO = 0.65;
export const SI_CENTER_IMAGE_OPACITY = 0.7;
/** Khoảng cách từ mép trên canvas tới mép trên center image (px). */
export const SI_CENTER_IMAGE_MARGIN_TOP_PX = 15;
/** Dịch center image sang phải khi bật Audio Bar (px, cộng vào vị trí căn giữa). */
export const SI_CENTER_IMAGE_AUDIO_BAR_OFFSET_X_PX = 100;

/** Folder ảnh nguồn cho SI `multi_image` (dưới workDir / videoId). */
export const SI_MULTI_IMAGE_DIRNAME = 'images';
/** Thời lượng mỗi ảnh trong slideshow center (giây). */
export const SI_MULTI_IMAGE_DURATION_SEC = 30;
/** Basename video slideshow tạm (không kèm extension). */
export const SI_MULTI_IMAGE_SLIDESHOW_BASENAME = 'center_slideshow';
/** Kích thước render slideshow = đúng khung center image (ratio 0.65, 16:9, chẵn). */
export const SI_CENTER_VIDEO_W = Math.round(SI_CANVAS_W * SI_CENTER_IMAGE_WIDTH_RATIO);
export const SI_CENTER_VIDEO_H = Math.round((SI_CENTER_VIDEO_W * 9) / 16);
export const SI_STOCK_DIM_FACTOR = 0.8;
export const SI_NOISE_ALPHA = 0.6;

export const SI_STOCK_OVERLAY_PTS_MULT = 3;
export const SI_STOCK_OVERLAY_ZOOM = 1.4;
export const SI_STOCK_OVERLAY_OPACITY = 0.5;

export const SI_SUBTITLE_FONT_SIZE = 90;
export const SI_SUBTITLE_LINE_GAP_PX = 0;
export const SI_SUBTITLE_PADDING_HORIZONTAL = 0;
export const SI_SUBTITLE_MARGIN_BOTTOM_PX = 0;
/** Margin bottom cho caption không có nền xám (px). */
export const SI_SUBTITLE_NO_BACKGROUND_MARGIN_BOTTOM_PX = 40;
export const SI_SUBTITLE_BOX_OPACITY = 0.5;
export const SI_SUBTITLE_CHAR_SPACING = 0;
export const SI_SUBTITLE_FONT_ASS_NAME = 'Noto Sans JP Black';

/** Top-left disclaimer overlay (first N seconds of assembled video). */
export const SI_DISCLAIMER_DURATION_SEC = 5;
export const SI_DISCLAIMER_FONT_SIZE = 20;
export const SI_DISCLAIMER_MARGIN_LEFT_PX = 20;
export const SI_DISCLAIMER_MARGIN_TOP_PX = 20;
export const SI_DISCLAIMER_OPACITY = 0.9;
/** #D9D9D9 @ SI_DISCLAIMER_OPACITY → ASS &HAABBGGRR (alpha = round((1-opacity)*255)=0x19). */
export const SI_DISCLAIMER_PRIMARY_COLOR = '&H19D9D9D9';
export const SI_DISCLAIMER_TEXT =
  '【免責事項】\\N本動画の情報は一般知識の共有であり、医学的アドバイスではありません。健康状態や摂取については、必ず医師にご相談ください。';

export const SI_AUDIO_SPEED_MIN = 0.95;
export const SI_AUDIO_SPEED_MAX = 0.98;

export const SI_AUDIO_BAR_WIDTH_PX = 250;
export const SI_AUDIO_BAR_MARGIN_LEFT_PX = 25;
export const SI_AUDIO_BAR_OFFSET_Y_PX = 60;
export const SI_AUDIO_BAR_COLORKEY = '0x000000';
export const SI_AUDIO_BAR_COLORKEY_SIMILARITY = 0.1;
export const SI_AUDIO_BAR_COLORKEY_BLEND = 0.1;

export const SI_SMALL_VIDEO_W = 250;
export const SI_SMALL_VIDEO_H = 150;
export const SI_SMALL_VIDEO_OVERLAY_X = 25;
export const SI_SMALL_VIDEO_OVERLAY_Y = 25;

export const SI_OUTPUT_VIDEO_BASENAME = 'video';

/** Minimum target duration for one local-stock concat cycle before stream_loop in merge. */
export const SI_LOCAL_CYCLE_TARGET_SEC = 120;

/** UI sentinel value for the Local background footage option. */
export const SI_LOCAL_STOCK_SENTINEL = '__local__';

export type SiBackgroundFootageMode = 'source' | 'local';

export function resolveSiSubtitleMarginBottomPx(showBackgroundBox: boolean): number {
  return showBackgroundBox ? SI_SUBTITLE_MARGIN_BOTTOM_PX : SI_SUBTITLE_NO_BACKGROUND_MARGIN_BOTTOM_PX;
}

export function resolveRandomSiAudioSpeed(): number {
  return SI_AUDIO_SPEED_MIN + Math.random() * (SI_AUDIO_SPEED_MAX - SI_AUDIO_SPEED_MIN);
}

export function resolveSiCenterImageOverlayX(shiftRight: boolean): string {
  const centerX = '(main_w-overlay_w)/2';
  if (!shiftRight) return centerX;
  return `${centerX}+${SI_CENTER_IMAGE_AUDIO_BAR_OFFSET_X_PX}`;
}

export function getSiEffectiveStockDuration(durationSec: number | undefined): number {
  const n = Number(durationSec);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const usable = Math.max(0, n - SI_STOCK_SKIP_START_SEC - SI_STOCK_SKIP_END_SEC);
  return usable * SI_STOCK_SLOWMO_FACTOR;
}
