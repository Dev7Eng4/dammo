import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDataDirs, paths } from '../config/paths.js';
import { AppError } from '../shared/http/errors.js';
import { chromeProfilesService } from '../modules/chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../modules/chrome-profiles/chrome-profiles.types.js';
import { flowBrowserService } from '../modules/llm-browser/flow-browser.service.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Sửa prompt tại đây rồi chạy: npm run flow:generate-image */
const TEST_PROMPT = 'A cinematic Japanese drama thumbnail, two characters facing each other in tense confrontation';

const TEST_NEGATIVE_PROMPT = '';

/** Default reference image attached when CLI does not pass --ref / --reference-image(s). */
const DEFAULT_REFERENCE_IMAGE = path.join(SCRIPT_DIR, 'Nakamura_Tempū_image_3.png');

const DEFAULT_TIMEOUT_MS = 300_000;

interface CliOptions {
  output?: string;
  profileId?: string;
  timeoutMs: number;
  browserMode: boolean;
  referenceImagePaths: string[];
  projectId?: string;
}

function pushReferencePaths(target: string[], raw: string | undefined): void {
  const value = raw?.trim() ?? '';
  if (!value) {
    throw new Error('--reference-image / --reference-images requires a value');
  }

  for (const part of value.split(',')) {
    const trimmed = part.trim();
    if (trimmed) {
      target.push(path.resolve(trimmed));
    }
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    browserMode: true,
    referenceImagePaths: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--output' || arg === '-o') {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--profile-id') {
      options.profileId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--reference-image' || arg === '--ref') {
      pushReferencePaths(options.referenceImagePaths, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--reference-images') {
      pushReferencePaths(options.referenceImagePaths, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--project-id') {
      options.projectId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === '--browser') {
      options.browserMode = true;
      continue;
    }

    if (arg === '--api') {
      options.browserMode = false;
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

function buildPrompt(mainPrompt: string, negative: string): string {
  const promptText = mainPrompt.trim();
  if (!promptText) {
    throw new AppError('TEST_PROMPT is empty', 400, 'INVALID_PROMPT');
  }

  if (negative.trim().length > 0) {
    return `${promptText}\n\nNegative prompt: ${negative.trim()}`;
  }

  return promptText;
}

function resolveFlowProfile(profileId?: string): ChromeProfile {
  if (profileId) {
    const profile = chromeProfilesService.getById(profileId);
    if (profile.role !== 'main') {
      throw new AppError('Google Flow requires the main Chrome profile', 400, 'MAIN_PROFILE_REQUIRED');
    }
    return profile;
  }
  return chromeProfilesService.requireMainProfile();
}

function resolveOutputPath(output?: string): string {
  if (output) {
    return path.resolve(output);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(paths.mediaDownloadsDir, 'flow-test', `flow-${timestamp}.jpg`);
}

async function main() {
  ensureDataDirs();

  const options = parseArgs(process.argv.slice(2));
  const referenceImagePaths =
    options.referenceImagePaths.length > 0
      ? options.referenceImagePaths
      : [DEFAULT_REFERENCE_IMAGE];
  const promptUsed = buildPrompt(TEST_PROMPT, TEST_NEGATIVE_PROMPT);
  const outputPath = resolveOutputPath(options.output);
  const outputDir = path.dirname(outputPath);
  const profile = resolveFlowProfile(options.profileId);

  await fs.mkdir(outputDir, { recursive: true });

  console.log(`[flow-gen] Profile: ${profile.name} (${profile.id})`);
  console.log(`[flow-gen] Output: ${outputPath}`);
  console.log(`[flow-gen] Mode: ${options.browserMode ? 'browser' : 'api'}`);
  console.log(`[flow-gen] Timeout: ${options.timeoutMs}ms`);
  if (options.projectId) {
    console.log(`[flow-gen] Project ID: ${options.projectId}`);
  }
  console.log(`[flow-gen] Reference images (${referenceImagePaths.length}):`);
  for (const imagePath of referenceImagePaths) {
    console.log(`[flow-gen]   ${imagePath}`);
  }
  console.log(`[flow-gen] Prompt:\n${promptUsed}\n`);
  console.log('[flow-gen] Calling generateImage...');

  const startedAt = Date.now();
  const response = await flowBrowserService.generateImage(profile.id, promptUsed, {
    outputPath,
    timeoutMs: options.timeoutMs,
    generationMode: options.browserMode ? 'browser' : 'api',
    referenceImagePaths,
    projectId: options.projectId,
  });

  const elapsedMs = Date.now() - startedAt;
  const savedPath = response.mediaAssets?.[0]?.localPath ?? outputPath;
  console.log(`[flow-gen] Done in ${elapsedMs}ms`);
  console.log(`[flow-gen] Saved: ${savedPath}`);
}

main().catch(err => {
  if (err instanceof Error) {
    console.error(`[flow-gen] Failed: ${err.message}`);
    if (err.stack) {
      console.error(err.stack);
    }
  } else {
    console.error('[flow-gen] Failed:', err);
  }
  process.exit(1);
});
