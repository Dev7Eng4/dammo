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
  convertSrtToAss,
  escapePathForFfmpegSubtitles,
  resolveJapaneseSubtitleStyle,
  scaleSrtTimestamps,
} from '../si-video/si-subtitle.js';
import { AI_SLIDESHOW_RAW_BASENAME } from './ai-video.constants.js';
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
function padSlidesToAudioDuration(slides: SlideSpec[], audioDurationSec: number): SlideSpec[] {
  if (slides.length === 0) return slides;

  const transitionSum = slides.slice(0, -1).reduce((sum, slide) => sum + (slide.transitionDurationSec ?? 0), 0);
  const contentSum = slides.reduce((sum, slide) => sum + slide.durationSec, 0);
  const projected = contentSum - transitionSum;
  const deficit = audioDurationSec - projected;
  if (deficit <= 0.05) return slides;

  const padded = slides.map(slide => ({ ...slide }));
  padded[padded.length - 1] = {
    ...padded[padded.length - 1],
    durationSec: padded[padded.length - 1].durationSec + deficit,
  };
  return padded;
}

export async function assembleReupAiSlideshowVideo(
  input: AssembleReupAiSlideshowVideoInput,
): Promise<string> {
  const { workDir, scenes, audioPath, subtitlePath, language, captionStyleKey, onLog } = input;
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

  for (const requiredPath of [audioPath, subtitlePath, ...imagePaths]) {
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

  slides = padSlidesToAudioDuration(slides, audioDurationAfterTempo);

  log(
    `[ai-video] ${slides.length} timed slides (Ken Burns, no shuffle) spanning ~${audioDurationAfterTempo.toFixed(1)}s`,
  );

  const slideshowRawPath = path.join(workDir, `${AI_SLIDESHOW_RAW_BASENAME}.mp4`);
  await assembleSlideshow({
    slides,
    workDir,
    outputPath: slideshowRawPath,
    onLog,
    output: { width: SI_CANVAS_W, height: SI_CANVAS_H, fps: SI_FPS },
  });

  const outputPath = path.join(workDir, `${SI_OUTPUT_VIDEO_BASENAME}.mp4`);
  const filterScriptPath = path.join(workDir, 'ai_video_filter.txt');
  const tempAssPath = path.join(workDir, 'ai_temp_sub.ass');

  const useJaSubtitleStyle = resolveJapaneseSubtitleStyle(activeSubtitlePath, language);
  const resolvedCaptionStyleKey = resolveCaptionStyleKey(captionStyleKey);
  convertSrtToAss(activeSubtitlePath, tempAssPath, {
    captionStyleKey: resolvedCaptionStyleKey,
    japaneseStyle: useJaSubtitleStyle,
    fontFile: assets.fontPath,
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

  const filterParts = [
    `[0:v]format=yuv420p,fps=${SI_FPS},${videoFilters}${finalFormat}[${videoMapLabel}]`,
    `[1:a]atempo=${speed}[aout]`,
  ];

  await fs.writeFile(filterScriptPath, filterParts.join(';'), 'utf-8');

  const aiEncodeOpts = { preset: 'fast' as const };
  const mergeArgs = [
    '-y',
    '-i',
    slideshowRawPath,
    '-i',
    audioPath,
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
  if (scaledSrtPath) {
    await fs.unlink(scaledSrtPath).catch(() => undefined);
  }

  const cacheDir = path.join(workDir, SS_CACHE_DIRNAME);
  await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => undefined);
  log(`[ai-video] Cleaned ${SS_CACHE_DIRNAME}`);

  log(`[ai-video] Video saved → ${outputPath}`);
  return outputPath;
}
