import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadYoutubeVideo } from '../../infrastructure/youtube/youtube-video-downloader.js';
import { timedStep } from '../../shared/timing/step-timer.js';
import {
  STOCK_SKIP_START_SEC,
  STOCK_SLOWMO_FACTOR,
  prepareRawStockVideoClip,
} from '../../modules/video-production/shared/stock-background/index.js';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Edit this URL then run: npm run test:stock-background */
const STOCK_URL = 'https://www.youtube.com/watch?v=kxUChNUqakA';
const TARGET_DURATION_SEC = 5400;

export interface PrepareStockBackgroundFromUrlInput {
  url: string;
  /** Output duration after slowmo. Source cut = target / STOCK_SLOWMO_FACTOR. */
  targetDurationSec?: number;
  workDir?: string;
  onLog?: (msg: string) => void;
}

export interface PrepareStockBackgroundFromUrlResult {
  rawVideoPath: string;
  stockClipPath: string;
  workDir: string;
}

/**
 * Download a YouTube URL then run the remote stock-background prepare pipeline
 * (skip start → cut → fps/slowmo/crop/scale → H264).
 */
export async function prepareStockBackgroundFromUrl(
  input: PrepareStockBackgroundFromUrlInput,
): Promise<PrepareStockBackgroundFromUrlResult> {
  const { url, targetDurationSec = TARGET_DURATION_SEC, workDir = TEST_DIR, onLog } = input;

  if (!url?.trim()) {
    throw new Error('url is required');
  }
  if (!Number.isFinite(targetDurationSec) || targetDurationSec <= 0) {
    throw new Error(`targetDurationSec must be > 0, got ${targetDurationSec}`);
  }

  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  await fs.mkdir(workDir, { recursive: true });
  const stepOpts = { prefix: '[test-stock]', onLog };

  const sourceDurationSec = targetDurationSec / STOCK_SLOWMO_FACTOR;
  log(`[test-stock] URL: ${url}`);
  log(
    `[test-stock] Target ${targetDurationSec}s after ${STOCK_SLOWMO_FACTOR}x slowmo → cut ${sourceDurationSec}s from t=${STOCK_SKIP_START_SEC}s`,
  );
  log(`[test-stock] Work dir: ${workDir}`);

  const rawVideoPath = await timedStep(
    'Download stock video',
    () =>
      downloadYoutubeVideo(url.trim(), workDir, {
        outputBasename: 'stock_raw',
        onLog: msg => onLog?.(`[test-stock] ${msg}`),
      }),
    stepOpts,
  );
  log(`[test-stock] Raw video → ${rawVideoPath}`);

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
  if (!STOCK_URL || STOCK_URL.includes('REPLACE_ME')) {
    throw new Error('Set STOCK_URL at the top of prepare-from-url.ts before running');
  }

  console.log('Stock background prepare-from-url test');
  console.log(`URL: ${STOCK_URL}`);
  console.log(`Target duration: ${TARGET_DURATION_SEC}s`);
  console.log(`Work dir: ${TEST_DIR}`);
  console.log('\nRunning...\n');

  const result = await prepareStockBackgroundFromUrl({
    url: STOCK_URL,
    targetDurationSec: TARGET_DURATION_SEC,
    workDir: TEST_DIR,
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
