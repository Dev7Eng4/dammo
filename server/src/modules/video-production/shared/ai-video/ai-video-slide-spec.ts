import path from 'node:path';
import { getAudioDurationSeconds } from '../../../../infrastructure/ffmpeg/ffmpeg-probe.js';
import { AppError } from '../../../../shared/http/errors.js';
import {
  AUTO_KEN_BURNS_ROTATION,
  AUTO_TRANSITION_ROTATION,
  KEN_BURNS_PRESETS,
} from '../slideshow/slideshow-presets.js';
import {
  SS_DEFAULT_TRANSITION_DURATION,
  SS_ENABLE_IMAGE_TRANSITIONS,
} from '../slideshow/slideshow.constants.js';
import type { SlideSpec } from '../slideshow/slideshow.types.js';
import { CANVAS_H, CANVAS_W, FPS } from '../render-core/canvas.constants.js';
import {
  AI_KEN_BURNS_FOCAL_MAX,
  AI_KEN_BURNS_FOCAL_MIN,
  AI_KEN_BURNS_LONG_SLIDE_LINEAR_SEC,
  AI_KEN_BURNS_MAX_ZOOM,
  AI_KEN_BURNS_MIN_PX_PER_FRAME,
  AI_MAX_LAST_SLIDE_PAD_SEC,
  AI_SLIDESHOW_TEMP_SCALE_FACTOR,
  AI_SLIDES_DIRNAME,
} from './ai-video.constants.js';
import {
  resolveSceneImageAbsolutePath,
  scaleSceneTimestamps,
  sceneDurationSec,
  scenesWithImagePaths,
} from './ai-video-scene-timing.js';
import type { AiVideoScenePrompt } from './ai-video.types.js';
import type { RenderClipOptions } from '../slideshow/slideshow-clip-renderer.js';
import { SS_CACHE_DIRNAME } from '../slideshow/slideshow.constants.js';

export function parseSceneAbsoluteIndex(sceneName: string): number {
  const match = /^scene-(\d+)$/.exec(sceneName);
  if (!match) return 0;
  return Math.max(0, parseInt(match[1], 10) - 1);
}

function parseSceneIndexFromRelativePath(relativePath: string): number {
  const base = path.basename(relativePath, path.extname(relativePath));
  return parseSceneAbsoluteIndex(base);
}

export function buildAiTimedSlides(workDir: string, scenes: AiVideoScenePrompt[]): SlideSpec[] {
  const usable = scenesWithImagePaths(scenes);
  if (usable.length === 0) {
    throw new AppError('AI slideshow requires at least one scene with an image path', 400, 'AI_SLIDESHOW_NO_IMAGES');
  }

  return usable.map((scene, usableIndex) => {
    const durationSec = sceneDurationSec(scene);
    const absoluteIndex = scene.path?.trim()
      ? parseSceneIndexFromRelativePath(scene.path)
      : usableIndex;
    const presetName = AUTO_KEN_BURNS_ROTATION[absoluteIndex % AUTO_KEN_BURNS_ROTATION.length];
    const isLast = usableIndex === usable.length - 1;
    const transitionDurationSec = Math.min(SS_DEFAULT_TRANSITION_DURATION, Math.max(0.05, durationSec / 2 - 0.05));

    const slide: SlideSpec = {
      imagePath: resolveSceneImageAbsolutePath(workDir, scene),
      durationSec,
      kenBurns: { ...KEN_BURNS_PRESETS[presetName] },
      fit: 'cover',
    };

    if (SS_ENABLE_IMAGE_TRANSITIONS && !isLast && transitionDurationSec > 0) {
      slide.transitionToNext = AUTO_TRANSITION_ROTATION[usableIndex % AUTO_TRANSITION_ROTATION.length];
      slide.transitionDurationSec = transitionDurationSec;
    }

    return slide;
  });
}

/** xfade shortens total length by sum(transitionDuration); pad the last slide so timeline matches target. */
export function padAiSlidesToAudio(
  slides: SlideSpec[],
  audioDurationSec: number,
  log?: (msg: string) => void,
): SlideSpec[] {
  if (slides.length === 0) return slides;

  const transitionSum = slides.slice(0, -1).reduce((sum, slide) => sum + (slide.transitionDurationSec ?? 0), 0);
  const contentSum = slides.reduce((sum, slide) => sum + slide.durationSec, 0);
  const projected = contentSum - transitionSum;
  const deficit = audioDurationSec - projected;
  if (deficit <= 0.05) return slides;

  if (deficit > AI_MAX_LAST_SLIDE_PAD_SEC && slides.length > 1) {
    const scale = (audioDurationSec + transitionSum) / contentSum;
    const stretched = slides.map(slide => ({ ...slide, durationSec: slide.durationSec * scale }));
    const stretchedSum = stretched.reduce((sum, slide) => sum + slide.durationSec, 0);
    const residue = audioDurationSec + transitionSum - stretchedSum;
    const last = stretched[stretched.length - 1]!;
    last.durationSec = Math.max(0.1, last.durationSec + residue);
    log?.(
      `[ai-video] Scene timeline covers ${projected.toFixed(1)}s but audio is ${audioDurationSec.toFixed(1)}s; ` +
        `stretching ${slides.length} slides by ${scale.toFixed(3)}x instead of padding the last slide by ${deficit.toFixed(1)}s`,
    );
    return stretched;
  }

  const padded = slides.map(slide => ({ ...slide }));
  padded[padded.length - 1] = {
    ...padded[padded.length - 1],
    durationSec: padded[padded.length - 1].durationSec + deficit,
  };
  return padded;
}

export function buildProvisionalAiSlideSpec(
  workDir: string,
  scene: AiVideoScenePrompt,
  sceneName: string,
  speed: number,
): SlideSpec {
  const scaled = scaleSceneTimestamps([scene], speed)[0]!;
  const absoluteIndex = parseSceneAbsoluteIndex(sceneName);
  const durationSec = sceneDurationSec(scaled);
  const presetName = AUTO_KEN_BURNS_ROTATION[absoluteIndex % AUTO_KEN_BURNS_ROTATION.length];

  return {
    imagePath: path.join(workDir, AI_SLIDES_DIRNAME, `${sceneName}.jpg`),
    durationSec,
    kenBurns: { ...KEN_BURNS_PRESETS[presetName] },
    fit: 'cover',
  };
}

/** Assign relative image paths to every scene (assumes all will succeed). */
function scenesWithAssumedPaths(scenes: AiVideoScenePrompt[]): AiVideoScenePrompt[] {
  return scenes.map((scene, index) => ({
    ...scene,
    path: path.posix.join(AI_SLIDES_DIRNAME, `scene-${String(index + 1).padStart(3, '0')}.jpg`),
  }));
}

/**
 * Final slide specs assuming every scene gets an image — includes pad/stretch so
 * incremental Ken Burns prebake uses the same durations as assemble.
 */
export async function buildAssumedFinalAiSlides(
  workDir: string,
  scenes: AiVideoScenePrompt[],
  speed: number,
  audioPath: string,
  log?: (msg: string) => void,
): Promise<SlideSpec[]> {
  const assumed = scenesWithAssumedPaths(scenes);
  const scaledScenes = scaleSceneTimestamps(assumed, speed);
  let slides = buildAiTimedSlides(workDir, scaledScenes);
  const originalAudioDuration = await getAudioDurationSeconds(audioPath);
  slides = padAiSlidesToAudio(slides, originalAudioDuration / speed, log);
  return slides;
}

export function buildAssumedFinalSlidesByName(slides: SlideSpec[]): Map<string, SlideSpec> {
  const byName = new Map<string, SlideSpec>();
  for (const slide of slides) {
    const name = path.basename(slide.imagePath, path.extname(slide.imagePath));
    byName.set(name, slide);
  }
  return byName;
}

export async function buildFinalAiSlides(
  workDir: string,
  scenes: AiVideoScenePrompt[],
  speed: number,
  audioPath: string,
  log?: (msg: string) => void,
): Promise<SlideSpec[]> {
  const usable = scenesWithImagePaths(scenes);
  const scaledScenes = scaleSceneTimestamps(usable, speed);
  let slides = buildAiTimedSlides(workDir, scaledScenes);
  const originalAudioDuration = await getAudioDurationSeconds(audioPath);
  slides = padAiSlidesToAudio(slides, originalAudioDuration / speed, log);
  return slides;
}

export function resolveAiSlideRenderOptions(workDir: string, onLog?: (msg: string) => void): RenderClipOptions {
  return {
    width: CANVAS_W,
    height: CANVAS_H,
    fps: FPS,
    tempScaleFactor: AI_SLIDESHOW_TEMP_SCALE_FACTOR,
    cacheDir: path.join(workDir, SS_CACHE_DIRNAME),
    kenBurnsAdapt: {
      minPxPerFrame: AI_KEN_BURNS_MIN_PX_PER_FRAME,
      longSlideLinearSec: AI_KEN_BURNS_LONG_SLIDE_LINEAR_SEC,
      maxZoom: AI_KEN_BURNS_MAX_ZOOM,
      focalMin: AI_KEN_BURNS_FOCAL_MIN,
      focalMax: AI_KEN_BURNS_FOCAL_MAX,
    },
    onLog,
  };
}
