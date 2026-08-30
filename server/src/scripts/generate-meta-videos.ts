import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, paths } from '../config/paths.js';
import { AppError } from '../shared/http/errors.js';
import { chromeProfilesService } from '../modules/chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../modules/chrome-profiles/chrome-profiles.types.js';
import { metaBrowserService } from '../modules/llm-browser/meta-browser.service.js';

/** Sửa danh sách prompt tại đây rồi chạy: npm run meta:generate-videos */
const TEST_VIDEO_PROMPTS: Array<{ prompt: string; name: string }> = [
  {
    name: 'sunset',
    prompt:
      'A beautiful arrangement of fresh vegetables and fruits on a wooden kitchen table, Japanese anime style, colorful tomatoes, carrots, cabbage, pumpkin, apples, oranges, leafy greens, soft morning sunlight from the window, clean healthy food atmosphere, cozy Japanese kitchen background, detailed illustration, vibrant but natural colors, wholesome lifestyle feeling, 16:9 aspect ratio, no text, no logo, no watermark',
  },
  { name: 'cat-rain', prompt: 'A cat walking in the rain' },
  {
    name: 'wife',
    prompt:
      'A Japanese married couple arguing emotionally inside a modern Japanese living room, anime style, husband and wife standing face to face, tense expressions, dramatic lighting, scattered documents on the table, warm but serious domestic atmosphere, cinematic anime scene, detailed facial emotions, natural Japanese home interior, emotional storytelling composition, 16:9 aspect ratio, no text, no logo, no watermark',
  },
  {
    name: 'beach',
    prompt:
      'A peaceful Japanese seaside landscape in anime style, clear blue ocean, gentle waves, white sand beach, small fishing village in the distance, warm sunlight, soft summer clouds, seagulls flying, calm emotional atmosphere, cinematic composition, beautiful hand-drawn anime background, highly detailed, soft colors, 16:9 aspect ratio, no text, no logo, no watermark',
  },
];

const DEFAULT_TIMEOUT_MS = 300_000;

interface CliOptions {
  outputDir?: string;
  profileId?: string;
  timeoutMs: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { timeoutMs: DEFAULT_TIMEOUT_MS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--output-dir' || arg === '-o') {
      options.outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--profile-id') {
      options.profileId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--timeout-ms') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error('--timeout-ms must be a positive number');
      }
      options.timeoutMs = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'video';
  return trimmed.replace(/[\\/:*?"<>|]/g, '-');
}

function resolveMetaProfile(profileId?: string): ChromeProfile {
  if (profileId) {
    const profile = chromeProfilesService.getById(profileId);
    if (profile.role !== 'main') {
      throw new AppError('Meta AI video generation requires the main Chrome profile', 400, 'MAIN_PROFILE_REQUIRED');
    }
    return profile;
  }
  return chromeProfilesService.requireMainProfile();
}

function resolveOutputDir(outputDir?: string): string {
  if (outputDir) {
    return path.resolve(outputDir);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(paths.mediaDownloadsDir, 'meta-video-test', timestamp);
}

async function main() {
  ensureDataDirs();

  const options = parseArgs(process.argv.slice(2));
  const profile = resolveMetaProfile(options.profileId);
  const outputDir = resolveOutputDir(options.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  const prompts = TEST_VIDEO_PROMPTS.filter(item => item.prompt.trim().length > 0);
  if (prompts.length === 0) {
    throw new AppError('TEST_VIDEO_PROMPTS is empty', 400, 'INVALID_PROMPT');
  }

  console.log(`Profile: ${profile.name} (${profile.id})`);
  console.log(`Output dir: ${outputDir}`);
  console.log(`Prompts: ${prompts.length}`);
  console.log(`Timeout per video: ${options.timeoutMs}ms\n`);

  let succeeded = 0;
  let failed = 0;

  for (let index = 0; index < prompts.length; index += 1) {
    const item = prompts[index];
    const label = `[${index + 1}/${prompts.length}] ${item.name}`;
    const fileName = `${sanitizeFileName(item.name)}.mp4`;
    const debugScreenshotPath = path.join(outputDir, `${sanitizeFileName(item.name)}-debug.png`);

    console.log(`${label}`);
    console.log(`Prompt: ${item.prompt}`);
    console.log('Generating image...');

    try {
      const response = await metaBrowserService.generateMedia(profile.id, item.prompt, {
        mediaKind: 'image',
        outputDir,
        fileName,
        debugScreenshotPath,
        timeoutMs: options.timeoutMs,
      });

      const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
      if (!savedPath) {
        throw new AppError('Meta completed but no local video path returned', 502, 'META_VIDEO_SAVE_FAILED');
      }

      succeeded += 1;
      console.log(`Saved: ${savedPath} (${(response.elapsedMs / 1000).toFixed(1)}s)\n`);
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed: ${message}\n`);
    }
  }

  console.log(`Done. Success: ${succeeded}, Failed: ${failed}, Total: ${prompts.length}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
