import fs from 'node:fs/promises';
import path from 'node:path';
import { assembleSlideshow } from '../modules/video-production/shared/slideshow/slideshow-assembler.js';
import { pickAutoEffects } from '../modules/video-production/shared/slideshow/slideshow-presets.js';
import {
  SS_DEFAULT_SLIDE_DURATION,
  SS_DEFAULT_TRANSITION_DURATION,
  SS_OUTPUT_VIDEO_BASENAME,
} from '../modules/video-production/shared/slideshow/slideshow.constants.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);

interface CliOptions {
  imagesDir: string;
  outputPath?: string;
  durationSec: number;
  transitionDurationSec: number;
  shuffle: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    imagesDir: '',
    durationSec: SS_DEFAULT_SLIDE_DURATION,
    transitionDurationSec: SS_DEFAULT_TRANSITION_DURATION,
    shuffle: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--dir' || arg === '-d') {
      options.imagesDir = path.resolve(argv[i + 1] ?? '');
      if (!argv[i + 1]) throw new Error('--dir requires a value');
      i += 1;
      continue;
    }
    if (arg === '--out' || arg === '-o') {
      options.outputPath = path.resolve(argv[i + 1] ?? '');
      if (!argv[i + 1]) throw new Error('--out requires a value');
      i += 1;
      continue;
    }
    if (arg === '--duration' || arg === '-t') {
      options.durationSec = Number(argv[i + 1]);
      if (!Number.isFinite(options.durationSec) || options.durationSec <= 0) {
        throw new Error('--duration requires a positive number');
      }
      i += 1;
      continue;
    }
    if (arg === '--transition') {
      options.transitionDurationSec = Number(argv[i + 1]);
      if (!Number.isFinite(options.transitionDurationSec) || options.transitionDurationSec < 0) {
        throw new Error('--transition requires a non-negative number');
      }
      i += 1;
      continue;
    }
    if (arg === '--shuffle') {
      options.shuffle = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (!options.imagesDir) {
      options.imagesDir = path.resolve(arg);
    }
  }

  if (!options.imagesDir) {
    throw new Error('Usage: slideshow:demo --dir <images-dir> [--out file.mp4] [--duration 5] [--transition 1] [--shuffle]');
  }

  return options;
}

async function listImages(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map(name => path.join(dir, name));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const images = await listImages(options.imagesDir);
  if (images.length === 0) {
    throw new Error(`No images found in ${options.imagesDir}`);
  }

  const outputPath = options.outputPath ?? path.join(options.imagesDir, `${SS_OUTPUT_VIDEO_BASENAME}.mp4`);

  console.log(`Images dir : ${options.imagesDir}`);
  console.log(`Image count: ${images.length}`);
  console.log(`Per slide  : ${options.durationSec}s, transition ${options.transitionDurationSec}s`);
  console.log(`Output     : ${outputPath}`);

  const slides = pickAutoEffects(images, {
    durationSec: options.durationSec,
    transitionDurationSec: options.transitionDurationSec,
    shuffle: options.shuffle,
  });

  await assembleSlideshow({
    slides,
    workDir: options.imagesDir,
    outputPath,
    onLog: msg => console.log(msg),
  });

  console.log('\nDone.');
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
