import {
  REUP_VIDEO_BLUR_PERCENT,
  REUP_VIDEO_CROP_PERCENT,
} from '../../modules/video-production/pipelines/reup-audio/reup-audio.constants.js';

/**
 * Crop keeps the center region after removing cropPercent from each axis.
 * gblur sigma is a fixed float (FFmpeg does not accept iw/ih expressions for sigma).
 */
export function buildReupVideoFilterGraph(
  blurPercent: number = REUP_VIDEO_BLUR_PERCENT,
  cropPercent: number = REUP_VIDEO_CROP_PERCENT,
): string {
  const keepRatio = (100 - cropPercent) / 100;
  const crop = `crop=iw*${keepRatio}:ih*${keepRatio}:(iw-ow)/2:(ih-oh)/2`;
  const sigma = Math.max(1, blurPercent);
  const blur = `gblur=sigma=${sigma}`;
  return `${crop},${blur}`;
}
