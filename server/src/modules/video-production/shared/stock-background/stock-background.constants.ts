/** Canvas used by stock background prepare / assemble normalize filters. */
export const STOCK_CANVAS_W = 1280;
export const STOCK_CANVAS_H = 720;
export const STOCK_FPS = 30;

export const STOCK_SKIP_START_SEC = 120;
export const STOCK_SKIP_END_SEC = 120;
export const STOCK_SLOWMO_FACTOR = 1.8;
export const STOCK_ZOOM_FACTOR = 1.4;
export const STOCK_RENDER_EXTRA_SEC = 2;

/** Crop pan fraction range around center (0.5 = exact center). */
export const STOCK_CROP_PAN_MIN = 0.35;
export const STOCK_CROP_PAN_MAX = 0.65;

/** Local stock prepare (`prepare:si-local-stock`): cut / zoom / slowmo trên video thô. */
export const LOCAL_STOCK_SKIP_START_SEC = 0;
export const LOCAL_STOCK_SKIP_END_SEC = 0;
export const LOCAL_STOCK_SLOWMO_FACTOR = 1.5;
export const LOCAL_STOCK_ZOOM_FACTOR = 1.2;
/** Extra zoom at local assemble so each video can micro-pan baked clips. */
export const LOCAL_STOCK_ASSEMBLE_ZOOM_FACTOR = 1.08;

export { YOUTUBE_VIDEO_DOWNLOAD_FORMATS as STOCK_DOWNLOAD_FORMATS } from '../../../../infrastructure/youtube/youtube-download.constants.js';

export const STOCK_MAX_SELECT_ATTEMPTS = 3;

export const STOCK_DIM_FACTOR = 0.8;

/** Minimum target duration for one local-stock concat cycle before stream_loop in merge. */
export const LOCAL_CYCLE_TARGET_SEC = 120;

/** UI sentinel value for the Local background footage option. */
export const LOCAL_STOCK_SENTINEL = '__local__';

export type StockBackgroundMode = 'source' | 'local';

export function getEffectiveStockDuration(durationSec: number | undefined): number {
  const n = Number(durationSec);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const usable = Math.max(0, n - STOCK_SKIP_START_SEC - STOCK_SKIP_END_SEC);
  return usable * STOCK_SLOWMO_FACTOR;
}
