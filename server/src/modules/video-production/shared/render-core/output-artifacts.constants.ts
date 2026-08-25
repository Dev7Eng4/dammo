/**
 * Single source of truth for mp4 artifact basenames produced under a video
 * folder. Lives here (not in si-video / ai-video) so that `findFinalVideoMp4`
 * can recognise every intermediate file without either assembler package
 * importing the other.
 */

/** Final uploadable mp4 basename when no metadata title is available. */
export const OUTPUT_VIDEO_BASENAME = 'video';

/** Raw Ken Burns slideshow rendered by the AI assembler before the final mux. */
export const AI_SLIDESHOW_RAW_BASENAME = 'slideshow_raw';

/** Center-frame slideshow rendered for SI `multi_image`. */
export const SI_MULTI_IMAGE_SLIDESHOW_BASENAME = 'center_slideshow';

/** Alpha-preserving celebrity center slideshow (qtrle .mov). */
export const SI_CELEBRITY_SLIDESHOW_BASENAME = 'center_slideshow_celebrity';

/**
 * Intermediate / artifact mp4 basenames (no extension) that must not be treated
 * as the final uploadable video when scanning a video folder.
 */
export const INTERMEDIATE_MP4_BASENAMES: ReadonlySet<string> = new Set([
  AI_SLIDESHOW_RAW_BASENAME,
  SI_MULTI_IMAGE_SLIDESHOW_BASENAME,
  'stock_processed',
  'stock_local_cycle',
  'stock_raw',
]);

export const INTERMEDIATE_MP4_PREFIXES = ['stock_', 'clip_', 'slideshow_'] as const;
