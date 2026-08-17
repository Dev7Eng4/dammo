import fs from 'node:fs/promises';
import path from 'node:path';
import { formatClockDuration, getAudioDurationSeconds } from '../../../../infrastructure/ffmpeg/ffmpeg-probe.js';
import {
  buildH264VideoEncoderArgs,
  isHardwareEncoder,
  resolveFfmpegHwEncoder,
} from '../../../../infrastructure/ffmpeg/ffmpeg-encoder.js';
import { AppError } from '../../../../shared/http/errors.js';
import { assembleSlideshow } from '../slideshow/slideshow-assembler.js';
import { adaptKenBurnsForDuration } from '../slideshow/ken-burns.js';
import {
  AUTO_KEN_BURNS_ROTATION,
  AUTO_TRANSITION_ROTATION,
  KEN_BURNS_PRESETS,
} from '../slideshow/slideshow-presets.js';
import { SS_CACHE_DIRNAME, SS_DEFAULT_TRANSITION_DURATION } from '../slideshow/slideshow.constants.js';
import type { SlideSpec } from '../slideshow/slideshow.types.js';
import { resolveCaptionFont } from '../si-video/si-assets.js';
import { getCaptionStylePreset, resolveCaptionStyleKey } from '../si-video/caption-styles.js';
import {
  SI_CANVAS_H,
  SI_CANVAS_W,
  SI_FPS,
  SI_OUTPUT_VIDEO_BASENAME,
  SI_SUBTITLE_BOX_OPACITY,
  SI_SUBTITLE_MARGIN_BOTTOM_PX,
  resolveRandomSiAudioSpeed,
} from '../si-video/si.constants.js';
import { runFfmpegFilterComplex } from '../si-video/si-ffmpeg.js';
import {
  appendChannelAvatarOverlayFilters,
  ensurePrebakedChannelAvatar,
} from '../si-video/channel-avatar-overlay.js';
import {
  convertSrtToAss,
  escapePathForFfmpegSubtitles,
  resolveJapaneseSubtitleStyle,
  scaleSrtTimestamps,
} from '../si-video/si-subtitle.js';
import {
  AI_KEN_BURNS_FOCAL_MAX,
  AI_KEN_BURNS_FOCAL_MIN,
  AI_KEN_BURNS_LONG_SLIDE_LINEAR_SEC,
  AI_KEN_BURNS_MAX_ZOOM,
  AI_KEN_BURNS_MIN_PX_PER_FRAME,
  AI_MAX_LAST_SLIDE_PAD_SEC,
  AI_SLIDESHOW_FINAL_PRESET,
  AI_SLIDESHOW_RAW_BASENAME,
  AI_SLIDESHOW_TEMP_SCALE_FACTOR,
  AI_SMALL_VIDEO_OVERLAY_X,
  AI_SMALL_VIDEO_OVERLAY_Y,
} from './ai-video.constants.js';
import { ensurePrebakedAiSmallVideo } from './ai-small-video-prepare.js';
import { resolveSiSmallVideoClip } from '../si-video/si-small-video.js';
import {
  resolveSceneImageAbsolutePath,
  scaleSceneTimestamps,
  sceneDurationSec,
  scenesWithImagePaths,
} from './ai-video-scene-timing.js';
import type { AiVideoScenePrompt, AssembleReupAiSlideshowVideoInput } from './ai-video.types.js';

function buildTimedSlides(workDir: string, scenes: AiVideoScenePrompt[]): SlideSpec[] {
  const usable = scenesWithImagePaths(scenes);
  if (usable.length === 0) {
    throw new AppError('AI slideshow requires at least one scene with an image path', 400, 'AI_SLIDESHOW_NO_IMAGES');
  }

  return usable.map((scene, index) => {
    const durationSec = sceneDurationSec(scene);
    const presetName = AUTO_KEN_BURNS_ROTATION[index % AUTO_KEN_BURNS_ROTATION.length];
    const isLast = index === usable.length - 1;
    const transitionDurationSec = Math.min(SS_DEFAULT_TRANSITION_DURATION, Math.max(0.05, durationSec / 2 - 0.05));

    const slide: SlideSpec = {
      imagePath: resolveSceneImageAbsolutePath(workDir, scene),
      durationSec,
      kenBurns: { ...KEN_BURNS_PRESETS[presetName] },
      fit: 'cover',
    };

    if (!isLast && transitionDurationSec > 0) {
      slide.transitionToNext = AUTO_TRANSITION_ROTATION[index % AUTO_TRANSITION_ROTATION.length];
      slide.transitionDurationSec = transitionDurationSec;
    }

    return slide;
  });
}

/** xfade shortens total length by sum(transitionDuration); pad the last slide so timeline matches target. */
function padSlidesToAudioDuration(
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

  // A large deficit on one slide means a single multi-minute zoompan clip, which
  // renders orders of magnitude slower than the same time spread over slides.
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

/** Boost pan/zoom on long slides so zoompan stays above the integer-step jitter floor. */
function applyDurationAdaptiveKenBurns(slides: SlideSpec[]): SlideSpec[] {
  return slides.map(slide => {
    if (!slide.kenBurns) return slide;
    return {
      ...slide,
      kenBurns: adaptKenBurnsForDuration(slide.kenBurns, slide.durationSec, {
        width: SI_CANVAS_W,
        height: SI_CANVAS_H,
        fps: SI_FPS,
        tempScaleFactor: AI_SLIDESHOW_TEMP_SCALE_FACTOR,
        minPxPerFrame: AI_KEN_BURNS_MIN_PX_PER_FRAME,
        longSlideLinearSec: AI_KEN_BURNS_LONG_SLIDE_LINEAR_SEC,
        maxZoom: AI_KEN_BURNS_MAX_ZOOM,
        focalMin: AI_KEN_BURNS_FOCAL_MIN,
        focalMax: AI_KEN_BURNS_FOCAL_MAX,
      }),
    };
  });
}

export async function assembleReupAiSlideshowVideo(
  input: AssembleReupAiSlideshowVideoInput,
): Promise<string> {
  const {
    workDir,
    scenes,
    audioPath,
    subtitlePath,
    language,
    captionStyleKey,
    outputBasename = SI_OUTPUT_VIDEO_BASENAME,
    showDisclaim = false,
    disclaimerText,
    channelAvatarPath,
    showSmallVideo = false,
    smallVideoFile,
    smallVideoPath,
    onLog,
  } = input;
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  const usableScenes = scenesWithImagePaths(scenes);
  if (usableScenes.length === 0) {
    throw new AppError('AI slideshow requires at least one image', 400, 'AI_SLIDESHOW_NO_IMAGES');
  }

  const assets = resolveCaptionFont(captionStyleKey);
  const speed = resolveRandomSiAudioSpeed();
  const originalAudioDuration = await getAudioDurationSeconds(audioPath);
  const audioDurationAfterTempo = originalAudioDuration / speed;
  const scaledScenes = scaleSceneTimestamps(usableScenes, speed);

  let slides = buildTimedSlides(workDir, scaledScenes);
  const imagePaths = slides.map(slide => slide.imagePath);

  for (const requiredPath of [audioPath, subtitlePath, ...imagePaths, ...(channelAvatarPath ? [channelAvatarPath] : [])]) {
    try {
      await fs.access(requiredPath);
    } catch {
      throw new AppError(`AI slideshow missing input file: ${requiredPath}`, 400, 'AI_INPUT_MISSING');
    }
  }

  log(
    `[ai-video] Audio ${originalAudioDuration.toFixed(1)}s → ${formatClockDuration(audioDurationAfterTempo)} after atempo ${speed.toFixed(3)}`,
  );

  let activeSubtitlePath = subtitlePath;
  let scaledSrtPath: string | null = null;
  if (speed !== 1) {
    scaledSrtPath = path.join(workDir, 'ai_temp_scaled_sub.srt');
    scaleSrtTimestamps(subtitlePath, scaledSrtPath, speed);
    activeSubtitlePath = scaledSrtPath;
  }

  slides = padSlidesToAudioDuration(slides, audioDurationAfterTempo, log);
  slides = applyDurationAdaptiveKenBurns(slides);

  log(
    `[ai-video] ${slides.length} timed slides (Ken Burns adaptive, no shuffle) spanning ~${audioDurationAfterTempo.toFixed(1)}s`,
  );

  if (channelAvatarPath) {
    log(`[ai-video] Channel avatar overlay: ${path.basename(channelAvatarPath)}`);
  }

  const showSmallVideoOverlay =
    showSmallVideo === true || Boolean(smallVideoFile?.trim()) || Boolean(smallVideoPath?.trim());
  let preparedSmallVideoPath: string | null = null;
  if (showSmallVideoOverlay) {
    const absoluteOverride = smallVideoPath?.trim();
    let sourcePath: string;
    let label: string;
    if (absoluteOverride) {
      try {
        await fs.access(absoluteOverride);
      } catch {
        throw new AppError(`AI slideshow missing small video: ${absoluteOverride}`, 400, 'AI_INPUT_MISSING');
      }
      sourcePath = absoluteOverride;
      label = path.basename(absoluteOverride);
    } else {
      const clip = await resolveSiSmallVideoClip(smallVideoFile);
      sourcePath = clip.path;
      label = clip.filename;
    }
    log(`[ai-video] Small video PiP overlay: ${label}`);
    const prebaked = await ensurePrebakedAiSmallVideo(sourcePath, onLog);
    preparedSmallVideoPath = prebaked.path;
  }

  const slideshowRawPath = path.join(workDir, `${AI_SLIDESHOW_RAW_BASENAME}.mp4`);
  log(
    `[ai-video] Ken Burns supersample ${AI_SLIDESHOW_TEMP_SCALE_FACTOR}x ` +
      `(${SI_CANVAS_W * AI_SLIDESHOW_TEMP_SCALE_FACTOR}x${SI_CANVAS_H * AI_SLIDESHOW_TEMP_SCALE_FACTOR} working canvas for smooth pan/zoom)`,
  );
  await assembleSlideshow({
    slides,
    workDir,
    outputPath: slideshowRawPath,
    onLog,
    output: {
      width: SI_CANVAS_W,
      height: SI_CANVAS_H,
      fps: SI_FPS,
      tempScaleFactor: AI_SLIDESHOW_TEMP_SCALE_FACTOR,
      finalPreset: AI_SLIDESHOW_FINAL_PRESET,
    },
  });

  const outputPath = path.join(workDir, `${outputBasename}.mp4`);
  const filterScriptPath = path.join(workDir, 'ai_video_filter.txt');
  const tempAssPath = path.join(workDir, 'ai_temp_sub.ass');
  let preparedAvatarPath: string | null = null;

  if (channelAvatarPath) {
    preparedAvatarPath = await ensurePrebakedChannelAvatar(channelAvatarPath, onLog);
  }

  const useJaSubtitleStyle = resolveJapaneseSubtitleStyle(activeSubtitlePath, language);
  const resolvedCaptionStyleKey = resolveCaptionStyleKey(captionStyleKey);
  convertSrtToAss(activeSubtitlePath, tempAssPath, {
    captionStyleKey: resolvedCaptionStyleKey,
    japaneseStyle: useJaSubtitleStyle,
    fontFile: assets.fontPath,
    showDisclaim,
    disclaimerText,
  });
  const subPathEscaped = escapePathForFfmpegSubtitles(tempAssPath);
  const fontsDirEscaped = escapePathForFfmpegSubtitles(assets.fontDir);
  const captionPreset = getCaptionStylePreset(resolvedCaptionStyleKey);
  const subFilter = `subtitles='${subPathEscaped}:fontsdir=${fontsDirEscaped}'`;
  const videoFilters = captionPreset.showBackgroundBox
    ? (() => {
        const subtitleBoxHeight = Math.floor(SI_CANVAS_H / 3);
        const boxY = SI_CANVAS_H - subtitleBoxHeight - SI_SUBTITLE_MARGIN_BOTTOM_PX;
        const drawboxFilter = `drawbox=x=0:y=${boxY}:w=iw:h=${subtitleBoxHeight}:color=black@${SI_SUBTITLE_BOX_OPACITY}:t=fill`;
        return `${drawboxFilter},${subFilter}`;
      })()
    : subFilter;
  const hwEncoder = resolveFfmpegHwEncoder();
  const videoMapLabel = isHardwareEncoder(hwEncoder) ? 'venc' : 'vout_final';
  const finalFormat = isHardwareEncoder(hwEncoder) ? ',format=nv12' : '';

  const filterParts: string[] = [];
  let videoInputLabel = '0:v';
  let nextInputIndex = 2;
  let smallVideoInputLabel: string | null = null;
  let avatarInputLabel: string | null = null;
  const extraInputs: string[] = [];

  if (preparedSmallVideoPath) {
    extraInputs.push('-stream_loop', '-1', '-i', preparedSmallVideoPath);
    smallVideoInputLabel = `${nextInputIndex}:v`;
    nextInputIndex += 1;
  }

  if (preparedAvatarPath) {
    extraInputs.push('-f', 'image2', '-loop', '1', '-framerate', String(SI_FPS), '-i', preparedAvatarPath);
    avatarInputLabel = `${nextInputIndex}:v`;
    nextInputIndex += 1;
  }

  if (smallVideoInputLabel) {
    filterParts.push(
      `[${videoInputLabel}][${smallVideoInputLabel}]overlay=${AI_SMALL_VIDEO_OVERLAY_X}:${AI_SMALL_VIDEO_OVERLAY_Y}:shortest=1:format=auto[v_with_small]`,
    );
    videoInputLabel = 'v_with_small';
  }

  if (avatarInputLabel) {
    appendChannelAvatarOverlayFilters(filterParts, videoInputLabel, avatarInputLabel, 'v_with_avatar', {
      prebaked: true,
    });
    videoInputLabel = 'v_with_avatar';
  }

  filterParts.push(
    `[${videoInputLabel}]format=yuv420p,fps=${SI_FPS},${videoFilters}${finalFormat}[${videoMapLabel}]`,
  );
  filterParts.push(`[1:a]atempo=${speed}[aout]`);

  await fs.writeFile(filterScriptPath, filterParts.join(';'), 'utf-8');

  const aiEncodeOpts = { preset: 'fast' as const };
  const mergeArgs = [
    '-y',
    '-i',
    slideshowRawPath,
    '-i',
    audioPath,
    ...extraInputs,
    '-filter_complex_script',
    filterScriptPath,
    '-map',
    `[${videoMapLabel}]`,
    '-map',
    '[aout]',
    ...buildH264VideoEncoderArgs(aiEncodeOpts),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-t',
    String(audioDurationAfterTempo),
    outputPath,
  ];

  log('[ai-video] Muxing slideshow + audio + subtitles...');
  await runFfmpegFilterComplex(mergeArgs, {
    encodeOpts: aiEncodeOpts,
    onLog,
    label: 'ai-final-mux',
  });

  await fs.unlink(filterScriptPath).catch(() => undefined);
  await fs.unlink(tempAssPath).catch(() => undefined);
  await fs.unlink(slideshowRawPath).catch(() => undefined);
  if (scaledSrtPath) {
    await fs.unlink(scaledSrtPath).catch(() => undefined);
  }

  const cacheDir = path.join(workDir, SS_CACHE_DIRNAME);
  await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => undefined);
  log(`[ai-video] Cleaned ${SS_CACHE_DIRNAME}`);

  log(`[ai-video] Video saved → ${outputPath}`);
  return outputPath;
}
