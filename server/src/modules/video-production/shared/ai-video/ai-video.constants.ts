import { env } from '../../../../config/env.js';

/** Subdirectory under workDir for AI slideshow source images. */
export const AI_SLIDES_DIRNAME = 'images';

/** Character reference images for useReferenceImage flow. */
export const IMAGE_REFERENCES_DIRNAME = 'image-references';

export const AI_VIDEO_MIN_SLIDES = 5;
export const AI_VIDEO_MAX_SLIDES = 12;
export const AI_VIDEO_DEFAULT_SLIDES = 8;

export const AI_SLIDESHOW_RAW_BASENAME = 'slideshow_raw';

/** AI PiP overlay: top-left small video (distinct from SI 360×216 random slot). */
export const AI_SMALL_VIDEO_W = 100;
export const AI_SMALL_VIDEO_H = 130;
export const AI_SMALL_VIDEO_OPACITY = 0.8;
export const AI_SMALL_VIDEO_SLOW = 1.5;
export const AI_SMALL_VIDEO_OVERLAY_X = 0;
export const AI_SMALL_VIDEO_OVERLAY_Y = 0;

/**
 * Ken Burns internal upscale for AI slideshow. zoompan rounds crop to integer
 * pixels; values below 4 produce visible hold-and-jump on slow pans/zooms.
 * 5 keeps the working canvas above the safe 4x floor while processing about
 * 31% fewer pixels than 6x. Override with AI_SLIDESHOW_TEMP_SCALE_FACTOR.
 */
export const AI_SLIDESHOW_TEMP_SCALE_FACTOR = Math.min(
  8,
  Math.max(4, Math.round(env.aiSlideshowTempScaleFactor ?? 5)),
);

/** Target avg crop travel on the supersampled canvas (mitigates zoompan #4298). */
export const AI_KEN_BURNS_MIN_PX_PER_FRAME = 1.75;

/** Slides longer than this use linear easing (easeInOut stalls near endpoints). */
export const AI_KEN_BURNS_LONG_SLIDE_LINEAR_SEC = 20;

/** Max zoom after duration-adaptive amplitude scaling. */
export const AI_KEN_BURNS_MAX_ZOOM = 1.55;

/** Focal-point clamp so boosted pans keep a valid crop window. */
export const AI_KEN_BURNS_FOCAL_MIN = 0.2;
export const AI_KEN_BURNS_FOCAL_MAX = 0.8;

/**
 * Max seconds the final slide may absorb when the scene timeline is shorter
 * than the audio. Above this the deficit is spread across all slides, since one
 * very long zoompan clip renders far slower than many shorter ones.
 */
export const AI_MAX_LAST_SLIDE_PAD_SEC = 15;

/** Slideshow compose preset for AI path (library default is medium). */
export const AI_SLIDESHOW_FINAL_PRESET = 'fast' as const;

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

export type AiSceneDensityMaxSec = {
  high: number;
  medium: number;
  low: number;
};

/** Merge channel override with defaults (8 / 30 / 60). Invalid values fall back per key. */
export function resolveAiSceneDensityMaxSec(
  override?: Partial<AiSceneDensityMaxSec> | null,
): AiSceneDensityMaxSec {
  const clamp = (value: number | undefined, fallback: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    const rounded = Math.round(value);
    if (rounded < 1 || rounded > 300) return fallback;
    return rounded;
  };

  return {
    high: clamp(override?.high, AI_VIDEO_DENSITY_MAX_SCENE_SEC.high),
    medium: clamp(override?.medium, AI_VIDEO_DENSITY_MAX_SCENE_SEC.medium),
    low: clamp(override?.low, AI_VIDEO_DENSITY_MAX_SCENE_SEC.low),
  };
}

/** Max span per LLM transcript chunk (5 minutes). */
export const AI_VIDEO_TRANSCRIPT_CHUNK_MAX_SEC = 300;

/** SI multi_image / shared scene prompt window (20 minutes). */
export const AI_VIDEO_SI_MULTI_MAX_TRANSCRIPT_SEC = 20 * 60;

/** Character design transcript window when useReferenceImage (25 minutes). */
export const AI_VIDEO_CHARACTER_DESIGN_MAX_TRANSCRIPT_SEC = 25 * 60;

export const VIDEO_IMAGE_PROMPT_KEY = 'image_scenes';
export const VIDEO_IMAGE_WITH_REFERENCE_PROMPT_KEY = 'image_scenes_with_references_step_2';
export const CREATE_CHARACTERS_DESIGN_PROMPT_KEY = 'image_scenes_with_references_step_1';

export const AI_SCENE_PROMPTS_FILENAME = 'ai-scene-prompts.json';
export const CHARACTER_REFERENCES_FILENAME = 'character-references.json';

/** Max scenes per Flow tool batch call (mavid editor). */
export const AI_FLOW_TOOL_BATCH_SIZE = 10;
