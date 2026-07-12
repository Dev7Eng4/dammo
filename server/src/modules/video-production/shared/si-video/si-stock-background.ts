import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeDl } from '../../../../infrastructure/youtube/youtube-dl-client.js';
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
  SI_STOCK_DOWNLOAD_FORMATS,
  SI_STOCK_MAX_SELECT_ATTEMPTS,
  SI_STOCK_SKIP_START_SEC,
  SI_STOCK_SLOWMO_FACTOR,
  SI_STOCK_ZOOM_FACTOR,
  getSiEffectiveStockDuration,
} from './si.constants.js';

type PooledStockVideo = { sourceId: string; video: SourceVideoRecord };

export function stockVideoKey(sourceId: string, videoId: string): string {
  return `${sourceId}:${videoId}`;
}

export function selectEligibleStockVideo(
  items: PooledStockVideo[],
  targetDurationSec: number,
  excludeKeys?: ReadonlySet<string>,
): PooledStockVideo | null {
  const eligible = items.filter(item => {
    if (!item.video.url?.trim()) return false;
    if (excludeKeys?.has(stockVideoKey(item.sourceId, item.video.id))) return false;
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

interface StockDownloadSuccess {
  ok: true;
  path: string;
  formatIndex: number;
}

interface StockDownloadFailure {
  ok: false;
}

type StockDownloadResult = StockDownloadSuccess | StockDownloadFailure;

async function downloadStockVideoNoAudio(url: string, outputDir: string, onLog?: (msg: string) => void): Promise<StockDownloadResult> {
  await fs.mkdir(outputDir, { recursive: true });
  const outPath = path.join(outputDir, 'stock_raw.mp4');

  for (let i = 0; i < SI_STOCK_DOWNLOAD_FORMATS.length; i++) {
    const format = SI_STOCK_DOWNLOAD_FORMATS[i]!;
    await fs.unlink(outPath).catch(() => undefined);

    try {
      await youtubeDl(url, {
        ...getYoutubeDlCommonOptions(),
        format,
        output: outPath,
      });
      await fs.access(outPath);
      const formatLabel = i === 0 ? '720p MP4 H.264 fps<=30' : '720p MP4';
      onLog?.(`[reup-si] Stock download succeeded with format ${i + 1}/${SI_STOCK_DOWNLOAD_FORMATS.length} (${formatLabel})`);
      return { ok: true, path: outPath, formatIndex: i };
    } catch {
      onLog?.(`[reup-si] Stock download format ${i + 1}/${SI_STOCK_DOWNLOAD_FORMATS.length} failed, trying next...`);
    }
  }

  return { ok: false };
}

async function prepareStockClip(
  rawVideoPath: string,
  targetDuration: number,
  outputDir: string,
  onLog?: (msg: string) => void,
): Promise<string> {
  const clipPath = path.join(outputDir, 'stock_processed.mp4');
  const sourceDuration = targetDuration / SI_STOCK_SLOWMO_FACTOR;

  const cropW = Math.floor(SI_CANVAS_W / SI_STOCK_ZOOM_FACTOR / 2) * 2;
  const cropH = Math.floor(SI_CANVAS_H / SI_STOCK_ZOOM_FACTOR / 2) * 2;

  const vf = appendPixelFormatToVideoFilter(
    [
      `fps=${SI_FPS}`,
      `setpts=${SI_STOCK_SLOWMO_FACTOR}*PTS`,
      `crop=${cropW}:${cropH}`,
      `scale=${SI_CANVAS_W}:${SI_CANVAS_H}`,
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
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

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

  const stockTempDir = path.join(workDir, '_stock_tmp');
  await fs.mkdir(stockTempDir, { recursive: true });

  const failedKeys = new Set<string>();
  const stepOpts = { prefix: '[reup-si]', onLog };

  for (let attempt = 1; attempt <= SI_STOCK_MAX_SELECT_ATTEMPTS; attempt++) {
    const chosen = selectEligibleStockVideo(pooledVideos, targetDurationSec, failedKeys);
    if (!chosen?.video.url) {
      break;
    }

    log(
      `[reup-si] Selected stock video (attempt ${attempt}/${SI_STOCK_MAX_SELECT_ATTEMPTS}): ${chosen.video.url}`,
    );

    const downloadResult = await timedStep(
      'Download stock video',
      () => downloadStockVideoNoAudio(chosen.video.url, stockTempDir, onLog),
      stepOpts,
    );

    if (!downloadResult.ok) {
      failedKeys.add(stockVideoKey(chosen.sourceId, chosen.video.id));
      log(
        `[reup-si] Stock download failed for ${chosen.video.url}, selecting another video...`,
      );
      continue;
    }

    const nextUsed = sourceVideosRepository.incrementVideoUsed(chosen.sourceId, chosen.video.id);
    log(`[reup-si] Stock video marked used=${nextUsed}`);

    const stockClipPath = await timedStep(
      'Xử lý stock clip (ffmpeg)',
      () => prepareStockClip(downloadResult.path, targetDurationSec, stockTempDir, onLog),
      stepOpts,
    );

    return { stockClipPath, stockTempDir };
  }

  if (failedKeys.size === 0) {
    throw new AppError(
      `No background footage video long enough (need effective >= ${Math.ceil(targetDurationSec)}s)`,
      400,
      'SI_STOCK_NOT_LONG_ENOUGH',
    );
  }

  throw new AppError(
    `Failed to download stock background video after ${SI_STOCK_MAX_SELECT_ATTEMPTS} attempt(s), ${failedKeys.size} video(s) excluded`,
    502,
    'SI_STOCK_DOWNLOAD_FAILED',
  );
}

export async function cleanupSiStockTempDir(stockTempDir: string): Promise<void> {
  await fs.rm(stockTempDir, { recursive: true, force: true }).catch(() => undefined);
}
