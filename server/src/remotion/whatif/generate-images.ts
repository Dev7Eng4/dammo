import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';
import { ensureDataDirs } from '../../config/paths.js';
import {
  connectPlaywrightToGpmProfile,
  disconnectGpmPlaywright,
  type GpmPlaywrightConnection,
} from '../../infrastructure/gpm/gpm-playwright.connector.js';
import type { GpmProfile } from '../../infrastructure/gpm/gpm-api.client.js';
import { AppError } from '../../shared/http/errors.js';
import {
  closeChromeProfiles,
  createChromeProfilePage,
  openChromeProfile,
} from '../../modules/chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../../modules/chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../modules/chrome-profiles/chrome-profiles.types.js';
import { gpmManagerService } from '../../modules/gpm-manager/gpm-manager.service.js';
import { metaBrowserService } from '../../modules/llm-browser/meta-browser.service.js';

const META_IMAGE_TIMEOUT_MS = 300_000;
const META_IMAGE_TABS_PER_MAIN_PROFILE = 5;
const META_IMAGE_MAX_RETRIES = 3;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_INPUT_PATH = path.join(__dirname, 'output', 'results.json');
const DEFAULT_OUTPUT_DIR = path.join(__dirname, 'output', 'images');

export interface WhatIfImageItem {
  name: string;
  prompt: string;
}

interface ImageJob {
  index: number;
  name: string;
  prompt: string;
  outputPath: string;
}

interface MetaImageWorker {
  workerIndex: number;
  label: string;
  page: Page;
  kind: 'chrome' | 'gpm';
  profileId: string;
}

interface MetaWorkerPool {
  workers: MetaImageWorker[];
  gpmConnections: GpmPlaywrightConnection[];
}

interface CliOptions {
  inputPath: string;
  outputDir: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: DEFAULT_INPUT_PATH,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--input' || arg === '-i') {
      options.inputPath = path.resolve(argv[index + 1] ?? '');
      index += 1;
      continue;
    }

    if (arg === '--output-dir' || arg === '-o') {
      options.outputDir = path.resolve(argv[index + 1] ?? '');
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'scene';
  return trimmed.replace(/[\\/:*?"<>|]/g, '-');
}

async function loadResults(inputPath: string): Promise<WhatIfImageItem[]> {
  const raw = await fs.readFile(inputPath, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new AppError('results.json must be an array', 400, 'WHATIF_INVALID_RESULTS');
  }

  return parsed.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new AppError(`Invalid item at index ${index}`, 400, 'WHATIF_INVALID_RESULTS');
    }
    const record = item as Record<string, unknown>;
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';
    if (!name) {
      throw new AppError(`Item at index ${index} is missing name`, 400, 'WHATIF_INVALID_RESULTS');
    }
    return { name, prompt };
  });
}

function buildJobs(items: WhatIfImageItem[], outputDir: string): ImageJob[] {
  return items.map((item, index) => {
    const name = sanitizeFileName(item.name);
    return {
      index,
      name,
      prompt: item.prompt,
      outputPath: path.join(outputDir, `${name}.jpg`),
    };
  });
}

async function resolvePendingJobs(jobs: ImageJob[]): Promise<{
  pending: ImageJob[];
  skippedExisting: number;
  skippedEmpty: number;
}> {
  const pending: ImageJob[] = [];
  let skippedExisting = 0;
  let skippedEmpty = 0;

  for (const job of jobs) {
    if (await fileExists(job.outputPath)) {
      skippedExisting += 1;
      continue;
    }
    if (!job.prompt) {
      skippedEmpty += 1;
      console.warn(`[whatif-images] skip ${job.name}: empty prompt`);
      continue;
    }
    pending.push(job);
  }

  return { pending, skippedExisting, skippedEmpty };
}

function allocateChromeMetaTabProfiles(
  profiles: ChromeProfile[],
  pendingCount: number,
): ChromeProfile[] {
  const tabProfiles: ChromeProfile[] = [];

  for (const profile of profiles) {
    const remaining = pendingCount - tabProfiles.length;
    if (remaining <= 0) break;

    const tabCount = Math.min(META_IMAGE_TABS_PER_MAIN_PROFILE, remaining);
    for (let tabIndex = 0; tabIndex < tabCount; tabIndex += 1) {
      tabProfiles.push(profile);
    }
  }

  return tabProfiles;
}

async function openChromeMetaWorkers(
  tabProfiles: ChromeProfile[],
  startIndex: number,
): Promise<MetaImageWorker[]> {
  if (tabProfiles.length === 0) return [];

  const uniqueProfiles = [...new Map(tabProfiles.map(profile => [profile.id, profile])).values()];
  for (const profile of uniqueProfiles) {
    console.log(`[whatif-images] Mở Chrome main profile ${profile.name}...`);
    await openChromeProfile(profile.id, profile.userDataDir);
  }

  const workers: MetaImageWorker[] = [];
  for (const profile of tabProfiles) {
    try {
      const page = await createChromeProfilePage(profile.id);
      await metaBrowserService.openOnPage(page);
      const workerIndex = startIndex + workers.length;
      workers.push({
        workerIndex,
        label: `chrome:${profile.name}`,
        page,
        kind: 'chrome',
        profileId: profile.id,
      });
      console.log(`[whatif-images] Meta worker ${workerIndex + 1} sẵn sàng trên Chrome ${profile.name}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[whatif-images] Bỏ qua Chrome tab trên ${profile.name}: ${reason}`);
    }
  }

  return workers;
}

async function openGpmMetaWorkers(
  profiles: GpmProfile[],
  startIndex: number,
): Promise<{ workers: MetaImageWorker[]; connections: GpmPlaywrightConnection[] }> {
  if (profiles.length === 0) return { workers: [], connections: [] };

  const results = await Promise.all(
    profiles.map(async profile => {
      try {
        console.log(`[whatif-images] Start GPM profile ${profile.name}...`);
        const connection = await connectPlaywrightToGpmProfile(profile.id);
        await metaBrowserService.openOnPage(connection.page);
        return { profile, connection, error: null as string | null };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[whatif-images] Bỏ qua GPM profile ${profile.name}: ${reason}`);
        return { profile, connection: null, error: reason };
      }
    }),
  );

  const workers: MetaImageWorker[] = [];
  const connections: GpmPlaywrightConnection[] = [];

  for (const result of results) {
    if (!result.connection) continue;
    const workerIndex = startIndex + workers.length;
    workers.push({
      workerIndex,
      label: `gpm:${result.profile.name}`,
      page: result.connection.page,
      kind: 'gpm',
      profileId: result.connection.profileId,
    });
    connections.push(result.connection);
    console.log(`[whatif-images] Meta worker ${workerIndex + 1} sẵn sàng trên GPM ${result.profile.name}`);
  }

  return { workers, connections };
}

async function openMetaWorkerPool(pendingCount: number): Promise<MetaWorkerPool> {
  const mains = chromeProfilesService.listMainProfiles();
  const chromeTabProfiles = allocateChromeMetaTabProfiles(mains, pendingCount);
  const remainingAfterChrome = Math.max(0, pendingCount - chromeTabProfiles.length);

  let gpmCandidates: GpmProfile[] = [];
  if (remainingAfterChrome > 0) {
    try {
      gpmCandidates = await gpmManagerService.listMetaEnabledProfiles();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const code = err instanceof AppError ? err.code : undefined;
      console.warn(
        `[whatif-images] GPM meta profiles unavailable (${code ?? 'error'}): ${reason} — tiếp tục Chrome-only`,
      );
      gpmCandidates = [];
    }
  }
  const gpmProfiles = gpmCandidates.slice(0, remainingAfterChrome);

  console.log(
    `[whatif-images] Meta capacity: pending=${pendingCount}, chromeMains=${mains.length}, ` +
      `tabsPerMain=${META_IMAGE_TABS_PER_MAIN_PROFILE}, chromeTabs=${chromeTabProfiles.length}, ` +
      `gpmMeta=${gpmProfiles.length}` +
      (gpmProfiles.length > 0
        ? ` (${gpmProfiles.map(profile => profile.name).join(', ')})`
        : ''),
  );

  if (chromeTabProfiles.length === 0 && gpmProfiles.length === 0) {
    throw new AppError(
      'No Chrome main or GPM meta-enabled profiles available for Meta images',
      400,
      'WHATIF_NO_META_PROFILES',
    );
  }

  const chromeWorkers = await openChromeMetaWorkers(chromeTabProfiles, 0);
  const { workers: gpmWorkers, connections } = await openGpmMetaWorkers(
    gpmProfiles,
    chromeWorkers.length,
  );

  const workers = [...chromeWorkers, ...gpmWorkers];
  if (workers.length === 0) {
    for (const connection of connections) {
      await disconnectGpmPlaywright(connection).catch(() => undefined);
    }
    throw new AppError(
      'Failed to open any Meta workers (Chrome/GPM)',
      502,
      'WHATIF_NO_META_WORKERS',
    );
  }

  return { workers, gpmConnections: connections };
}

async function cleanupMetaWorkerPool(pool: MetaWorkerPool): Promise<void> {
  await Promise.all(
    pool.gpmConnections.map(async connection => {
      try {
        await disconnectGpmPlaywright(connection);
        console.log(`[whatif-images] Closed GPM profile ${connection.profileId}`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[whatif-images] Failed to close GPM ${connection.profileId}: ${reason}`);
      }
    }),
  );

  const chromeProfileIds = [
    ...new Set(pool.workers.filter(worker => worker.kind === 'chrome').map(worker => worker.profileId)),
  ];

  if (chromeProfileIds.length === 0) return;

  const closedIds = await closeChromeProfiles(chromeProfileIds);
  for (const profileId of closedIds) {
    console.log(`[whatif-images] Closed Chrome profile ${profileId}`);
  }
}

async function generateMetaImages(
  imagesDir: string,
  pending: ImageJob[],
): Promise<{ generatedCount: number; failedCount: number }> {
  const pool = await openMetaWorkerPool(pending.length);
  const { workers } = pool;
  let nextJobIndex = 0;
  let generatedCount = 0;
  let failedCount = 0;

  console.log(
    `[whatif-images] Meta parallel: ${workers.length} worker(s) ` +
      `[${workers.map(worker => worker.label).join(', ')}] cho ${pending.length} image(s)`,
  );

  async function runWorker(worker: MetaImageWorker): Promise<void> {
    while (true) {
      const jobIndex = nextJobIndex;
      nextJobIndex += 1;
      if (jobIndex >= pending.length) return;

      const job = pending[jobIndex];
      console.log(
        `[whatif-images] worker ${worker.workerIndex + 1}/${workers.length} (${worker.label}) → ${job.name} ` +
          `(${jobIndex + 1}/${pending.length})`,
      );

      let succeeded = false;
      for (let attempt = 1; attempt <= META_IMAGE_MAX_RETRIES; attempt += 1) {
        try {
          const response = await metaBrowserService.generateMediaOnPage(worker.page, job.prompt, {
            mediaKind: 'image',
            aspectRatio: '3:4',
            outputDir: imagesDir,
            fileName: `${job.name}.jpg`,
            timeoutMs: META_IMAGE_TIMEOUT_MS,
          });

          const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
          if (!savedPath || !(await fileExists(savedPath))) {
            throw new AppError(
              `Meta image generation failed for ${job.name}`,
              502,
              'WHATIF_IMAGE_FAILED',
            );
          }

          generatedCount += 1;
          succeeded = true;
          console.log(`[whatif-images] ok ${job.name} → ${savedPath}`);
          break;
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          if (attempt === META_IMAGE_MAX_RETRIES) {
            console.warn(
              `[whatif-images] bỏ qua ${job.name} sau ${META_IMAGE_MAX_RETRIES} lần: ${reason}`,
            );
            failedCount += 1;
          } else {
            console.warn(
              `[whatif-images] ${job.name} attempt ${attempt}/${META_IMAGE_MAX_RETRIES} failed → retry (${reason})`,
            );
            await sleep(1_000);
          }
        }
      }

      if (!succeeded) {
        console.warn(`[whatif-images] skipped ${job.name}`);
      }
    }
  }

  try {
    await Promise.all(workers.map(worker => runWorker(worker)));
    return { generatedCount, failedCount };
  } finally {
    await cleanupMetaWorkerPool(pool);
  }
}

export async function generateWhatIfImages(options?: {
  inputPath?: string;
  outputDir?: string;
}): Promise<{ generatedCount: number; failedCount: number; skippedExisting: number }> {
  const inputPath = options?.inputPath ?? DEFAULT_INPUT_PATH;
  const outputDir = options?.outputDir ?? DEFAULT_OUTPUT_DIR;

  const items = await loadResults(inputPath);
  const jobs = buildJobs(items, outputDir);
  const { pending, skippedExisting, skippedEmpty } = await resolvePendingJobs(jobs);

  console.log(
    `[whatif-images] total=${jobs.length}, pending=${pending.length}, ` +
      `skipExisting=${skippedExisting}, skipEmpty=${skippedEmpty}`,
  );

  if (pending.length === 0) {
    console.log('[whatif-images] nothing to generate');
    return { generatedCount: 0, failedCount: 0, skippedExisting };
  }

  await fs.mkdir(outputDir, { recursive: true });
  const { generatedCount, failedCount } = await generateMetaImages(outputDir, pending);

  console.log(
    `[whatif-images] done: generated=${generatedCount}, failed=${failedCount}, ` +
      `skippedExisting=${skippedExisting} → ${outputDir}`,
  );

  return { generatedCount, failedCount, skippedExisting };
}

async function main(): Promise<void> {
  ensureDataDirs();
  const options = parseArgs(process.argv.slice(2));
  await generateWhatIfImages(options);
}

main().catch(err => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[whatif-images] failed: ${message}`);
  process.exitCode = 1;
});
