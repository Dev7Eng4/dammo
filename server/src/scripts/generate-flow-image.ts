import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureDataDirs, paths } from '../config/paths.js';
import { AppError } from '../shared/http/errors.js';
import { chromeProfilesService } from '../modules/chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../modules/chrome-profiles/chrome-profiles.types.js';
import { flowBrowserService } from '../modules/llm-browser/flow-browser.service.js';

/** Sửa prompt tại đây rồi chạy: npm run flow:generate-image */
const TEST_PROMPT = 'A cinematic Japanese drama thumbnail, two characters facing each other in tense confrontation';

const TEST_NEGATIVE_PROMPT = '';

const DEFAULT_TIMEOUT_MS = 300_000;

interface CliOptions {
  output?: string;
  profileId?: string;
  timeoutMs: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { timeoutMs: DEFAULT_TIMEOUT_MS };

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
  const promptUsed = buildPrompt(TEST_PROMPT, TEST_NEGATIVE_PROMPT);
  const outputPath = resolveOutputPath(options.output);
  const outputDir = path.dirname(outputPath);
  const profile = resolveFlowProfile(options.profileId);

  await fs.mkdir(outputDir, { recursive: true });

  console.log(`Profile: ${profile.name} (${profile.id})`);
  console.log(`Output: ${outputPath}`);
  console.log(`Prompt:\n${promptUsed}\n`);
  console.log('Generating image...');

  const response = await flowBrowserService.generateImage(profile.id, promptUsed, {
    outputPath,
    timeoutMs: options.timeoutMs,
  });

  const savedPath = response.mediaAssets?.[0]?.localPath ?? outputPath;
  console.log(`Saved: ${savedPath}`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
