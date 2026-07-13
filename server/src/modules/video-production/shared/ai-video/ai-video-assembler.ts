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
import { pickAutoEffects } from '../slideshow/slideshow-presets.js';
import { SS_DEFAULT_TRANSITION_DURATION } from '../slideshow/slideshow.constants.js';
import { assertRequiredSiAssets } from '../si-video/si-assets.js';
import { resolveCaptionStyleKey } from '../si-video/caption-styles.js';
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
import type { AssembleReupAiSlideshowVideoInput } from './ai-video.types.js';

function computeSlideDurationSec(
  audioDurationSec: number,
  slideCount: number,
  transitionDurationSec: number,
): number {
  if (slideCount <= 1) {
    return Math.max(1, audioDurationSec);
  }

  const overlap = (slideCount - 1) * transitionDurationSec;
  const durationSec = (audioDurationSec + overlap) / slideCount;
  return Math.max(1, durationSec);
}

export async function assembleReupAiSlideshowVideo(
  input: AssembleReupAiSlideshowVideoInput,
): Promise<string> {
  const { workDir, imagePaths, audioPath, subtitlePath, language, captionStyleKey, onLog } = input;
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  if (imagePaths.length === 0) {
    throw new AppError('AI slideshow requires at least one image', 400, 'AI_SLIDESHOW_NO_IMAGES');
  }

  for (const requiredPath of [audioPath, subtitlePath, ...imagePaths]) {
    try {
      await fs.access(requiredPath);
    } catch {
      throw new AppError(`AI slideshow missing input file: ${requiredPath}`, 400, 'AI_INPUT_MISSING');
    }
  }

  const assets = assertRequiredSiAssets(captionStyleKey);
  const speed = resolveRandomSiAudioSpeed();
  const originalAudioDuration = await getAudioDurationSeconds(audioPath);
  const audioDurationAfterTempo = originalAudioDuration / speed;

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

  const transitionDurationSec = SS_DEFAULT_TRANSITION_DURATION;
  const durationSec = computeSlideDurationSec(
    audioDurationAfterTempo,
    imagePaths.length,
    transitionDurationSec,
  );

  log(`[ai-video] ${imagePaths.length} slides × ${durationSec.toFixed(2)}s (transition ${transitionDurationSec}s)`);

  const slides = pickAutoEffects(imagePaths, {
    durationSec,
    transitionDurationSec,
    shuffle: true,
  });

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
  const subtitleBoxHeight = Math.floor(SI_CANVAS_H / 3);
  const boxY = SI_CANVAS_H - subtitleBoxHeight - SI_SUBTITLE_MARGIN_BOTTOM_PX;
  const drawboxFilter = `drawbox=x=0:y=${boxY}:w=iw:h=${subtitleBoxHeight}:color=black@${SI_SUBTITLE_BOX_OPACITY}:t=fill`;
  const subFilter = `subtitles='${subPathEscaped}:fontsdir=${fontsDirEscaped}'`;
  const hwEncoder = resolveFfmpegHwEncoder();
  const videoMapLabel = isHardwareEncoder(hwEncoder) ? 'venc' : 'vout_final';
  const finalFormat = isHardwareEncoder(hwEncoder) ? ',format=nv12' : '';

  const filterParts = [
    `[0:v]format=yuv420p,fps=${SI_FPS},${drawboxFilter},${subFilter}${finalFormat}[${videoMapLabel}]`,
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

  log(`[ai-video] Video saved → ${outputPath}`);
  return outputPath;
}
