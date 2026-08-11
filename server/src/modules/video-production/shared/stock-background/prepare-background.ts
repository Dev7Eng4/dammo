import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveSourceChannelVideoDir } from '../../../../config/paths.js';
import type { FfmpegProgress } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { downloadYoutubeVideo } from '../../../../infrastructure/youtube/youtube-video-downloader.js';
import { AppError } from '../../../../shared/http/errors.js';
import { timedStep } from '../../../../shared/timing/step-timer.js';
import { sourceVideosRepository } from '../../../source-channels/source-videos.repository.js';
import type { SourceVideoRecord } from '../../../source-channels/source-channels.types.js';
import {
  STOCK_MAX_SELECT_ATTEMPTS,
  STOCK_SKIP_START_SEC,
  STOCK_SLOWMO_FACTOR,
  getEffectiveStockDuration,
} from './stock-background.constants.js';
import type { PrepareStockBackgroundOptions, PrepareStockBackgroundResult } from './stock-background.types.js';
import { prepareRawStockVideoClip } from './stock-prepare.js';

export type { PrepareStockBackgroundOptions, PrepareStockBackgroundResult } from './stock-background.types.js';

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
    return getEffectiveStockDuration(item.video.duration) >= targetDurationSec;
  });

  if (eligible.length === 0) return null;

  const ranked = [...eligible].sort((a, b) => {
    const usedA = a.video.used ?? 0;
    const usedB = b.video.used ?? 0;
    if (usedA !== usedB) return usedA - usedB;

    const gapA = Math.abs(getEffectiveStockDuration(a.video.duration) - targetDurationSec);
    const gapB = Math.abs(getEffectiveStockDuration(b.video.duration) - targetDurationSec);
    if (gapA !== gapB) return gapA - gapB;

    return a.video.id.localeCompare(b.video.id);
  });

  return ranked[0] ?? null;
}

async function prepareStockClip(
  rawVideoPath: string,
  targetDuration: number,
  outputDir: string,
  onLog?: (msg: string) => void,
): Promise<string> {
  const clipPath = path.join(outputDir, 'stock_processed.mp4');
  const sourceDuration = targetDuration / STOCK_SLOWMO_FACTOR;

  return prepareRawStockVideoClip(rawVideoPath, clipPath, {
    skipStartSec: STOCK_SKIP_START_SEC,
    durationSec: sourceDuration,
    onLog,
    label: 'si-stock-clip',
  });
}

export async function prepareStockBackground(
  options: PrepareStockBackgroundOptions,
  targetDurationSec: number,
  workDir: string,
  onLog?: (msg: string) => void,
  _onFfmpegProgress?: (progress: FfmpegProgress) => void,
): Promise<PrepareStockBackgroundResult> {
  return prepareRemoteStockBackground(options.backgroundFootageSourceIds ?? [], targetDurationSec, workDir, onLog);
}

async function prepareRemoteStockBackground(
  backgroundFootageSourceIds: string[],
  targetDurationSec: number,
  workDir: string,
  onLog?: (msg: string) => void,
): Promise<PrepareStockBackgroundResult> {
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
    throw new AppError(`No background footage videos found for sources: ${ids.join(', ')}`, 400, 'SI_STOCK_SOURCE_EMPTY');
  }

  const downloadedVideos = pooledVideos.filter(item => item.video.status === 'Downloaded');
  const selectionPool = downloadedVideos.length > 0 ? downloadedVideos : pooledVideos;
  if (downloadedVideos.length > 0) {
    log(`[reup-si] Preferring ${downloadedVideos.length} pre-downloaded stock video(s) ` + `(of ${pooledVideos.length} in pool)`);
  } else {
    log(`[reup-si] No pre-downloaded stock videos; selecting from full pool (${pooledVideos.length})`);
  }

  const stockTempDir = path.join(workDir, '_stock_tmp');
  await fs.mkdir(stockTempDir, { recursive: true });

  const failedKeys = new Set<string>();
  const stepOpts = { prefix: '[reup-si]', onLog };

  for (let attempt = 1; attempt <= STOCK_MAX_SELECT_ATTEMPTS; attempt++) {
    const chosen = selectEligibleStockVideo(selectionPool, targetDurationSec, failedKeys);
    if (!chosen?.video.url) {
      break;
    }

    log(`[reup-si] Selected stock video (attempt ${attempt}/${STOCK_MAX_SELECT_ATTEMPTS}): ${chosen.video.url}`);

    let stockRawPath: string;
    try {
      const sourceVideoDir = resolveSourceChannelVideoDir(chosen.sourceId, chosen.video.id);
      const localVideoPath = sourceVideoDir ? path.join(sourceVideoDir, 'video.mp4') : null;
      const hasLocalVideo = localVideoPath
        ? await fs
            .access(localVideoPath)
            .then(() => true)
            .catch(() => false)
        : false;

      if (hasLocalVideo && localVideoPath) {
        stockRawPath = await timedStep(
          'Use pre-downloaded stock video',
          async () => {
            log(`[reup-si] Using pre-downloaded stock video: ${localVideoPath}`);
            return localVideoPath;
          },
          stepOpts,
        );
      } else {
        stockRawPath = await timedStep(
          'Download stock video',
          () =>
            downloadYoutubeVideo(chosen.video.url, stockTempDir, {
              outputBasename: 'stock_raw',
              onLog: msg => onLog?.(`[reup-si] ${msg}`),
            }),
          stepOpts,
        );
      }
    } catch {
      failedKeys.add(stockVideoKey(chosen.sourceId, chosen.video.id));
      log(`[reup-si] Stock download failed for ${chosen.video.url}, selecting another video...`);
      continue;
    }

    const nextUsed = sourceVideosRepository.incrementVideoUsed(chosen.sourceId, chosen.video.id);
    log(`[reup-si] Stock video marked used=${nextUsed}`);

    const stockClipPath = await timedStep(
      'Xử lý stock clip (ffmpeg)',
      () => prepareStockClip(stockRawPath, targetDurationSec, stockTempDir, onLog),
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
    `Failed to download stock background video after ${STOCK_MAX_SELECT_ATTEMPTS} attempt(s), ${failedKeys.size} video(s) excluded`,
    502,
    'SI_STOCK_DOWNLOAD_FAILED',
  );
}

export async function cleanupStockTempDir(stockTempDir: string): Promise<void> {
  await fs.rm(stockTempDir, { recursive: true, force: true }).catch(() => undefined);
}
