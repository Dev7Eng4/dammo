import { env } from '../../../../config/env.js';
import { resolveFfmpegHwEncoder } from '../../../../infrastructure/ffmpeg/ffmpeg-encoder.js';

/**
 * Slideshow effect library constants.
 * Horizontal canvas, image-only output (no audio in this phase).
 */
export const SS_CANVAS_W = 1920;
export const SS_CANVAS_H = 1080;
export const SS_FPS = 30;

/** Default visible duration per slide (seconds), before transition overlap. */
export const SS_DEFAULT_SLIDE_DURATION = 5;
/** Default cross-transition duration (seconds) between two slides. */
export const SS_DEFAULT_TRANSITION_DURATION = 1;

/** Global switch for Ken Burns pan/zoom on slideshow images. */
export const SS_ENABLE_KEN_BURNS = true;

/** Global switch for transitions between slideshow images. */
export const SS_ENABLE_IMAGE_TRANSITIONS = true;

/** Ken Burns animation runs at most this many seconds; the slide holds the final frame after. */
export const SS_MAX_KEN_BURNS_ANIMATION_SEC = 30;

/**
 * Internal upscale multiplier applied before zoompan, then scaled back to the
 * output resolution. Higher = smoother sub-pixel Ken Burns motion (works around
 * the zoompan rounding/jitter bug #4298) at the cost of memory. 4-8 work well.
 */
export const SS_TEMP_SCALE_FACTOR = 4;

/** Parallel FFmpeg workers when rendering Ken Burns slide clips. */
export const SS_CLIP_RENDER_CONCURRENCY = 4;

const SS_CLIP_RENDER_CONCURRENCY_MIN = 1;
const SS_CLIP_RENDER_LIMITS = {
  cpu: { default: 4, max: 8 },
  intel: { default: 3, max: 4 },
  nvidia: { default: 3, max: 4 },
  /** AMF can deadlock when too many encoder sessions run concurrently. */
  amd: { default: 2, max: 3 },
} as const;

/** Encoder settings for intermediate per-slide clips (kept high quality). */
export const SS_CLIP_CRF = 18;
export const SS_CLIP_PRESET = 'veryfast';

/** Encoder settings for the final concatenated video. */
export const SS_FINAL_CRF = 20;
export const SS_FINAL_PRESET = 'medium';

export const SS_PIXEL_FORMAT = 'yuv420p';

/** Default basename of the produced slideshow video (without extension). */
export const SS_OUTPUT_VIDEO_BASENAME = 'slideshow';

/** Sub-directory name used for cached intermediate clips. */
export const SS_CACHE_DIRNAME = '.slideshow-cache';

export function resolveSlideshowClipConcurrency(): number {
  const encoder = resolveFfmpegHwEncoder();
  const limits = SS_CLIP_RENDER_LIMITS[encoder];
  const raw = env.slideshowClipConcurrency ?? limits.default;
  const requested = Number.isFinite(raw) ? Math.floor(raw) : limits.default;
  return Math.min(limits.max, Math.max(SS_CLIP_RENDER_CONCURRENCY_MIN, requested));
}
