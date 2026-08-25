import { FPS } from '../render-core/canvas.constants.js';
import { SI_SMALL_VIDEO_H, SI_SMALL_VIDEO_W } from './si.constants.js';

/** Scale to fill SI_SMALL_VIDEO box then center-crop so the PiP box is exact. */
export function appendSiSmallVideoScaleFilters(
  filterParts: string[],
  inputLabel: string,
  outputLabel = 'small_video_scaled',
): void {
  filterParts.push(
    `[${inputLabel}]fps=${FPS},scale=${SI_SMALL_VIDEO_W}:${SI_SMALL_VIDEO_H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${SI_SMALL_VIDEO_W}:${SI_SMALL_VIDEO_H}[${outputLabel}]`,
  );
}
