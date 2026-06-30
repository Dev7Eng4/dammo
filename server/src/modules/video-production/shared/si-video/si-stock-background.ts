import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeDl } from 'youtube-dl-exec';
import { AppError } from '../../../../shared/http/errors.js';
import { timedStep } from '../../../../shared/timing/step-timer.js';
import {
  appendPixelFormatToVideoFilter,
  buildH264VideoEncoderArgs,
} from '../../../../infrastructure/ffmpeg/ffmpeg-encoder.js';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { getYoutubeDlCommonOptions } from '../../../../infrastructure/youtube/youtube-dl-auth.js';
import { sourceVideosRepository } from '../../../source-channels/source-videos.repository.js';
import type { SourceVideoRecord } from '../../../source-channels/source-channels.types.js';
import {
  SI_CANVAS_H,
  SI_CANVAS_W,
  SI_FPS,
  SI_STOCK_SKIP_START_SEC,
  SI_STOCK_SLOWMO_FACTOR,
  SI_STOCK_ZOOM_FACTOR,
  getSiEffectiveStockDuration,
} from './si.constants.js';

const PREFERRED_VIDEO_FORMATS = [
  'bestvideo[height=480][ext=mp4]',
  'bestvideo[height=480]',
  'bestvideo[height=360][ext=mp4]',
  'bestvideo[height=360]',
  'bestvideo[height=720][ext=mp4]',
  'bestvideo[height=720]',
  'bestvideo[ext=mp4]',
  'bestvideo',
];

type PooledStockVideo = { sourceId: string; video: SourceVideoRecord };

export function selectEligibleStockVideo(
  items: PooledStockVideo[],
  targetDurationSec: number,
): PooledStockVideo | null {
  const eligible = items.filter(item => {
    if (!item.video.url?.trim()) return false;
    return getSiEffectiveStockDuration(item.video.duration) >= targetDurationSec;
  });

  if (eligible.length === 0) return null;

  const ranked = [...eligible].sort((a, b) => {
    const usedA = a.video.used ?? 0;
    const usedB = b.video.used ?? 0;
    if (usedA !== usedB) return usedA - usedB;

    const gapA = Math.abs(getSiEffectiveStockDuration(a.video.duration) - targetDurationSec);
    const gapB = Math.abs(getSiEffectiveStockDuration(b.video.duration) - targetDurationSec);
    if (gapA !== gapB) return gapA - gapB;

    return a.video.id.localeCompare(b.video.id);
  });

  return ranked[0] ?? null;
}

async function downloadStockVideoNoAudio(url: string, outputDir: string): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true });
  const outPath = path.join(outputDir, 'stock_raw.mp4');

  for (const format of PREFERRED_VIDEO_FORMATS) {
    try {
      await youtubeDl(url, {
        ...getYoutubeDlCommonOptions(),
        format,
        output: outPath,
      });
      await fs.access(outPath);
      return outPath;
    } catch {
      // try next format
    }
  }

  throw new AppError(`Failed to download stock background video: ${url}`, 502, 'SI_STOCK_DOWNLOAD_FAILED');
}

async function prepareStockClip(
  rawVideoPath: string,
  targetDuration: number,
  outputDir: string,
  onLog?: (msg: string) => void,
): Promise<string> {
  const clipPath = path.join(outputDir, 'stock_processed.mp4');
  const sourceDuration = targetDuration / SI_STOCK_SLOWMO_FACTOR;

  const scaledW = Math.ceil((SI_CANVAS_W * SI_STOCK_ZOOM_FACTOR) / 2) * 2;
  const scaledH = Math.ceil((SI_CANVAS_H * SI_STOCK_ZOOM_FACTOR) / 2) * 2;

  const vf = appendPixelFormatToVideoFilter(
    [
      `fps=${SI_FPS}`,
      `setpts=${SI_STOCK_SLOWMO_FACTOR}*PTS`,
      `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase:flags=fast_bilinear`,
      `crop=${SI_CANVAS_W}:${SI_CANVAS_H}`,
      'format=yuv420p',
    ].join(','),
  );

  const stockEncodeOpts = { preset: 'fast' as const };
  await runFfmpeg(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(SI_STOCK_SKIP_START_SEC),
      '-t',
      String(sourceDuration),
      '-i',
      rawVideoPath,
      '-vf',
      vf,
      '-an',
      ...buildH264VideoEncoderArgs(stockEncodeOpts),
      clipPath,
    ],
    { encodeOpts: stockEncodeOpts, onLog, label: 'si-stock-clip' },
  );

  return clipPath;
}

export interface PrepareSiStockBackgroundResult {
  stockClipPath: string;
  stockTempDir: string;
}

export async function prepareSiStockBackground(
  backgroundFootageSourceIds: string[],
  targetDurationSec: number,
  workDir: string,
  onLog?: (msg: string) => void,
): Promise<PrepareSiStockBackgroundResult> {
  const ids = [...new Set(backgroundFootageSourceIds.map(id => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new AppError('No background footage sources configured', 400, 'SI_STOCK_SOURCE_EMPTY');
  }

  const pooledVideos: PooledStockVideo[] = [];
  for (const sourceId of ids) {
    const store = sourceVideosRepository.read(sourceId);
    if (store?.videos?.length) {
      for (const video of store.videos) {
        pooledVideos.push({ sourceId, video });
      }
    }
  }

  if (pooledVideos.length === 0) {
    throw new AppError(
      `No background footage videos found for sources: ${ids.join(', ')}`,
      400,
      'SI_STOCK_SOURCE_EMPTY',
    );
  }

  const chosen = selectEligibleStockVideo(pooledVideos, targetDurationSec);
  if (!chosen?.video.url) {
    throw new AppError(
      `No background footage video long enough (need effective >= ${Math.ceil(targetDurationSec)}s)`,
      400,
      'SI_STOCK_NOT_LONG_ENOUGH',
    );
  }

  const stockTempDir = path.join(workDir, '_stock_tmp');
  await fs.mkdir(stockTempDir, { recursive: true });

  const nextUsed = sourceVideosRepository.incrementVideoUsed(chosen.sourceId, chosen.video.id);
  const stepOpts = { prefix: '[reup-si]', onLog };
  const selectedMsg = `[reup-si] Selected stock video: ${chosen.video.url} (used=${nextUsed})`;
  console.log(selectedMsg);
  onLog?.(selectedMsg);

  const rawPath = await timedStep(
    'Download stock video',
    () => downloadStockVideoNoAudio(chosen.video.url, stockTempDir),
    stepOpts,
  );
  const stockClipPath = await timedStep(
    'Xử lý stock clip (ffmpeg)',
    () => prepareStockClip(rawPath, targetDurationSec, stockTempDir, onLog),
    stepOpts,
  );

  return { stockClipPath, stockTempDir };
}

export async function cleanupSiStockTempDir(stockTempDir: string): Promise<void> {
  await fs.rm(stockTempDir, { recursive: true, force: true }).catch(() => undefined);
}
