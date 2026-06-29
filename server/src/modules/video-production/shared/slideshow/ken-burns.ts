import type { EasingType, FitMode, KenBurnsEffect } from './slideshow.types.js';
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
