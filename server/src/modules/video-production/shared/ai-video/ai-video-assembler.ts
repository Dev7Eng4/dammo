import fs from 'node:fs/promises';
import path from 'node:path';
import { formatClockDuration, getAudioDurationSeconds } from '../../../../infrastructure/ffmpeg/ffmpeg-probe.js';
import {
  buildH264VideoEncoderArgs,
  isHardwareEncoder,
  resolveFfmpegHwEncoder,
} from '../../../../infrastructure/ffmpeg/ffmpeg-encoder.js';
import { AppError } from '../../../../shared/http/errors.js';
import { prepareSlideshow } from '../slideshow/slideshow-assembler.js';
import { SS_MAX_KEN_BURNS_ANIMATION_SEC } from '../slideshow/slideshow.constants.js';
import { pruneSlideshowCache } from '../slideshow/slideshow-cache.js';
import {
  getCaptionStylePreset,
  resolveCaptionFont,
  resolveCaptionStyleKey,
} from '../render-core/caption-styles.js';
import {
  CANVAS_H,
  CANVAS_W,
  FPS,
  SUBTITLE_BOX_OPACITY,
  SUBTITLE_MARGIN_BOTTOM_PX,
  resolveRandomAudioSpeed,
} from '../render-core/canvas.constants.js';
import { OUTPUT_VIDEO_BASENAME } from '../render-core/output-artifacts.constants.js';
import { runFfmpegFilterComplex } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import {
  appendChannelAvatarOverlayFilters,
  ensurePrebakedChannelAvatar,
} from '../render-core/channel-avatar-overlay.js';
import {
  convertSrtToAss,
  escapePathForFfmpegSubtitles,
  resolveJapaneseSubtitleStyle,
  resolveSmallVideoClip,
  scaleSrtTimestamps,
} from '../render-core/subtitle.js';
import {
  AI_KEN_BURNS_FOCAL_MAX,
  AI_KEN_BURNS_FOCAL_MIN,
  AI_KEN_BURNS_LONG_SLIDE_LINEAR_SEC,
  AI_KEN_BURNS_MAX_ZOOM,
  AI_KEN_BURNS_MIN_PX_PER_FRAME,
  AI_SLIDESHOW_FINAL_PRESET,
  AI_SLIDESHOW_TEMP_SCALE_FACTOR,
  AI_SMALL_VIDEO_OVERLAY_X,
  AI_SMALL_VIDEO_OVERLAY_Y,
} from './ai-video.constants.js';
import { ensurePrebakedAiSmallVideo } from './ai-small-video-prepare.js';
import { loadAiRenderConfig } from './ai-render-config.js';
import {
  buildAiTimedSlides,
  padAiSlidesToAudio,
} from './ai-video-slide-spec.js';
import {
  scaleSceneTimestamps,
  scenesWithImagePaths,
} from './ai-video-scene-timing.js';
import type { AssembleReupAiSlideshowVideoInput } from './ai-video.types.js';

async function resolveAudioSpeedForAssemble(workDir: string): Promise<number> {
  try {
    return (await loadAiRenderConfig(workDir)).audioSpeed;
  } catch {
    return resolveRandomAudioSpeed();
  }
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
    outputBasename = OUTPUT_VIDEO_BASENAME,
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
  const speed = await resolveAudioSpeedForAssemble(workDir);
  const originalAudioDuration = await getAudioDurationSeconds(audioPath);
  const audioDurationAfterTempo = originalAudioDuration / speed;
  const scaledScenes = scaleSceneTimestamps(usableScenes, speed);

  let slides = buildAiTimedSlides(workDir, scaledScenes);
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

  slides = padAiSlidesToAudio(slides, audioDurationAfterTempo, log);

  log(
    `[ai-video] ${slides.length} timed slides (Ken Burns max ${SS_MAX_KEN_BURNS_ANIMATION_SEC}s then hold, no shuffle) spanning ~${audioDurationAfterTempo.toFixed(1)}s`,
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
      const clip = await resolveSmallVideoClip(smallVideoFile);
      sourcePath = clip.path;
      label = clip.filename;
    }
    log(`[ai-video] Small video PiP overlay: ${label}`);
    const prebaked = await ensurePrebakedAiSmallVideo(sourcePath, onLog);
    preparedSmallVideoPath = prebaked.path;
  }

  log(
    `[ai-video] Ken Burns supersample ${AI_SLIDESHOW_TEMP_SCALE_FACTOR}x ` +
      `(${CANVAS_W * AI_SLIDESHOW_TEMP_SCALE_FACTOR}x${CANVAS_H * AI_SLIDESHOW_TEMP_SCALE_FACTOR} working canvas for smooth pan/zoom)`,
  );
  const preparedSlideshow = await prepareSlideshow({
    slides,
    workDir,
    onLog,
    output: {
      width: CANVAS_W,
      height: CANVAS_H,
      fps: FPS,
      tempScaleFactor: AI_SLIDESHOW_TEMP_SCALE_FACTOR,
      finalPreset: AI_SLIDESHOW_FINAL_PRESET,
      kenBurnsAdapt: {
        minPxPerFrame: AI_KEN_BURNS_MIN_PX_PER_FRAME,
        longSlideLinearSec: AI_KEN_BURNS_LONG_SLIDE_LINEAR_SEC,
        maxZoom: AI_KEN_BURNS_MAX_ZOOM,
        focalMin: AI_KEN_BURNS_FOCAL_MIN,
        focalMax: AI_KEN_BURNS_FOCAL_MAX,
      },
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
        const subtitleBoxHeight = Math.floor(CANVAS_H / 3);
        const boxY = CANVAS_H - subtitleBoxHeight - SUBTITLE_MARGIN_BOTTOM_PX;
        const drawboxFilter = `drawbox=x=0:y=${boxY}:w=iw:h=${subtitleBoxHeight}:color=black@${SUBTITLE_BOX_OPACITY}:t=fill`;
        return `${drawboxFilter},${subFilter}`;
      })()
    : subFilter;
  const hwEncoder = resolveFfmpegHwEncoder();
  const videoMapLabel = isHardwareEncoder(hwEncoder) ? 'venc' : 'vout_final';
  const finalFormat = isHardwareEncoder(hwEncoder) ? ',format=nv12' : '';

  const filterParts: string[] = [];
  if (preparedSlideshow.filter) {
    filterParts.push(preparedSlideshow.filter);
  }
  let videoInputLabel = preparedSlideshow.outLabel;
  const audioInputIndex = preparedSlideshow.clipPaths.length;
  let nextInputIndex = audioInputIndex + 1;
  let smallVideoInputLabel: string | null = null;
  let avatarInputLabel: string | null = null;
  const extraInputs: string[] = [];

  if (preparedSmallVideoPath) {
    extraInputs.push('-stream_loop', '-1', '-i', preparedSmallVideoPath);
    smallVideoInputLabel = `${nextInputIndex}:v`;
    nextInputIndex += 1;
  }

  if (preparedAvatarPath) {
    extraInputs.push('-f', 'image2', '-loop', '1', '-framerate', String(FPS), '-i', preparedAvatarPath);
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
    `[${videoInputLabel}]format=yuv420p,fps=${FPS},${videoFilters}${finalFormat}[${videoMapLabel}]`,
  );
  filterParts.push(`[${audioInputIndex}:a]atempo=${speed}[aout]`);

  await fs.writeFile(filterScriptPath, filterParts.join(';'), 'utf-8');

  const aiEncodeOpts = { preset: 'fast' as const, crf: 20 };
  const mergeArgs = [
    '-hide_banner',
    '-y',
    ...preparedSlideshow.clipPaths.flatMap(clipPath => ['-i', clipPath]),
    '-i', audioPath,
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
    '-movflags',
    '+faststart',
    outputPath,
  ];

  log(
    `[ai-video] One-pass compose + mux (${preparedSlideshow.clipPaths.length} clips, ` +
      `~${preparedSlideshow.totalDuration.toFixed(1)}s)...`,
  );
  await runFfmpegFilterComplex(mergeArgs, {
    encodeOpts: aiEncodeOpts,
    expectedDurationSec: audioDurationAfterTempo,
    onLog,
    label: 'ai-compose-mux',
  });

  await fs.unlink(filterScriptPath).catch(() => undefined);
  await fs.unlink(tempAssPath).catch(() => undefined);
  if (scaledSrtPath) {
    await fs.unlink(scaledSrtPath).catch(() => undefined);
  }

  await pruneSlideshowCache(preparedSlideshow.cacheDir, {
    keepPaths: preparedSlideshow.clipPaths,
    onLog,
  });

  log(`[ai-video] Video saved → ${outputPath}`);
  return outputPath;
}
