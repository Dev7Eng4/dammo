/** Subdirectory under workDir for AI slideshow source images. */
export const AI_SLIDES_DIRNAME = 'ai-slides';

export const AI_VIDEO_MIN_SLIDES = 5;
export const AI_VIDEO_MAX_SLIDES = 12;
export const AI_VIDEO_DEFAULT_SLIDES = 8;

export const AI_SLIDESHOW_RAW_BASENAME = 'slideshow_raw';

export interface AiVideoDensityTier {
  maxDurationSec?: number;
  highDensity: number;
  mediumDensity: number;
  lowDensity: number;
}

export const AI_VIDEO_DENSITY_TIERS: AiVideoDensityTier[] = [
  { maxDurationSec: 600, highDensity: 50, mediumDensity: 20, lowDensity: 30 },
  { maxDurationSec: 1200, highDensity: 40, mediumDensity: 30, lowDensity: 30 },
  { maxDurationSec: 3600, highDensity: 30, mediumDensity: 20, lowDensity: 50 },
  { highDensity: 20, mediumDensity: 30, lowDensity: 50 },
];

export const AI_VIDEO_DENSITY_MAX_SCENE_SEC = {
  high: 8,
  medium: 30,
  low: 60,
} as const;

export type AiVideoDensityLevel = keyof typeof AI_VIDEO_DENSITY_MAX_SCENE_SEC;

/** Max span per LLM transcript chunk (5 minutes). */
export const AI_VIDEO_TRANSCRIPT_CHUNK_MAX_SEC = 300;

export const VIDEO_IMAGE_PROMPT_KEY = 'video_image';

export const AI_SCENE_PROMPTS_FILENAME = 'ai-scene-prompts.json';

/** Max scenes per Flow tool batch call (mavid editor). */
export const AI_FLOW_TOOL_BATCH_SIZE = 10;
