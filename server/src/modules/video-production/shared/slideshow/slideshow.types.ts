/**
 * Public types for the slideshow effect library.
 */

/** How a source image is fitted into the output frame. */
export type FitMode = 'cover' | 'contain';

/** Interpolation curve applied to Ken Burns motion over the clip duration. */
export type EasingType = 'linear' | 'easeInOut';

/**
 * A normalized focal point inside the frame, where (0,0) is top-left and
 * (1,1) is bottom-right. Used as the anchor the zoom converges to / pans toward.
 */
export interface FocalPoint {
  x: number;
  y: number;
}

/**
 * Ken Burns animation for a single image.
 *
 * `zoomStart`/`zoomEnd` are zoom factors (1 = no zoom). A value > 1 means the
 * image is enlarged (cropped tighter). Pan is expressed by moving the focal
 * point from `from` to `to` across the clip.
 */
export interface KenBurnsEffect {
  zoomStart: number;
  zoomEnd: number;
  from: FocalPoint;
  to: FocalPoint;
  easing: EasingType;
}

/**
 * Curated subset of ffmpeg `xfade` transitions used between slides.
 * (xfade ships 50+; these are the visually reliable ones for photo slideshows.)
 */
export type TransitionType =
  | 'fade'
  | 'fadeblack'
  | 'fadewhite'
  | 'dissolve'
  | 'wipeleft'
  | 'wiperight'
  | 'wipeup'
  | 'wipedown'
  | 'slideleft'
  | 'slideright'
  | 'slideup'
  | 'slidedown'
  | 'circlecrop'
  | 'circleopen'
  | 'circleclose'
  | 'radial'
  | 'pixelize'
  | 'zoomin'
  | 'smoothleft'
  | 'smoothright';

/** Optional overrides for adaptKenBurnsForDuration before rendering each slide. */
export interface KenBurnsAdaptConfig {
  minPxPerFrame?: number;
  longSlideLinearSec?: number;
  maxZoom?: number;
  focalMin?: number;
  focalMax?: number;
}

/** Specification of one slide (one source image). */
export interface SlideSpec {
  imagePath: string;
  /** Visible duration of this slide in seconds (before transition overlap). */
  durationSec: number;
  /** Ken Burns animation; omit for a static frame. */
  kenBurns?: KenBurnsEffect;
  /** How the image fills the frame. Defaults to 'cover'. */
  fit?: FitMode;
  /** Transition INTO the next slide. Omit on the last slide. */
  transitionToNext?: TransitionType;
  /** Duration of the transition into the next slide (seconds). */
  transitionDurationSec?: number;
  /** Max Ken Burns animation window (seconds). Defaults to SS_MAX_KEN_BURNS_ANIMATION_SEC. */
  maxKenBurnsAnimationSec?: number;
}

/** Output configuration for a slideshow render. */
export interface SlideshowOutputConfig {
  width: number;
  height: number;
  fps: number;
  /** Internal upscale multiplier for smooth Ken Burns. */
  tempScaleFactor: number;
  /** Override final compose encoder preset (default: medium). */
  finalPreset?: string;
  /** Override final compose CRF (default: 20). */
  finalCrf?: number;
  /** Per-render overrides for duration-adaptive Ken Burns tuning. */
  kenBurnsAdapt?: KenBurnsAdaptConfig;
}

/** Full slideshow specification handed to the assembler. */
export interface SlideshowSpec {
  slides: SlideSpec[];
  /** Directory used for intermediate clips and the cache. */
  workDir: string;
  /** Final output file path (.mp4). */
  outputPath: string;
  /** Output config; sensible defaults applied when omitted. */
  output?: Partial<SlideshowOutputConfig>;
  onLog?: (msg: string) => void;
}
