import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../../../../config/paths.js';
import { getMediaDurationSeconds } from '../../../../infrastructure/ffmpeg/ffmpeg-probe.js';
import { runFfmpeg } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import type { FfmpegProgress } from '../../../../infrastructure/ffmpeg/ffmpeg-runner.js';
import { AppError } from '../../../../shared/http/errors.js';
import { timedStep } from '../../../../shared/timing/step-timer.js';
import { SI_LOCAL_CYCLE_TARGET_SEC } from './si.constants.js';
import {
  ensureSiLocalStockDirExists,
  getSiLocalClipUsedCount,
  incrementSiLocalClipUsed,
} from './si-local-stock-usage.js';
import type { PrepareSiStockBackgroundResult } from './si-stock-background.js';

export interface LocalStockClip {
  filename: string;
  absolutePath: string;
  durationSec: number;
  used: number;
}

function escapeConcatListPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
}

async function scanLocalStockClips(): Promise<LocalStockClip[]> {
  ensureSiLocalStockDirExists();

  let entries: string[];
  try {
    entries = await fs.readdir(paths.siLocalStockDir);
  } catch {
    entries = [];
  }

  const clips: LocalStockClip[] = [];
  for (const entry of entries) {
    if (!entry.toLowerCase().endsWith('.mp4')) continue;
    if (entry === 'usage.json') continue;

    const absolutePath = path.join(paths.siLocalStockDir, entry);
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat?.isFile()) continue;

    const durationSec = await getMediaDurationSeconds(absolutePath);
    if (!Number.isFinite(durationSec) || durationSec <= 0) continue;

    clips.push({
      filename: entry,
      absolutePath,
      durationSec,
      used: getSiLocalClipUsedCount(entry),
    });
  }

  return clips;
}

export function selectLocalClipsForCycle(
  clips: LocalStockClip[],
  targetDurationSec: number,
): LocalStockClip[] {
  if (clips.length === 0) return [];

  const cycleTargetSec = Math.min(targetDurationSec, SI_LOCAL_CYCLE_TARGET_SEC);
  const ranked = [...clips].sort((a, b) => {
    if (a.used !== b.used) return a.used - b.used;
    return a.filename.localeCompare(b.filename);
  });

  const selected: LocalStockClip[] = [];
  let totalDuration = 0;

  for (const clip of ranked) {
    selected.push(clip);
    totalDuration += clip.durationSec;
    if (totalDuration >= cycleTargetSec) break;
  }

  return selected;
}

async function concatLocalClips(
  clips: LocalStockClip[],
  outputDir: string,
  onLog?: (msg: string) => void,
  onFfmpegProgress?: (progress: FfmpegProgress) => void,
): Promise<string> {
  const outputPath = path.join(outputDir, 'stock_local_cycle.mp4');
  const listPath = path.join(outputDir, 'stock_local_concat.txt');

  const listContent = clips
    .map(clip => `file '${escapeConcatListPath(clip.absolutePath)}'`)
    .join('\n');
  await fs.writeFile(listPath, listContent, 'utf-8');

  await runFfmpeg(
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listPath,
      '-c',
      'copy',
      outputPath,
    ],
    { onLog, onProgress: onFfmpegProgress, label: 'si-local-stock-concat' },
  );

  await fs.unlink(listPath).catch(() => undefined);
  return outputPath;
}

export async function prepareSiLocalStockBackground(
  targetDurationSec: number,
  workDir: string,
  onLog?: (msg: string) => void,
  onFfmpegProgress?: (progress: FfmpegProgress) => void,
): Promise<PrepareSiStockBackgroundResult> {
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  const stockTempDir = path.join(workDir, '_stock_tmp');
  await fs.mkdir(stockTempDir, { recursive: true });

  const clips = await scanLocalStockClips();
  if (clips.length === 0) {
    throw new AppError(
      `No local stock clips found in ${paths.siLocalStockDir}`,
      400,
      'SI_LOCAL_STOCK_EMPTY',
    );
  }

  const selected = selectLocalClipsForCycle(clips, targetDurationSec);
  if (selected.length === 0) {
    throw new AppError('No local stock clips available for cycle', 400, 'SI_LOCAL_STOCK_EMPTY');
  }

  const selectedDuration = selected.reduce((sum, clip) => sum + clip.durationSec, 0);
  log(
    `[reup-si] Local stock: selected ${selected.length} clip(s), cycle ${selectedDuration.toFixed(1)}s (target ${targetDurationSec.toFixed(1)}s)`,
  );
  log(`[reup-si] Local clips: ${selected.map(clip => clip.filename).join(', ')}`);

  const stepOpts = { prefix: '[reup-si]', onLog };
  const stockClipPath = await timedStep(
    'Ghép chu kỳ local stock (ffmpeg concat)',
    () => concatLocalClips(selected, stockTempDir, onLog, onFfmpegProgress),
    stepOpts,
  );

  for (const clip of selected) {
    const nextUsed = incrementSiLocalClipUsed(clip.filename);
    log(`[reup-si] Local clip ${clip.filename} marked used=${nextUsed}`);
  }

  return { stockClipPath, stockTempDir };
}
