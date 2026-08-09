import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, paths } from '../config/paths.js';
import { assertRequiredSiAssets } from '../modules/video-production/shared/si-video/si-assets.js';
import {
  prepareBakedLocalStockClip,
  resolveLocalStockOutputPath,
  LOCAL_STOCK_SKIP_END_SEC,
  LOCAL_STOCK_SKIP_START_SEC,
  LOCAL_STOCK_SLOWMO_FACTOR,
  LOCAL_STOCK_ZOOM_FACTOR,
} from '../modules/video-production/shared/stock-background/index.js';

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mkv', '.mov']);

interface CliOptions {
  inputDir: string;
  outputDir: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    inputDir: paths.siTempStockDir,
    outputDir: paths.siLocalStockDir,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--input-dir') {
      const value = argv[index + 1]?.trim() ?? '';
      if (!value) throw new Error('--input-dir requires a value');
      options.inputDir = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === '--output-dir') {
      const value = argv[index + 1]?.trim() ?? '';
      if (!value) throw new Error('--output-dir requires a value');
      options.outputDir = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function isVideoFile(filename: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

async function listInputVideos(inputDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(inputDir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries.sort()) {
    if (entry === 'usage.json') continue;

    const fullPath = path.join(inputDir, entry);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat?.isFile() || !isVideoFile(entry)) continue;

    files.push(fullPath);
  }

  return files;
}

async function outputExists(outputPath: string): Promise<boolean> {
  try {
    await fs.access(outputPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  ensureDataDirs();

  const options = parseArgs(process.argv.slice(2));
  const inputFiles = await listInputVideos(options.inputDir);

  console.log('Prepare SI local stock from temp_stock (baked dim)');
  console.log(`Input dir: ${options.inputDir}`);
  console.log(`Output dir: ${options.outputDir}`);
  console.log(`Dry run: ${options.dryRun ? 'yes' : 'no'}`);
  console.log(
    `Prepare settings: cut skip-start=${LOCAL_STOCK_SKIP_START_SEC}s skip-end=${LOCAL_STOCK_SKIP_END_SEC}s | zoom=${LOCAL_STOCK_ZOOM_FACTOR}x | slowmo=${LOCAL_STOCK_SLOWMO_FACTOR}x`,
  );
  console.log('(Chỉnh trong stock-background.constants.ts → LOCAL_STOCK_*)');

  if (inputFiles.length === 0) {
    console.log('\nNo video files found in input dir.');
    return;
  }

  console.log(`\nFound ${inputFiles.length} file(s) to process:\n`);

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  const assets = assertRequiredSiAssets();

  for (const inputPath of inputFiles) {
    const fileName = path.basename(inputPath);
    const outputPath = resolveLocalStockOutputPath(inputPath, options.outputDir);

    if (options.dryRun) {
      console.log(`  [dry-run] ${fileName} → ${outputPath}`);
      skipped += 1;
      continue;
    }

    if (await outputExists(outputPath)) {
      console.log(`  [warn] Overwriting existing output: ${path.basename(outputPath)}`);
    }

    try {
      console.log(`  [prepare] ${fileName} (cut/zoom/slow/dim)...`);
      await fs.mkdir(options.outputDir, { recursive: true });
      await prepareBakedLocalStockClip(inputPath, outputPath, assets.noisePath, {
        onLog: msg => console.log(`    ${msg}`),
        label: 'si-local-stock-prepare',
      });

      await fs.unlink(inputPath);
      console.log(`  [ok] ${fileName} → ${outputPath}`);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  [fail] ${fileName}: ${message}`);
      failed += 1;
    }
  }

  console.log(`\nDone: ${processed} processed, ${failed} failed, ${skipped} skipped`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
