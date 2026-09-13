import type { EasingType, FitMode, FocalPoint, KenBurnsEffect } from './slideshow.types.js';
import { SS_MAX_KEN_BURNS_ANIMATION_SEC, SS_PIXEL_FORMAT } from './slideshow.constants.js';

export interface KenBurnsFilterOptions {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  /** Internal upscale multiplier (works around zoompan jitter bug #4298). */
  tempScaleFactor: number;
  fit: FitMode;
  /** Max Ken Burns animation window (seconds). Defaults to SS_MAX_KEN_BURNS_ANIMATION_SEC. */
  maxKenBurnsAnimationSec?: number;
}

/** Seconds over which Ken Burns progress runs (capped by maxKenBurnsAnimationSec). */
export function resolveKenBurnsAnimationSec(
  durationSec: number,
  maxAnimationSec = SS_MAX_KEN_BURNS_ANIMATION_SEC,
): number {
  return Math.min(durationSec, maxAnimationSec);
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
 * Normalised focal range the crop window can actually reach at `zoom`.
 *
 * zoompan crops `1/zoom` of the frame centred on the focal point, so the centre
 * can never get closer to an edge than half a crop. Asking for more than this
 * does not pan further — `buildSlideVideoFilter` clamps the crop origin, so the
 * slide sits motionless at the end of its travel for however long the focal
 * point stays out of range. At zoom 1.3 the reachable band is only
 * [0.385, 0.615], which is narrower than the default [0.2, 0.8] guard.
 */
function reachableFocalBand(zoom: number): { min: number; max: number } {
  const half = 1 / (2 * Math.max(1, zoom));
  return { min: half, max: 1 - half };
}

/** Crop travel (supersampled px) the effect actually produces per frame. */
function pxPerFrameOf(effect: KenBurnsEffect, uw: number, uh: number, frames: number): number {
  const panTravel = Math.hypot((effect.to.x - effect.from.x) * uw, (effect.to.y - effect.from.y) * uh);
  const zoomTravel = Math.abs(uw / Math.max(1, effect.zoomStart) - uw / Math.max(1, effect.zoomEnd));
  return Math.max(panTravel, zoomTravel) / frames;
}

/**
 * Scales pan/zoom amplitude so average crop travel on the supersampled canvas
 * stays above ~minPxPerFrame. Slow motion below that threshold triggers zoompan
 * integer hold-and-jump (#4298). Long slides also switch to linear easing.
 *
 * The amplitude it asks for has to be amplitude the crop can actually deliver:
 * every focal point is bounded by {@link reachableFocalBand} for the zoom it is
 * held at, and any travel the pan cannot supply within that band is taken from
 * the zoom instead — which has no such ceiling. This also covers presets that
 * start with no motion at all.
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

  /*
   * Never ask a focal point to leave the band the crop can reach at the zoom it
   * is held at — boosted or not, since a preset can overshoot on its own.
   * Outside the band the crop origin is pinned and the slide sits motionless at
   * the end of its travel instead of arriving there.
   *
   * Each endpoint is bounded by its own zoom, not by the tightest of the two: a
   * zoom-in-and-drift preset legitimately starts at zoom 1 (where nothing can
   * pan) and only earns room to move as it zooms in.
   */
  const bandAt = (zoom: number) => {
    const reachable = reachableFocalBand(zoom);
    return { lo: Math.max(focalMin, reachable.min), hi: Math.min(focalMax, reachable.max) };
  };
  const clampEndpoints = (): void => {
    const start = bandAt(next.zoomStart);
    const end = bandAt(next.zoomEnd);
    next.from = clampFocal(next.from, start.lo, start.hi);
    next.to = clampFocal(next.to, end.lo, end.hi);
  };

  clampEndpoints();

  if (pxPerFrame < minPx && travel > 0) {
    const boost = minPx / pxPerFrame;
    const midX = (next.from.x + next.to.x) / 2;
    const midY = (next.from.y + next.to.y) / 2;
    const bdx = next.to.x - next.from.x;
    const bdy = next.to.y - next.from.y;
    next.from = { x: midX - (bdx / 2) * boost, y: midY - (bdy / 2) * boost };
    next.to = { x: midX + (bdx / 2) * boost, y: midY + (bdy / 2) * boost };

    const zoomMid = (effect.zoomStart + effect.zoomEnd) / 2;
    const zoomHalf = ((effect.zoomEnd - effect.zoomStart) / 2) * boost;
    next.zoomStart = clamp(zoomMid - zoomHalf, 1, maxZoom);
    next.zoomEnd = clamp(zoomMid + zoomHalf, 1, maxZoom);

    clampEndpoints();
  }

  /*
   * Whatever the pan could not deliver — because the band is narrow, or the
   * preset never panned at all — comes out of the zoom, which has no such
   * ceiling. This replaces the old static-only branch: a clamped pan needs the
   * same treatment as a preset that starts with no motion.
   */
  if (pxPerFrameOf(next, uw, uh, frames) < minPx) {
    const neededTravel = minPx * frames;
    const zLo = Math.max(1, Math.min(next.zoomStart, next.zoomEnd));
    const zHi = clamp(1 / Math.max(1e-6, 1 / zLo - neededTravel / uw), zLo, maxZoom);

    if (next.zoomEnd >= next.zoomStart) {
      next.zoomStart = zLo;
      next.zoomEnd = zHi;
    } else {
      next.zoomStart = zHi;
      next.zoomEnd = zLo;
    }

    // Widening the zoom moves each endpoint's band; re-clamp against the new one.
    clampEndpoints();
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
 * Extra hold appended beyond the frozen tail. The renderer's `-t` trims to the
 * exact length, so overshooting by a fraction of a second is free insurance
 * against `tpad` landing a frame short.
 */
const HOLD_PAD_MARGIN_SEC = 0.5;

/**
 * Clone the last rendered frame for `tailSec` instead of asking zoompan to
 * recompute an identical crop for every frame of a motionless tail.
 *
 * The leading `fps` is required, not cosmetic: after `zoompan` the timebase
 * leaves `tpad` unable to convert `stop_duration` into frames, and it pads two
 * frames regardless of the value asked for.
 */
function holdFilter(fps: number, tailSec: number): string {
  const holdSec = (tailSec + HOLD_PAD_MARGIN_SEC).toFixed(4);
  return `fps=${fps},tpad=stop_mode=clone:stop_duration=${holdSec}`;
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
 *
 * The chain always expands a *single* input frame to the full slide length, so
 * the renderer must not pass `-loop 1` — a looping input would make zoompan
 * restart its animation once `d` frames are exhausted.
 */
export function buildSlideVideoFilter(
  effect: KenBurnsEffect | undefined,
  opts: KenBurnsFilterOptions,
): string {
  const { width: w, height: h, fps, durationSec, tempScaleFactor, fit } = opts;
  const maxAnimSec = opts.maxKenBurnsAnimationSec ?? SS_MAX_KEN_BURNS_ANIMATION_SEC;
  const animDurationSec = resolveKenBurnsAnimationSec(durationSec, maxAnimSec);
  const uw = Math.round(w * tempScaleFactor);
  const uh = Math.round(h * tempScaleFactor);
  const totalFrames = Math.max(1, Math.round(fps * durationSec));
  const animFrames = Math.max(1, Math.round(fps * animDurationSec));

  const pre = fitFilter(uw, uh, fit);
  const post = `setsar=1,format=${SS_PIXEL_FORMAT}`;

  if (!effect) {
    // Static slide: downscale one frame, then hold it for the whole duration.
    return `${pre},scale=${w}:${h},${holdFilter(fps, durationSec)},${post}`;
  }

  const p = animFrames > 1 ? `min(on/${animFrames - 1}\\,1)` : '0';
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

  /*
   * Render only the animated window. Past `animFrames` the eased progress is
   * pinned at 1, so every further frame is an identical crop of a 50-megapixel
   * canvas — on a 60s slide capped at 30s of motion that is half the work for
   * no visible difference. Clone the tail instead.
   */
  const tailSec = durationSec - animDurationSec;
  const hasFrozenTail = tailSec > 1 / fps;
  const zoompanFrames = hasFrozenTail ? animFrames : totalFrames;

  const zoompan =
    `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':` +
    `d=${zoompanFrames}:s=${w}x${h}:fps=${fps}`;

  if (!hasFrozenTail) {
    return `${pre},${zoompan},${post}`;
  }

  return `${pre},${zoompan},${holdFilter(fps, tailSec)},${post}`;
}
