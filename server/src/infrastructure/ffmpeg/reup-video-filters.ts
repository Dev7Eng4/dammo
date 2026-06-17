import {
  REUP_VIDEO_BLUR_PERCENT,
  REUP_VIDEO_CROP_PERCENT,
} from '../../modules/youtube-channels/reup-video.constants.js';

/**
 * Crop keeps the center region after removing cropPercent from each axis.
 * blurPercent maps to gblur sigma relative to the shorter post-crop edge.
 */
export function buildReupVideoFilterGraph(
  blurPercent: number = REUP_VIDEO_BLUR_PERCENT,
  cropPercent: number = REUP_VIDEO_CROP_PERCENT,
): string {
  const keepRatio = (100 - cropPercent) / 100;
  const crop = `crop=iw*${keepRatio}:ih*${keepRatio}:(iw-ow)/2:(ih-oh)/2`;
  const blurSigma = `max(1\\,min(iw\\,ih)*${blurPercent}/1000)`;
  const blur = `gblur=sigma=${blurSigma}`;
  return `${crop},${blur}`;
}
