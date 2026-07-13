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
  SI_CANVAS_H,
  SI_CANVAS_W,
  SI_FPS,
  // SI_NOISE_ALPHA, // TODO: re-enable SI noise
  SI_LOCAL_STOCK_SKIP_END_SEC,
  SI_LOCAL_STOCK_SKIP_START_SEC,
  SI_LOCAL_STOCK_SLOWMO_FACTOR,
  SI_LOCAL_STOCK_ZOOM_FACTOR,
  SI_STOCK_DIM_FACTOR,
  SI_STOCK_SLOWMO_FACTOR,
  SI_STOCK_ZOOM_FACTOR,
} from './si.constants.js';
// import { getPrebakedNoiseMov } from './si-prebake.js'; // TODO: re-enable SI noise

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

function buildSiLocalStockCropScaleFilter(): string {
  const cropW = Math.floor(SI_CANVAS_W / SI_LOCAL_STOCK_ZOOM_FACTOR / 2) * 2;
  const cropH = Math.floor(SI_CANVAS_H / SI_LOCAL_STOCK_ZOOM_FACTOR / 2) * 2;

  return [
    `setpts=${SI_LOCAL_STOCK_SLOWMO_FACTOR}*PTS`,
    `fps=${SI_FPS}`,
    `crop=${cropW}:${cropH}`,
    `scale=${SI_CANVAS_W}:${SI_CANVAS_H}`,
    'format=yuv420p',
  ].join(',');
}

function resolveLocalStockCutDuration(inputDurationSec: number): number {
  return Math.max(0, inputDurationSec - SI_LOCAL_STOCK_SKIP_START_SEC - SI_LOCAL_STOCK_SKIP_END_SEC);
}

/** Remote stock prepare: fps before setpts (legacy behavior for assemble-time cut). */
export function buildSiStockPrepareVideoFilter(): string {
  const cropW = Math.floor(SI_CANVAS_W / SI_STOCK_ZOOM_FACTOR / 2) * 2;
  const cropH = Math.floor(SI_CANVAS_H / SI_STOCK_ZOOM_FACTOR / 2) * 2;

  return appendPixelFormatToVideoFilter(
    [
      `fps=${SI_FPS}`,
      `setpts=${SI_STOCK_SLOWMO_FACTOR}*PTS`,
      `crop=${cropW}:${cropH}`,
      `scale=${SI_CANVAS_W}:${SI_CANVAS_H}`,
      'format=yuv420p',
    ].join(','),
  );
}

/** Local stock prepare: setpts before fps for true 30fps output after slowmo. */
export function buildSiLocalStockPrepareVideoFilter(): string {
  return appendPixelFormatToVideoFilter(buildSiLocalStockCropScaleFilter());
}

export async function prepareRawStockVideoClip(
  inputPath: string,
  outputPath: string,
  options?: PrepareRawStockVideoClipOptions,
): Promise<string> {
  const { onLog, skipStartSec, durationSec, label = 'si-stock-prepare' } = options ?? {};
  const vf = buildSiStockPrepareVideoFilter();
  const stockEncodeOpts = { preset: 'fast' as const };

  const args = ['-hide_banner', '-loglevel', 'error', '-y'];

  if (skipStartSec !== undefined && skipStartSec > 0) {
    args.push('-ss', String(skipStartSec));
  }

  if (durationSec !== undefined && durationSec > 0) {
    args.push('-t', String(durationSec));
  }

  args.push(
    '-i',
    inputPath,
    '-vf',
    vf,
    '-an',
    ...buildH264VideoEncoderArgs(stockEncodeOpts),
    outputPath,
  );

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

  // TODO: re-enable SI noise
  // const prebakedNoise = await getPrebakedNoiseMov(
  //   noiseSourcePath,
  //   SI_CANVAS_W,
  //   SI_CANVAS_H,
  //   SI_FPS,
  //   SI_NOISE_ALPHA,
  // );
  // const noiseInputPath = prebakedNoise ?? noiseSourcePath;

  const hwEncoder = resolveFfmpegHwEncoder();
  const videoMapLabel = isHardwareEncoder(hwEncoder) ? 'venc' : 'vout';
  const finalFormat = isHardwareEncoder(hwEncoder) ? ',format=nv12' : '';

  const inputDurationSec = await getMediaDurationSeconds(inputPath);
  const cutDurationSec = resolveLocalStockCutDuration(inputDurationSec);
  if (cutDurationSec <= 0) {
    throw new Error(
      `Video too short after cut (need > ${SI_LOCAL_STOCK_SKIP_START_SEC + SI_LOCAL_STOCK_SKIP_END_SEC}s, got ${inputDurationSec.toFixed(1)}s)`,
    );
  }

  onLog?.(
    `[reup-si] Local prepare: ${cutDurationSec.toFixed(1)}s | zoom ${SI_LOCAL_STOCK_ZOOM_FACTOR}x | slowmo ${SI_LOCAL_STOCK_SLOWMO_FACTOR}x`,
  );

  const baseVf = buildSiLocalStockCropScaleFilter();
  const filterParts = [
    `[0:v]${baseVf},lutyuv=y='val*${SI_STOCK_DIM_FACTOR}':u='val':v='val'${finalFormat}[${videoMapLabel}]`,
    // TODO: re-enable SI noise
    // prebakedNoise
    //   ? `[1:v]null[si_noise]`
    //   : `[1:v]fps=${SI_FPS},scale=${SI_CANVAS_W}:${SI_CANVAS_H}:flags=fast_bilinear,format=yuva420p,colorkey=0x000000:0.1:0.1,colorchannelmixer=aa=${SI_NOISE_ALPHA}[si_noise]`,
    // `[v_dimmed][si_noise]overlay=0:0:shortest=1${finalFormat}[${videoMapLabel}]`,
  ];

  const workDir = path.dirname(outputPath);
  const filterScriptPath = path.join(workDir, `_prepare_filter_${path.parse(outputPath).name}.txt`);
  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(filterScriptPath, filterParts.join(';'), 'utf-8');

  const mergeArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
  ];

  if (SI_LOCAL_STOCK_SKIP_START_SEC > 0) {
    mergeArgs.push('-ss', String(SI_LOCAL_STOCK_SKIP_START_SEC));
  }

  mergeArgs.push('-i', inputPath);

  if (SI_LOCAL_STOCK_SKIP_START_SEC > 0 || SI_LOCAL_STOCK_SKIP_END_SEC > 0) {
    mergeArgs.push('-t', String(cutDurationSec));
  }

  mergeArgs.push(
    // TODO: re-enable SI noise
    // '-stream_loop',
    // '-1',
    // '-i',
    // noiseInputPath,
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
