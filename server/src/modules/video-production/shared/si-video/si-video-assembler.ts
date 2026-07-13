import fs from 'node:fs/promises';
import path from 'node:path';
import type { FfmpegProgress } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { formatClockDuration, getAudioDurationSeconds } from '../../../../infrastructure/ffmpeg/ffmpeg-probe.js';
import {
  buildH264VideoEncoderArgs,
  isHardwareEncoder,
  resolveFfmpegHwEncoder,
} from '../../../../infrastructure/ffmpeg/ffmpeg-encoder.js';
import { resizeImageToFit } from '../../../../infrastructure/ffmpeg/image-resize.js';
import { AppError } from '../../../../shared/http/errors.js';
import { timedStep } from '../../../../shared/timing/step-timer.js';
import { assertRequiredSiAssets } from './si-assets.js';
import {
  SI_CANVAS_H,
  SI_CANVAS_W,
  SI_CENTER_IMAGE_OPACITY,
  SI_CENTER_IMAGE_WIDTH_RATIO,
  SI_FPS,
  // SI_NOISE_ALPHA, // TODO: re-enable SI noise
  SI_OUTPUT_VIDEO_BASENAME,
  SI_STOCK_DIM_FACTOR,
  SI_STOCK_RENDER_EXTRA_SEC,
  SI_SUBTITLE_BOX_OPACITY,
  SI_SUBTITLE_MARGIN_BOTTOM_PX,
  type SiBackgroundFootageMode,
  resolveRandomSiAudioSpeed,
} from './si.constants.js';
import { runFfmpegFilterComplex } from './si-ffmpeg.js';
// import { getPrebakedNoiseMov } from './si-prebake.js'; // TODO: re-enable SI noise
import { cleanupSiStockTempDir, prepareSiStockBackground } from './si-stock-background.js';
import type { CaptionStyleKey } from './caption-styles.js';
import { resolveCaptionStyleKey } from './caption-styles.js';
import {
  convertSrtToAss,
  escapePathForFfmpegSubtitles,
  resolveJapaneseSubtitleStyle,
  scaleSrtTimestamps,
} from './si-subtitle.js';

function stockNormalizeFilterInner(slowmoFactor: number, isFlip = false): string {
  const w = SI_CANVAS_W;
  const h = SI_CANVAS_H;
  const f = SI_FPS;
  const factor = slowmoFactor;
  const slowmo = factor !== 1.0 ? `,setpts=${factor.toFixed(4)}*PTS` : '';
  const flipFilter = isFlip ? ',hflip' : '';
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p${flipFilter}${slowmo},fps=${f},setsar=1`;
}

function localStockNormalizeFilterChain(inputLabel: string, outLabel: string): string {
  const hwEncoder = resolveFfmpegHwEncoder();
  const pixFmt = isHardwareEncoder(hwEncoder) ? 'nv12' : 'yuv420p';
  return `[${inputLabel}]fps=${SI_FPS},setsar=1,format=${pixFmt}[${outLabel}]`;
}

function stockNormalizeFilterChain(inputLabel: string, outLabel: string, slowmoFactor: number, isFlip = false): string {
  return `[${inputLabel}]${stockNormalizeFilterInner(slowmoFactor, isFlip)}[${outLabel}]`;
}

export interface AssembleReupSiVideoInput {
  workDir: string;
  audioPath: string;
  subtitlePath: string;
  centerImagePath: string;
  backgroundFootageMode?: SiBackgroundFootageMode;
  backgroundFootageSourceIds?: string[];
  language: string;
  captionStyleKey?: CaptionStyleKey;
  onLog?: (msg: string) => void;
  onFfmpegProgress?: (progress: FfmpegProgress) => void;
}

export async function assembleReupSiVideo(input: AssembleReupSiVideoInput): Promise<string> {
  const {
    workDir,
    audioPath,
    subtitlePath,
    centerImagePath,
    backgroundFootageMode = 'source',
    backgroundFootageSourceIds = [],
    language,
    captionStyleKey,
    onLog,
    onFfmpegProgress,
  } = input;
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  for (const requiredPath of [audioPath, subtitlePath, centerImagePath]) {
    try {
      await fs.access(requiredPath);
    } catch {
      throw new AppError(`SI assembly missing input file: ${requiredPath}`, 400, 'SI_INPUT_MISSING');
    }
  }

  const assets = assertRequiredSiAssets(captionStyleKey);
  const speed = resolveRandomSiAudioSpeed();
  const originalAudioDuration = await getAudioDurationSeconds(audioPath);
  const audioDurationAfterTempo = originalAudioDuration / speed;

  log(
    `[reup-si] Audio ${originalAudioDuration.toFixed(1)}s → ${formatClockDuration(audioDurationAfterTempo)} after atempo ${speed.toFixed(3)}`,
  );

  const stockRenderTarget = audioDurationAfterTempo + SI_STOCK_RENDER_EXTRA_SEC;
  const stepOpts = { prefix: '[reup-si]', onLog };
  const { stockClipPath, stockTempDir } = await prepareSiStockBackground(
    {
      mode: backgroundFootageMode,
      backgroundFootageSourceIds,
    },
    stockRenderTarget,
    workDir,
    onLog,
    onFfmpegProgress,
  );

  const isLocalStock = backgroundFootageMode === 'local';

  let activeSubtitlePath = subtitlePath;
  let scaledSrtPath: string | null = null;

  const outputPath = path.join(workDir, `${SI_OUTPUT_VIDEO_BASENAME}.mp4`);
  const filterScriptPath = path.join(workDir, 'filter_complex.txt');
  const tempAssPath = path.join(workDir, 'temp_sub.ass');
  const resizedCenterImagePath = path.join(workDir, 'center_720.jpg');

  // let prebakedSiNoise: string | null = null; // TODO: re-enable SI noise
  // let siNoiseInputPath = assets.noisePath; // TODO: re-enable SI noise
  let mergeArgs: string[] = [];

  await timedStep(
    'Chuẩn bị subtitle',
    async () => {
      if (speed !== 1) {
        scaledSrtPath = path.join(workDir, 'temp_scaled_sub.srt');
        scaleSrtTimestamps(subtitlePath, scaledSrtPath, speed);
        activeSubtitlePath = scaledSrtPath;
      }

      await resizeImageToFit(centerImagePath, resizedCenterImagePath, SI_CANVAS_W, SI_CANVAS_H, onLog);

      // TODO: re-enable SI noise
      // if (!isLocalStock) {
      //   prebakedSiNoise = await getPrebakedNoiseMov(
      //     assets.noisePath,
      //     SI_CANVAS_W,
      //     SI_CANVAS_H,
      //     SI_FPS,
      //     SI_NOISE_ALPHA,
      //   );
      //   siNoiseInputPath = prebakedSiNoise ?? assets.noisePath;
      // }

      mergeArgs = ['-y'];
      let inputIdx = 0;

      mergeArgs.push('-stream_loop', '-1', '-i', stockClipPath);
      const stockIndex = inputIdx++;

      const audioIndex = inputIdx++;
      mergeArgs.push('-i', audioPath);

      const centerImgIndex = inputIdx++;
      mergeArgs.push('-loop', '1', '-i', resizedCenterImagePath);

      // TODO: re-enable SI noise
      // let siNoiseIndex: number | null = null;
      // if (!isLocalStock) {
      //   siNoiseIndex = inputIdx++;
      //   mergeArgs.push('-stream_loop', '-1', '-i', siNoiseInputPath);
      // }

      const filterParts: string[] = [];
      filterParts.push(`[${audioIndex}:a]atempo=${speed}[aout]`);

      const vBgLabel = 'vout_bg';
      if (isLocalStock) {
        filterParts.push(localStockNormalizeFilterChain(`${stockIndex}:v`, vBgLabel));
      } else {
        filterParts.push(stockNormalizeFilterChain(`${stockIndex}:v`, vBgLabel, 1.0, false));
      }

      let currentVLabel = vBgLabel;

      if (!isLocalStock) {
        filterParts.push(`[${currentVLabel}]lutyuv=y='val*${SI_STOCK_DIM_FACTOR}':u='val':v='val'[v_dimmed]`);
        currentVLabel = 'v_dimmed';
      }

      const targetW = Math.round(SI_CANVAS_W * SI_CENTER_IMAGE_WIDTH_RATIO);
      filterParts.push(
        `[${centerImgIndex}:v]fps=${SI_FPS},scale=${targetW}:-1,format=rgba,colorchannelmixer=aa=${SI_CENTER_IMAGE_OPACITY}[center_img]`,
      );
      filterParts.push(
        `[${currentVLabel}][center_img]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2:shortest=1[v_centered_img]`,
      );
      currentVLabel = 'v_centered_img';

      // TODO: re-enable SI noise
      // if (!isLocalStock && siNoiseIndex !== null) {
      //   if (prebakedSiNoise) {
      //     filterParts.push(`[${siNoiseIndex}:v]null[si_noise]`);
      //   } else {
      //     filterParts.push(
      //       `[${siNoiseIndex}:v]fps=${SI_FPS},scale=${SI_CANVAS_W}:${SI_CANVAS_H}:flags=fast_bilinear,format=yuva420p,colorkey=0x000000:0.1:0.1,colorchannelmixer=aa=${SI_NOISE_ALPHA}[si_noise]`,
      //     );
      //   }
      //   filterParts.push(`[${currentVLabel}][si_noise]overlay=0:0:shortest=1[v_si_noised]`);
      //   currentVLabel = 'v_si_noised';
      // }

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
      filterParts.push(`[${currentVLabel}]${drawboxFilter},${subFilter}${finalFormat}[${videoMapLabel}]`);

      const fullGraph = filterParts.join(';');
      await fs.writeFile(filterScriptPath, fullGraph, 'utf-8');

      const siEncodeOpts = { preset: 'fast' as const };
      mergeArgs.push(
        '-filter_complex_script',
        filterScriptPath,
        '-map',
        `[${videoMapLabel}]`,
        '-map',
        '[aout]',
        ...buildH264VideoEncoderArgs(siEncodeOpts),
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-t',
        String(audioDurationAfterTempo),
        outputPath,
      );
    },
    stepOpts,
  );

  await timedStep(
    'Ghép video (ffmpeg)',
    () =>
      runFfmpegFilterComplex(mergeArgs, {
        encodeOpts: { preset: 'fast' },
        onLog,
        onProgress: onFfmpegProgress,
        expectedDurationSec: audioDurationAfterTempo,
        label: 'si-final-merge',
      }),
    stepOpts,
  );

  await fs.unlink(filterScriptPath).catch(() => undefined);
  await fs.unlink(tempAssPath).catch(() => undefined);
  await fs.unlink(resizedCenterImagePath).catch(() => undefined);
  if (scaledSrtPath) {
    await fs.unlink(scaledSrtPath).catch(() => undefined);
  }
  await cleanupSiStockTempDir(stockTempDir);

  log(`[reup-si] Video saved → ${outputPath}`);
  return outputPath;
}
