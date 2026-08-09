import fs from 'node:fs/promises';
import path from 'node:path';
import {
  appendPixelFormatToVideoFilter,
  buildH264VideoEncoderArgs,
  isHardwareEncoder,
  resolveFfmpegHwEncoder,
} from '../../../../infrastructure/ffmpeg/ffmpeg-encoder.js';
import { runFfmpeg, runFfmpegFilterComplex } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { getMediaDurationSeconds } from '../../../../infrastructure/ffmpeg/ffmpeg-probe.js';
import {
  LOCAL_STOCK_SKIP_END_SEC,
  LOCAL_STOCK_SKIP_START_SEC,
  LOCAL_STOCK_SLOWMO_FACTOR,
  LOCAL_STOCK_ZOOM_FACTOR,
  STOCK_CANVAS_H,
  STOCK_CANVAS_W,
  STOCK_CROP_PAN_MAX,
  STOCK_CROP_PAN_MIN,
  STOCK_DIM_FACTOR,
  STOCK_FPS,
  STOCK_SLOWMO_FACTOR,
  STOCK_ZOOM_FACTOR,
} from './stock-background.constants.js';

export interface StockCropPan {
  fx: number;
  fy: number;
}

export function randomStockCropPan(): StockCropPan {
  const span = STOCK_CROP_PAN_MAX - STOCK_CROP_PAN_MIN;
  return {
    fx: STOCK_CROP_PAN_MIN + Math.random() * span,
    fy: STOCK_CROP_PAN_MIN + Math.random() * span,
  };
}

export function formatStockCropPanLog(pan: StockCropPan): string {
  return `stock crop pan fx=${pan.fx.toFixed(2)} fy=${pan.fy.toFixed(2)}`;
}

/** FFmpeg crop with pan fractions in [0,1] of available (in_w-out_w)/(in_h-out_h) slack. */
export function buildStockCropFilter(cropW: number, cropH: number, pan: StockCropPan): string {
  const fx = pan.fx.toFixed(4);
  const fy = pan.fy.toFixed(4);
  return `crop=${cropW}:${cropH}:(in_w-out_w)*${fx}:(in_h-out_h)*${fy}`;
}

export interface PrepareRawStockVideoClipOptions {
  onLog?: (msg: string) => void;
  skipStartSec?: number;
  durationSec?: number;
  label?: string;
}

export interface PrepareBakedLocalStockClipOptions {
  onLog?: (msg: string) => void;
  label?: string;
}

function buildLocalStockCropScaleFilter(pan: StockCropPan = randomStockCropPan()): {
  filter: string;
  pan: StockCropPan;
} {
  const cropW = Math.floor(STOCK_CANVAS_W / LOCAL_STOCK_ZOOM_FACTOR / 2) * 2;
  const cropH = Math.floor(STOCK_CANVAS_H / LOCAL_STOCK_ZOOM_FACTOR / 2) * 2;

  return {
    pan,
    filter: [
      `setpts=${LOCAL_STOCK_SLOWMO_FACTOR}*PTS`,
      `fps=${STOCK_FPS}`,
      buildStockCropFilter(cropW, cropH, pan),
      `scale=${STOCK_CANVAS_W}:${STOCK_CANVAS_H}`,
      'format=yuv420p',
    ].join(','),
  };
}

function resolveLocalStockCutDuration(inputDurationSec: number): number {
  return Math.max(0, inputDurationSec - LOCAL_STOCK_SKIP_START_SEC - LOCAL_STOCK_SKIP_END_SEC);
}

/** Remote stock prepare: fps before setpts (legacy behavior for assemble-time cut). */
export function buildStockPrepareVideoFilter(pan: StockCropPan = randomStockCropPan()): {
  filter: string;
  pan: StockCropPan;
} {
  const cropW = Math.floor(STOCK_CANVAS_W / STOCK_ZOOM_FACTOR / 2) * 2;
  const cropH = Math.floor(STOCK_CANVAS_H / STOCK_ZOOM_FACTOR / 2) * 2;

  return {
    pan,
    filter: appendPixelFormatToVideoFilter(
      [
        `fps=${STOCK_FPS}`,
        `setpts=${STOCK_SLOWMO_FACTOR}*PTS`,
        buildStockCropFilter(cropW, cropH, pan),
        `scale=${STOCK_CANVAS_W}:${STOCK_CANVAS_H}`,
        'format=yuv420p',
      ].join(','),
    ),
  };
}

/** Local stock prepare: setpts before fps for true 30fps output after slowmo. */
export function buildLocalStockPrepareVideoFilter(pan?: StockCropPan): {
  filter: string;
  pan: StockCropPan;
} {
  const built = buildLocalStockCropScaleFilter(pan);
  return { pan: built.pan, filter: appendPixelFormatToVideoFilter(built.filter) };
}

export async function prepareRawStockVideoClip(
  inputPath: string,
  outputPath: string,
  options?: PrepareRawStockVideoClipOptions,
): Promise<string> {
  const { onLog, skipStartSec, durationSec, label = 'si-stock-prepare' } = options ?? {};
  const { filter: vf, pan } = buildStockPrepareVideoFilter();
  onLog?.(`[reup-si] ${formatStockCropPanLog(pan)}`);
  const stockEncodeOpts = { preset: 'veryfast' as const };

  const args = ['-hide_banner', '-loglevel', 'error', '-y'];

  if (skipStartSec !== undefined && skipStartSec > 0) {
    args.push('-ss', String(skipStartSec));
  }

  if (durationSec !== undefined && durationSec > 0) {
    args.push('-t', String(durationSec));
  }

  args.push('-i', inputPath, '-vf', vf, '-an', ...buildH264VideoEncoderArgs(stockEncodeOpts), outputPath);

  await runFfmpeg(args, { encodeOpts: stockEncodeOpts, onLog, label });

  return outputPath;
}

export async function prepareBakedLocalStockClip(
  inputPath: string,
  outputPath: string,
  _noiseSourcePath: string,
  options?: PrepareBakedLocalStockClipOptions,
): Promise<string> {
  const { onLog, label = 'si-local-stock-prepare' } = options ?? {};
  const stockEncodeOpts = { preset: 'fast' as const };

  const hwEncoder = resolveFfmpegHwEncoder();
  const videoMapLabel = isHardwareEncoder(hwEncoder) ? 'venc' : 'vout';
  const finalFormat = isHardwareEncoder(hwEncoder) ? ',format=nv12' : '';

  const inputDurationSec = await getMediaDurationSeconds(inputPath);
  const cutDurationSec = resolveLocalStockCutDuration(inputDurationSec);
  if (cutDurationSec <= 0) {
    throw new Error(
      `Video too short after cut (need > ${LOCAL_STOCK_SKIP_START_SEC + LOCAL_STOCK_SKIP_END_SEC}s, got ${inputDurationSec.toFixed(1)}s)`,
    );
  }

  onLog?.(
    `[reup-si] Local prepare: ${cutDurationSec.toFixed(1)}s | zoom ${LOCAL_STOCK_ZOOM_FACTOR}x | slowmo ${LOCAL_STOCK_SLOWMO_FACTOR}x`,
  );

  const { filter: baseVf, pan } = buildLocalStockCropScaleFilter();
  onLog?.(`[reup-si] ${formatStockCropPanLog(pan)}`);
  const filterParts = [`[0:v]${baseVf},lutyuv=y='val*${STOCK_DIM_FACTOR}':u='val':v='val'${finalFormat}[${videoMapLabel}]`];

  const workDir = path.dirname(outputPath);
  const filterScriptPath = path.join(workDir, `_prepare_filter_${path.parse(outputPath).name}.txt`);
  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(filterScriptPath, filterParts.join(';'), 'utf-8');

  const mergeArgs = ['-hide_banner', '-loglevel', 'error', '-y'];

  if (LOCAL_STOCK_SKIP_START_SEC > 0) {
    mergeArgs.push('-ss', String(LOCAL_STOCK_SKIP_START_SEC));
  }

  mergeArgs.push('-i', inputPath);

  if (LOCAL_STOCK_SKIP_START_SEC > 0 || LOCAL_STOCK_SKIP_END_SEC > 0) {
    mergeArgs.push('-t', String(cutDurationSec));
  }

  mergeArgs.push(
    '-filter_complex_script',
    filterScriptPath,
    '-map',
    `[${videoMapLabel}]`,
    '-an',
    ...buildH264VideoEncoderArgs(stockEncodeOpts),
    outputPath,
  );

  try {
    await runFfmpegFilterComplex(mergeArgs, {
      encodeOpts: stockEncodeOpts,
      onLog,
      label,
    });
  } finally {
    await fs.unlink(filterScriptPath).catch(() => undefined);
  }

  return outputPath;
}

export function resolveLocalStockOutputPath(inputPath: string, outputDir: string): string {
  const baseName = path.parse(inputPath).name;
  return path.join(outputDir, `${baseName}.mp4`);
}
