import fs from 'node:fs/promises';
import path from 'node:path';
import { youtubeDl } from 'youtube-dl-exec';
import { spawn } from 'node:child_process';
import { env } from '../../../../config/env.js';
import { AppError } from '../../../../shared/http/errors.js';
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

function pickRandomVideo<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function selectEligibleStockVideo(videos: SourceVideoRecord[], targetDurationSec: number): SourceVideoRecord | null {
  const withUrl = videos.filter(v => v.url?.trim());
  const eligible = withUrl.filter(v => getSiEffectiveStockDuration(v.duration) >= targetDurationSec);
  return pickRandomVideo(eligible);
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

async function runFfmpegEncode(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(env.ffmpegPath, args);
    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });

    proc.on('error', err => {
      reject(new Error(`ffmpeg not available: ${err.message}`));
    });
  });
}

async function prepareStockClip(rawVideoPath: string, targetDuration: number, outputDir: string): Promise<string> {
  const clipPath = path.join(outputDir, 'stock_processed.mp4');
  const sourceDuration = targetDuration / SI_STOCK_SLOWMO_FACTOR;

  const scaledW = Math.ceil((SI_CANVAS_W * SI_STOCK_ZOOM_FACTOR) / 2) * 2;
  const scaledH = Math.ceil((SI_CANVAS_H * SI_STOCK_ZOOM_FACTOR) / 2) * 2;

  const vf = [
    `fps=${SI_FPS}`,
    `setpts=${SI_STOCK_SLOWMO_FACTOR}*PTS`,
    `scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase:flags=fast_bilinear`,
    `crop=${SI_CANVAS_W}:${SI_CANVAS_H}`,
    'format=yuv420p',
  ].join(',');

  await runFfmpegEncode([
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
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    clipPath,
  ]);

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
): Promise<PrepareSiStockBackgroundResult> {
  const ids = [...new Set(backgroundFootageSourceIds.map(id => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    throw new AppError('No background footage sources configured', 400, 'SI_STOCK_SOURCE_EMPTY');
  }

  const pooledVideos: SourceVideoRecord[] = [];
  for (const sourceId of ids) {
    const store = sourceVideosRepository.read(sourceId);
    if (store?.videos?.length) {
      pooledVideos.push(...store.videos);
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
  if (!chosen?.url) {
    throw new AppError(
      `No background footage video long enough (need effective >= ${Math.ceil(targetDurationSec)}s)`,
      400,
      'SI_STOCK_NOT_LONG_ENOUGH',
    );
  }

  const stockTempDir = path.join(workDir, '_stock_tmp');
  await fs.mkdir(stockTempDir, { recursive: true });

  console.log(`[reup-si] Selected stock video: ${chosen.url}`);
  const rawPath = await downloadStockVideoNoAudio(chosen.url, stockTempDir);
  const stockClipPath = await prepareStockClip(rawPath, targetDurationSec, stockTempDir);

  return { stockClipPath, stockTempDir };
}

export async function cleanupSiStockTempDir(stockTempDir: string): Promise<void> {
  await fs.rm(stockTempDir, { recursive: true, force: true }).catch(() => undefined);
}
