import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDataDirs } from '../../config/paths.js';
import type { MetaMediaBatchJob } from '../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../shared/http/errors.js';
import { metaBrowserService } from '../../modules/llm-browser/meta-browser.service.js';

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

interface CliOptions {
  inputPath: string;
  outputDir: string;
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

async function generateMetaImages(
  imagesDir: string,
  pending: ImageJob[],
): Promise<{ generatedCount: number; failedCount: number }> {
  const jobs: MetaMediaBatchJob[] = pending.map(job => ({
    id: job.name,
    prompt: job.prompt,
    outputDir: imagesDir,
    fileName: `${job.name}.jpg`,
    mediaKind: 'image',
    aspectRatio: '3:4',
  }));

  const result = await metaBrowserService.generateMediaBatch(jobs, {
    concurrency: 'batch',
    onLog: msg => console.log(msg.replace(/^\[meta\]/, '[whatif-images]')),
    onJobProgress: progress => {
      if (progress.status === 'done') {
        console.log(`[whatif-images] ok ${progress.jobId}`);
      } else if (progress.status === 'failed') {
        console.warn(`[whatif-images] skipped ${progress.jobId}`);
      }
    },
  });

  return {
    generatedCount: result.generatedCount,
    failedCount: result.failedCount,
  };
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

  await fs.mkdir(outputDir, { recursive: true });

  if (pending.length === 0) {
    console.log('[whatif-images] nothing to generate');
    return { generatedCount: 0, failedCount: 0, skippedExisting };
  }

  const { generatedCount, failedCount } = await generateMetaImages(outputDir, pending);
  console.log(
    `[whatif-images] done generated=${generatedCount} failed=${failedCount} skipExisting=${skippedExisting}`,
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
