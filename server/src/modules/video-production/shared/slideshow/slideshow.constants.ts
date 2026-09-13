import os from 'node:os';
import { env } from '../../../../config/env.js';
import { resolveFfmpegHwEncoder, type FfmpegHwEncoder } from '../../../../infrastructure/ffmpeg/ffmpeg-encoder.js';
import { appSettingsService } from '../../../app-settings/app-settings.service.js';

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

/** @deprecated Prefer isKenBurnsEnabled() — kept as compile-time default only. */
export const SS_ENABLE_KEN_BURNS = true;

/** @deprecated Prefer isImageTransitionsEnabled() — kept as compile-time default only. */
export const SS_ENABLE_IMAGE_TRANSITIONS = true;

/** Runtime switch for Ken Burns pan/zoom on slideshow images. */
export function isKenBurnsEnabled(): boolean {
  return appSettingsService.get().enableKenBurns;
}

/** Runtime switch for transitions between slideshow images. */
export function isImageTransitionsEnabled(): boolean {
  return appSettingsService.get().enableImageTransitions;
}

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

/**
 * Fold clips pairwise instead of threading them through one long xfade chain.
 *
 * A chain of N clips makes every finished frame traverse N-1 xfade instances;
 * a tree cuts that to ceil(log2(N)). Both produce the same timeline — see
 * `buildXfadeTree` and its tests.
 *
 * Off by default because the depth turned out not to matter: composing 48
 * clips into 337s of 1080p measured 123.3s / 123.4s with the chain (depth 47)
 * against 132.9s / 110.4s with the tree (depth 6) — the same within noise,
 * because the cost is in the encoder, not in passing frames down the graph.
 * Kept behind `SLIDESHOW_XFADE_TREE=1` for far longer timelines, where the
 * chain depth grows and this is worth re-measuring.
 */
export const SS_USE_XFADE_TREE = env.slideshowXfadeTree === 1;

/** Share of the machine's cores handed to CPU clip renders. */
const SS_CLIP_CPU_CORE_SHARE = 0.7;

function cpuCount(): number {
  const cores = os.cpus().length;
  return Number.isFinite(cores) && cores > 0 ? cores : 4;
}

/**
 * zoompan has no slice threading, so each CPU clip render is pinned to roughly
 * one core and the only way to use a wide machine is to run more of them at
 * once. Hardware encoders keep their fixed defaults — they are capped by
 * concurrent encoder sessions, not by cores.
 */
function resolveDefaultClipConcurrency(encoder: FfmpegHwEncoder): number {
  const limits = SS_CLIP_RENDER_LIMITS[encoder];
  if (encoder !== 'cpu') return limits.default;
  return Math.min(limits.max, Math.max(2, Math.round(cpuCount() * SS_CLIP_CPU_CORE_SHARE)));
}

export function resolveSlideshowClipConcurrency(): number {
  const encoder = resolveFfmpegHwEncoder();
  const limits = SS_CLIP_RENDER_LIMITS[encoder];
  const fallback = resolveDefaultClipConcurrency(encoder);
  const raw = env.slideshowClipConcurrency ?? fallback;
  const requested = Number.isFinite(raw) ? Math.floor(raw) : fallback;
  return Math.min(limits.max, Math.max(SS_CLIP_RENDER_CONCURRENCY_MIN, requested));
}

/**
 * Without this every parallel libx264 spawns threads for the whole machine, so
 * N concurrent clip renders oversubscribe it N-fold. Split the cores instead.
 * Hardware encoders ignore `-threads`, so they get no flag at all.
 */
export function resolveClipEncoderThreadArgs(): string[] {
  if (resolveFfmpegHwEncoder() !== 'cpu') return [];
  const perProcess = Math.floor(cpuCount() / resolveSlideshowClipConcurrency());
  return ['-threads', String(Math.max(1, Math.min(4, perProcess)))];
}
