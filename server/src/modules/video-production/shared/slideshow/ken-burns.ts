import type { EasingType, FitMode, FocalPoint, KenBurnsEffect } from './slideshow.types.js';
import { SS_PIXEL_FORMAT } from './slideshow.constants.js';

export interface KenBurnsFilterOptions {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  /** Internal upscale multiplier (works around zoompan jitter bug #4298). */
  tempScaleFactor: number;
  fit: FitMode;
}

export interface AdaptKenBurnsOptions {
  width: number;
  height: number;
  fps: number;
  tempScaleFactor: number;
  /** Minimum average crop travel on the supersampled canvas (px/frame). */
  minPxPerFrame?: number;
  /** Use linear easing when duration exceeds this (seconds). */
  longSlideLinearSec?: number;
  maxZoom?: number;
  focalMin?: number;
  focalMax?: number;
}

const DEFAULT_MIN_PX_PER_FRAME = 1.75;
const DEFAULT_LONG_SLIDE_LINEAR_SEC = 20;
const DEFAULT_MAX_ZOOM = 1.55;
const DEFAULT_FOCAL_MIN = 0.2;
const DEFAULT_FOCAL_MAX = 0.8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampFocal(point: FocalPoint, min: number, max: number): FocalPoint {
  return { x: clamp(point.x, min, max), y: clamp(point.y, min, max) };
}

/**
 * Scales pan/zoom amplitude so average crop travel on the supersampled canvas
 * stays above ~minPxPerFrame. Slow motion below that threshold triggers zoompan
 * integer hold-and-jump (#4298). Long slides also switch to linear easing.
 */
export function adaptKenBurnsForDuration(
  effect: KenBurnsEffect,
  durationSec: number,
  opts: AdaptKenBurnsOptions,
): KenBurnsEffect {
  const minPx = opts.minPxPerFrame ?? DEFAULT_MIN_PX_PER_FRAME;
  const longLinearSec = opts.longSlideLinearSec ?? DEFAULT_LONG_SLIDE_LINEAR_SEC;
  const maxZoom = opts.maxZoom ?? DEFAULT_MAX_ZOOM;
  const focalMin = opts.focalMin ?? DEFAULT_FOCAL_MIN;
  const focalMax = opts.focalMax ?? DEFAULT_FOCAL_MAX;

  const frames = Math.max(1, Math.round(opts.fps * durationSec) - 1);
  const uw = opts.width * opts.tempScaleFactor;
  const uh = opts.height * opts.tempScaleFactor;

  const dx = effect.to.x - effect.from.x;
  const dy = effect.to.y - effect.from.y;
  const panTravel = Math.hypot(dx * uw, dy * uh);

  const z0 = Math.max(1, effect.zoomStart);
  const z1 = Math.max(1, effect.zoomEnd);
  const zoomTravel = Math.abs(uw / z0 - uw / z1);

  // Pan moves the crop window; zoom changes its size — take the stronger signal.
  const travel = Math.max(panTravel, zoomTravel);
  const pxPerFrame = travel / frames;

  let next: KenBurnsEffect = { ...effect, from: { ...effect.from }, to: { ...effect.to } };

  if (pxPerFrame < minPx && travel > 0) {
    const boost = minPx / pxPerFrame;
    const midX = (effect.from.x + effect.to.x) / 2;
    const midY = (effect.from.y + effect.to.y) / 2;
    next.from = clampFocal(
      { x: midX - (dx / 2) * boost, y: midY - (dy / 2) * boost },
      focalMin,
      focalMax,
    );
    next.to = clampFocal(
      { x: midX + (dx / 2) * boost, y: midY + (dy / 2) * boost },
      focalMin,
      focalMax,
    );

    const zoomMid = (effect.zoomStart + effect.zoomEnd) / 2;
    const zoomHalf = ((effect.zoomEnd - effect.zoomStart) / 2) * boost;
    next.zoomStart = clamp(zoomMid - zoomHalf, 1, maxZoom);
    next.zoomEnd = clamp(zoomMid + zoomHalf, 1, maxZoom);
  } else if (pxPerFrame < minPx && travel === 0) {
    // Static-like preset on a long slide: inject a mild zoom so motion has room.
    next.zoomStart = 1;
    next.zoomEnd = clamp(1 + (minPx * frames) / uw, 1, maxZoom);
  }

  if (durationSec > longLinearSec) {
    next.easing = 'linear';
  }

  return next;
}

/**
 * Builds an ffmpeg expression that maps a normalized progress expression `p`
 * (0..1 over the clip) through the requested easing curve. Result stays within
 * [0, 1]. All commas live inside single-quoted zoompan args so they don't need
 * filtergraph escaping.
 */
function easeExpr(easing: EasingType, p: string): string {
  if (easing === 'easeInOut') {
    // Standard cubic-ish ease-in-out: 2p^2 for p<0.5, else 1-((-2p+2)^2)/2.
    return `if(lt(${p},0.5),2*(${p})*(${p}),1-pow(-2*(${p})+2,2)/2)`;
  }
  return p;
}

/**
 * Fit the (upscaled) source to fill the working canvas so zoompan always has a
 * full frame to crop from.
 */
function fitFilter(uw: number, uh: number, fit: FitMode): string {
  if (fit === 'contain') {
    return `scale=${uw}:${uh}:force_original_aspect_ratio=decrease,pad=${uw}:${uh}:(ow-iw)/2:(oh-ih)/2:color=black`;
  }
  return `scale=${uw}:${uh}:force_original_aspect_ratio=increase,crop=${uw}:${uh}`;
}

/**
 * Builds the full `-vf` filter chain for a single slide.
 *
 * Pipeline: upscale+fit to (W*F x H*F) -> zoompan (zoom/pan with easing,
 * outputting W x H so the discrete pixel steps become sub-pixel) -> setsar +
 * pixel format. Pass `effect = undefined` for a static frame.
 */
export function buildSlideVideoFilter(
  effect: KenBurnsEffect | undefined,
  opts: KenBurnsFilterOptions,
): string {
  const { width: w, height: h, fps, durationSec, tempScaleFactor, fit } = opts;
  const uw = Math.round(w * tempScaleFactor);
  const uh = Math.round(h * tempScaleFactor);
  const totalFrames = Math.max(1, Math.round(fps * durationSec));

  const pre = fitFilter(uw, uh, fit);
  const post = `setsar=1,format=${SS_PIXEL_FORMAT}`;

  if (!effect) {
    // Static slide: just downscale the working canvas to output size.
    return `${pre},scale=${w}:${h},${post}`;
  }

  const p = totalFrames > 1 ? `on/${totalFrames - 1}` : '0';
  const ease = easeExpr(effect.easing, p);

  const dz = effect.zoomEnd - effect.zoomStart;
  const dfx = effect.to.x - effect.from.x;
  const dfy = effect.to.y - effect.from.y;

  const zExpr = `max(1,${effect.zoomStart}+(${dz})*(${ease}))`;
  const fxExpr = `${effect.from.x}+(${dfx})*(${ease})`;
  const fyExpr = `${effect.from.y}+(${dfy})*(${ease})`;

  // Crop window top-left, centered on the (animated) focal point, clamped so it
  // never leaves the frame. `zoom` here is the per-frame value computed by `z`.
  const xExpr = `max(0,min(iw-iw/zoom,iw*(${fxExpr})-iw/zoom/2))`;
  const yExpr = `max(0,min(ih-ih/zoom,ih*(${fyExpr})-ih/zoom/2))`;

  const zoompan =
    `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':` +
    `d=${totalFrames}:s=${w}x${h}:fps=${fps}`;

  return `${pre},${zoompan},${post}`;
}
