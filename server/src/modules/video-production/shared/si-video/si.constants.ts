import { CANVAS_W } from '../render-core/canvas.constants.js';

/** @deprecated Import from `../stock-background` instead. */
export {
  STOCK_SKIP_START_SEC as SI_STOCK_SKIP_START_SEC,
  STOCK_SKIP_END_SEC as SI_STOCK_SKIP_END_SEC,
  STOCK_SLOWMO_FACTOR as SI_STOCK_SLOWMO_FACTOR,
  STOCK_ZOOM_FACTOR as SI_STOCK_ZOOM_FACTOR,
  STOCK_RENDER_EXTRA_SEC as SI_STOCK_RENDER_EXTRA_SEC,
  STOCK_CROP_PAN_MIN as SI_STOCK_CROP_PAN_MIN,
  STOCK_CROP_PAN_MAX as SI_STOCK_CROP_PAN_MAX,
  LOCAL_STOCK_SKIP_START_SEC as SI_LOCAL_STOCK_SKIP_START_SEC,
  LOCAL_STOCK_SKIP_END_SEC as SI_LOCAL_STOCK_SKIP_END_SEC,
  LOCAL_STOCK_SLOWMO_FACTOR as SI_LOCAL_STOCK_SLOWMO_FACTOR,
  LOCAL_STOCK_ZOOM_FACTOR as SI_LOCAL_STOCK_ZOOM_FACTOR,
  LOCAL_STOCK_ASSEMBLE_ZOOM_FACTOR as SI_LOCAL_STOCK_ASSEMBLE_ZOOM_FACTOR,
  STOCK_DOWNLOAD_FORMATS as SI_STOCK_DOWNLOAD_FORMATS,
  STOCK_MAX_SELECT_ATTEMPTS as SI_STOCK_MAX_SELECT_ATTEMPTS,
  STOCK_DIM_FACTOR as SI_STOCK_DIM_FACTOR,
  LOCAL_CYCLE_TARGET_SEC as SI_LOCAL_CYCLE_TARGET_SEC,
  LOCAL_STOCK_SENTINEL as SI_LOCAL_STOCK_SENTINEL,
  getEffectiveStockDuration as getSiEffectiveStockDuration,
  type StockBackgroundMode as SiBackgroundFootageMode,
} from '../stock-background/index.js';

export const SI_CENTER_IMAGE_WIDTH_RATIO = 0.65;
/** Random width ratio range around SI_CENTER_IMAGE_WIDTH_RATIO (±0.05). */
export const SI_CENTER_IMAGE_WIDTH_RATIO_MIN = 0.6;
export const SI_CENTER_IMAGE_WIDTH_RATIO_MAX = 0.7;
export const SI_CENTER_IMAGE_OPACITY = 0.7;
/** Opacity for celebrity center slideshow (higher than shared center image). */
export const SI_CELEBRITY_IMAGE_OPACITY = 0.85;
/** Khoảng cách từ mép trên canvas tới mép trên center image (px). */
export const SI_CENTER_IMAGE_MARGIN_TOP_PX = 15;
/** Dịch center image sang phải khi bật Audio Bar (px, cộng vào vị trí căn giữa). */
export const SI_CENTER_IMAGE_AUDIO_BAR_OFFSET_X_PX = 100;

/** Folder ảnh nguồn cho SI `multi_image` (dưới workDir / videoId). */
export const SI_MULTI_IMAGE_DIRNAME = 'images';
/** Thời lượng mỗi ảnh trong slideshow center (giây). */
export const SI_MULTI_IMAGE_DURATION_SEC = 30;

/** Max celebrity images used for SI center slideshow. */
export const SI_CELEBRITY_MAX_IMAGES = 5;
/** Duration per celebrity image in the center frame (seconds). */
export const SI_CELEBRITY_IMAGE_DURATION_SEC = 60;
/** Fade duration between celebrity slides (seconds). */
export const SI_CELEBRITY_TRANSITION_DURATION_SEC = 1;
/** Mild zoom range for celebrity center motion (legacy Ken Burns; pan path uses fit scale). */
export const SI_CELEBRITY_ZOOM_MIN = 1.05;
export const SI_CELEBRITY_ZOOM_MAX = 1.12;
/** Focal jitter away from center (0–0.5); keep small so motion stays gentle. */
export const SI_CELEBRITY_FOCAL_JITTER = 0.12;
/** Extra shrink so cutout can pan inside the box (1 = flush to box edge). */
export const SI_CELEBRITY_FIT_SCALE_MIN = 0.88;

/** Kích thước render slideshow = đúng khung center image (ratio 0.65, 16:9, chẵn). */
export const SI_CENTER_VIDEO_W = Math.round(CANVAS_W * SI_CENTER_IMAGE_WIDTH_RATIO);
export const SI_CENTER_VIDEO_H = Math.round((SI_CENTER_VIDEO_W * 9) / 16);
export const SI_NOISE_ALPHA = 0.6;

export const SI_STOCK_OVERLAY_PTS_MULT = 3;
export const SI_STOCK_OVERLAY_ZOOM = 1.4;
export const SI_STOCK_OVERLAY_OPACITY = 0.5;

export const SI_AUDIO_BAR_WIDTH_PX = 360;
export const SI_AUDIO_BAR_MARGIN_LEFT_PX = 25;
export const SI_AUDIO_BAR_OFFSET_Y_PX = 60;

/** Chroma-key color choice when preparing audioBar / subscribe assets. */
export type SiPrepareKeyColor = 'green' | 'black';
export const SI_PREPARE_COLORKEY_GREEN = '0x00FF00';
export const SI_PREPARE_COLORKEY_BLACK = '0x000000';
export const SI_PREPARE_COLORKEY_GREEN_SIMILARITY = 0.18;
export const SI_PREPARE_COLORKEY_GREEN_BLEND = 0.08;
export const SI_PREPARE_COLORKEY_BLACK_SIMILARITY = 0.12;
export const SI_PREPARE_COLORKEY_BLACK_BLEND = 0.08;

/** Runtime fallback colorkey (green) when asset is not pre-keyed. */
export const SI_AUDIO_BAR_COLORKEY = SI_PREPARE_COLORKEY_GREEN;
export const SI_AUDIO_BAR_COLORKEY_SIMILARITY = SI_PREPARE_COLORKEY_GREEN_SIMILARITY;
export const SI_AUDIO_BAR_COLORKEY_BLEND = SI_PREPARE_COLORKEY_GREEN_BLEND;

export const SI_SMALL_VIDEO_W = 360;
export const SI_SMALL_VIDEO_H = 216;
export const SI_SMALL_VIDEO_OVERLAY_X = 25;
export const SI_SMALL_VIDEO_OVERLAY_Y = 25;
export const SI_SUBSCRIBE_COLORKEY = SI_PREPARE_COLORKEY_GREEN;
export const SI_SUBSCRIBE_COLORKEY_SIMILARITY = SI_PREPARE_COLORKEY_GREEN_SIMILARITY;
export const SI_SUBSCRIBE_COLORKEY_BLEND = SI_PREPARE_COLORKEY_GREEN_BLEND;

/** Random edge inset for movable overlays (subscribe / audioBar / smallVideo). */
export const SI_OVERLAY_EDGE_MARGIN_MIN_PX = 15;
export const SI_OVERLAY_EDGE_MARGIN_MAX_PX = 55;
/** Mid-slot vertical offset from vertical center (replaces fixed +60). */
export const SI_OVERLAY_MID_Y_JITTER_MIN_PX = 20;
export const SI_OVERLAY_MID_Y_JITTER_MAX_PX = 100;
/** Extra upward shift for mid-slot overlays (audioBar / subscribe / smallVideo). */
export const SI_OVERLAY_MID_UPWARD_SHIFT_PX = 100;

/** Even px width/height for center image overlay (ratio jittered per assemble). */
export function resolveRandomSiCenterImageSize(): { width: number; height: number } {
  const ratio = SI_CENTER_IMAGE_WIDTH_RATIO_MIN + Math.random() * (SI_CENTER_IMAGE_WIDTH_RATIO_MAX - SI_CENTER_IMAGE_WIDTH_RATIO_MIN);
  const width = Math.round((CANVAS_W * ratio) / 2) * 2;
  const height = Math.round((width * 9) / 16 / 2) * 2;
  return { width, height };
}

export function resolveSiCenterImageOverlayX(shift: boolean | 'none' | 'left' | 'right' = 'none'): string {
  const centerX = '(main_w-overlay_w)/2';
  const normalized = typeof shift === 'boolean' ? (shift ? 'right' : 'none') : shift;
  if (normalized === 'right') return `${centerX}+${SI_CENTER_IMAGE_AUDIO_BAR_OFFSET_X_PX}`;
  if (normalized === 'left') return `${centerX}-${SI_CENTER_IMAGE_AUDIO_BAR_OFFSET_X_PX}`;
  return centerX;
}
