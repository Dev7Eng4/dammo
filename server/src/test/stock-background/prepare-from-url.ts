import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timedStep } from '../../shared/timing/step-timer.js';
import {
  STOCK_SKIP_START_SEC,
  STOCK_SLOWMO_FACTOR,
  prepareRawStockVideoClip,
} from '../../modules/video-production/shared/stock-background/index.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(TEST_DIR, '../../../../output');

/** Edit then run: npm run test:stock-background */
const STOCK_VIDEO_PATH = 'D:/dammo/server/data/sources/0056ce7a-d147-4e71-b2d0-06a4a96f52bd/videos/00v5IZOo-8Y/video.mp4';
const TARGET_DURATION_SEC = 5400;

export interface PrepareStockBackgroundFromLocalInput {
  /** Absolute path to an already-downloaded stock `video.mp4`. */
  videoPath: string;
  /** Output duration after slowmo. Source cut = target / STOCK_SLOWMO_FACTOR. */
  targetDurationSec?: number;
  workDir?: string;
  onLog?: (msg: string) => void;
}

export interface PrepareStockBackgroundFromLocalResult {
  rawVideoPath: string;
  stockClipPath: string;
  workDir: string;
}

/**
 * Use a pre-downloaded local stock video then run the remote prepare pipeline
 * (skip start → cut → fps/slowmo/crop/scale → H264) — same path as
 * `prepareRemoteStockBackground` when `video.mp4` already exists.
 */
export async function prepareStockBackgroundFromLocal(
  input: PrepareStockBackgroundFromLocalInput,
): Promise<PrepareStockBackgroundFromLocalResult> {
  const { videoPath, targetDurationSec = TARGET_DURATION_SEC, workDir = OUTPUT_DIR, onLog } = input;

  if (!videoPath?.trim()) {
    throw new Error('videoPath is required');
  }
  if (!Number.isFinite(targetDurationSec) || targetDurationSec <= 0) {
    throw new Error(`targetDurationSec must be > 0, got ${targetDurationSec}`);
  }

  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  const rawVideoPath = path.resolve(videoPath.trim());
  await fs.access(rawVideoPath);

  await fs.mkdir(workDir, { recursive: true });
  const stepOpts = { prefix: '[test-stock]', onLog };

  const sourceDurationSec = targetDurationSec / STOCK_SLOWMO_FACTOR;
  log(`[test-stock] Using pre-downloaded stock video: ${rawVideoPath}`);
  log(
    `[test-stock] Target ${targetDurationSec}s after ${STOCK_SLOWMO_FACTOR}x slowmo → cut ${sourceDurationSec}s from t=${STOCK_SKIP_START_SEC}s`,
  );
  log(`[test-stock] Work dir: ${workDir}`);

  const stockClipPath = path.join(workDir, 'stock_processed.mp4');
  await timedStep(
    'Prepare stock clip (ffmpeg)',
    () =>
      prepareRawStockVideoClip(rawVideoPath, stockClipPath, {
        skipStartSec: STOCK_SKIP_START_SEC,
        durationSec: sourceDurationSec,
        onLog,
        label: 'test-stock-clip',
      }),
    stepOpts,
  );
  log(`[test-stock] Processed clip → ${stockClipPath}`);

  return { rawVideoPath, stockClipPath, workDir };
}

async function main() {
  console.log('Stock background prepare-from-local test (pre-downloaded video)');
  console.log(`Video: ${STOCK_VIDEO_PATH}`);
  console.log(`Target duration: ${TARGET_DURATION_SEC}s`);
  console.log(`Output dir: ${OUTPUT_DIR}`);
  console.log('\nRunning...\n');

  const result = await prepareStockBackgroundFromLocal({
    videoPath: STOCK_VIDEO_PATH,
    targetDurationSec: TARGET_DURATION_SEC,
    workDir: OUTPUT_DIR,
    onLog: msg => console.log(msg),
  });

  console.log(`\nDone`);
  console.log(`  raw:       ${result.rawVideoPath}`);
  console.log(`  processed: ${result.stockClipPath}`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
