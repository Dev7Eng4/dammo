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
  isImageTransitionsEnabled,
} from '../slideshow/slideshow.constants.js';
import type { SlideSpec } from '../slideshow/slideshow.types.js';
import { applyClipSpans } from './ai-video-clip-span.js';
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
  resolveImageTimeline,
  resolveSceneImageAbsolutePath,
  scaleSceneTimestamps,
  sceneDurationSec,
  scenesWithImagePaths,
} from './ai-video-scene-timing.js';
import { isTitleScene } from './ai-video-title-card.js';
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

/** Title cards stay still so the heading text is never cropped by pan/zoom. */
function sceneKenBurns(
  scene: AiVideoScenePrompt,
  presetName: keyof typeof KEN_BURNS_PRESETS,
): Pick<SlideSpec, 'kenBurns'> {
  return isTitleScene(scene) ? {} : { kenBurns: { ...KEN_BURNS_PRESETS[presetName] } };
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
      ...(scene.videoPath?.trim()
        ? { videoPath: path.isAbsolute(scene.videoPath) ? scene.videoPath : path.join(workDir, scene.videoPath) }
        : {}),
      durationSec,
      ...sceneKenBurns(scene, presetName),
      fit: 'cover',
    };

    if (isImageTransitionsEnabled() && !isLast && transitionDurationSec > 0) {
      slide.transitionToNext = AUTO_TRANSITION_ROTATION[usableIndex % AUTO_TRANSITION_ROTATION.length];
      slide.transitionDurationSec = transitionDurationSec;
    }

    return slide;
  });
}

/**
 * One static slide: the first scene image, letterboxed (contain) on black. Its on-screen
 * time is only a stub; {@link addAudioDeficitHold} stretches it over the whole audio.
 */
export function buildStillBackgroundSlides(workDir: string, scenes: AiVideoScenePrompt[]): SlideSpec[] {
  const [scene] = scenesWithImagePaths(scenes);
  if (!scene) {
    throw new AppError('Still background requires one scene with an image path', 400, 'AI_SLIDESHOW_NO_IMAGES');
  }
  return [{ imagePath: resolveSceneImageAbsolutePath(workDir, scene), durationSec: 1, fit: 'contain' }];
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

/** Float noise below this neither adds a hold nor re-renders a clip. */
const HOLD_EPSILON_SEC = 0.0005;

/** xfade length into the next image: never more than half of either image's time on screen. */
function transitionSecBetween(windowSec: number, nextWindowSec: number): number {
  return Math.min(SS_DEFAULT_TRANSITION_DURATION, Math.max(0.05, Math.min(windowSec, nextWindowSec) / 2 - 0.05));
}

/**
 * Slides placed on the scene timeline: every image takes over at its own start time (in the middle
 * of the crossfade into it) and stays until the next image does. Because a crossfade overlaps two
 * clips, each clip is made longer by its half of the crossfades around it; without that every cut
 * would pull all later images forward.
 *
 * The extra time is a still hold, so a clip keeps the duration of its scene and cached / prebaked
 * Ken Burns clips stay valid. Only a clip that must be shorter than its scene (overlapping scenes)
 * is rendered again. `scaledScenes` must already be scaled by audio speed.
 */
export function buildAiTimelineSlides(
  workDir: string,
  timedScenes: AiVideoScenePrompt[],
  log?: (msg: string) => void,
): SlideSpec[] {
  const scaledScenes = applyClipSpans(workDir, timedScenes);
  const covered = scenesWithImagePaths(timedScenes).length - scenesWithImagePaths(scaledScenes).length;
  if (covered > 0) log?.(`[ai-video] ${covered} scene image(s) covered by longer clips (clipSpan)`);
  const timeline = resolveImageTimeline(scaledScenes);
  const slides = buildAiTimedSlides(workDir, timeline.map(entry => scaledScenes[entry.index]!));
  const dropped = scenesWithImagePaths(scaledScenes).length - timeline.length;
  if (dropped > 0) {
    log?.(`[ai-video] ${dropped} scene image(s) skipped: their time is taken by overlapping scenes`);
  }

  const starts = timeline.map(entry => entry.startSec);
  // The first image is on screen from 0; the last one keeps its own duration (the audio deficit is added later).
  const windows = slides.map((slide, i) =>
    i < slides.length - 1 ? starts[i + 1]! - (i === 0 ? 0 : starts[i]!) : slide.durationSec,
  );
  const transitions = slides.map((slide, i) =>
    i < slides.length - 1 && slide.transitionToNext ? transitionSecBetween(windows[i]!, windows[i + 1]!) : 0,
  );

  return slides.map((slide, i) => {
    const visible = windows[i]! + transitions[i]! / 2 + (i > 0 ? transitions[i - 1]! / 2 : 0);
    const placed: SlideSpec = { ...slide };
    if (transitions[i]! > 0) placed.transitionDurationSec = transitions[i]!;
    if (visible < slide.durationSec - HOLD_EPSILON_SEC) {
      placed.durationSec = Math.round(visible * 1_000) / 1_000;
      return placed;
    }
    let hold = visible - slide.durationSec;
    if (i === 0) {
      const lead = Math.min(hold, starts[0]!);
      if (lead > HOLD_EPSILON_SEC) placed.holdBeforeSec = lead;
      hold -= lead;
    }
    if (hold > HOLD_EPSILON_SEC) placed.holdAfterSec = hold;
    return placed;
  });
}

/** Extend the last slide with a still hold so the slideshow covers the audio. */
export function addAudioDeficitHold(
  slides: SlideSpec[],
  audioDurationSec: number,
  log?: (msg: string) => void,
): SlideSpec[] {
  if (slides.length === 0) return slides;

  const transitionSum = slides
    .slice(0, -1)
    .reduce((sum, slide) => sum + (slide.transitionDurationSec ?? 0), 0);
  const visible = slides.reduce(
    (sum, slide) => sum + slide.durationSec + (slide.holdBeforeSec ?? 0) + (slide.holdAfterSec ?? 0),
    0,
  );
  const deficit = audioDurationSec - (visible - transitionSum);
  if (deficit <= 0.05) return slides;

  const padded = slides.map(slide => ({ ...slide }));
  const last = padded[padded.length - 1]!;
  last.holdAfterSec = (last.holdAfterSec ?? 0) + deficit;
  log?.(
    `[ai-video] Holding the last slide an extra ${deficit.toFixed(1)}s ` +
      `so the slideshow matches audio ${audioDurationSec.toFixed(1)}s`,
  );
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
    ...sceneKenBurns(scene, presetName),
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
