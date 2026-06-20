import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../shared/http/errors.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../chrome-profiles/chrome-profiles.types.js';
import { llmBrowserService } from '../llm-browser/llm-browser.service.js';
import { promptsSettingsService } from '../prompts/prompts-settings.service.js';
import type { MetaStep3Output } from './reup-metadata.types.js';

const MAX_RETRIES = 3;
const HERO_IMAGE_FILENAME = 'hero.generated.png';
const HERO_META_FILENAME = 'hero.image.json';

export type HeroImageStatus = 'started' | 'retry';

export interface HeroImageProgress {
  attempt: number;
  profileId: string;
  profileName: string;
  status: HeroImageStatus;
}

export interface RunHeroImageGenerationOptions {
  profileId?: string;
  onProgress?: (progress: HeroImageProgress) => void;
}

export interface HeroImageGenerationResult {
  heroImagePath: string;
  promptUsed: string;
}

interface HeroImagePersistedMeta {
  videoId: string;
  generatedAt: string;
  promptUsed: string;
  heroImagePath: string;
  provider: string;
  elapsedMs: number;
}

function logValidationFailure(attempt: number, reason: string): void {
  console.warn(`[hero-image] attempt ${attempt}: generation failed (${reason})`);
}

function buildHeroPrompt(metaStep3: MetaStep3Output): string {
  const mainPrompt = metaStep3.hero_image_prompt.prompt;
  const promptText = typeof mainPrompt === 'string' ? mainPrompt.trim() : String(mainPrompt ?? '').trim();
  if (!promptText) {
    throw new AppError('Metadata step 3 hero_image_prompt.prompt is empty', 400, 'INVALID_HERO_PROMPT');
  }

  const negative = metaStep3.hero_image_prompt.negative_prompt;
  if (typeof negative === 'string' && negative.trim().length > 0) {
    return `${promptText}\n\nNegative prompt: ${negative.trim()}`;
  }

  return promptText;
}

async function persistHeroMeta(
  outputDir: string,
  meta: HeroImagePersistedMeta,
): Promise<void> {
  const metaPath = path.join(outputDir, HERO_META_FILENAME);
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  console.log(`[hero-image] saved meta: ${metaPath}`);
}

function resolveFlowProfile(options?: RunHeroImageGenerationOptions): ChromeProfile {
  if (options?.profileId) {
    const profile = chromeProfilesService.getById(options.profileId);
    if (profile.role !== 'main') {
      throw new AppError('Google Flow requires the main Chrome profile', 400, 'MAIN_PROFILE_REQUIRED');
    }
    return profile;
  }
  return chromeProfilesService.requireMainProfile();
}

export async function runHeroImageGeneration(
  metaStep3: MetaStep3Output,
  videoId: string,
  outputDir: string,
  options?: RunHeroImageGenerationOptions,
): Promise<HeroImageGenerationResult> {
  const promptUsed = buildHeroPrompt(metaStep3);
  const heroImagePath = path.join(outputDir, HERO_IMAGE_FILENAME);
  const debugScreenshotPath = path.join(outputDir, 'flow-debug.png');
  const imageProvider = promptsSettingsService.get().defaultImageProvider;

  const profile = resolveFlowProfile(options);

  console.log(`[hero-image] Mở Chrome main profile ${profile.name} cho Google Flow...`);

  let lastReason = 'unknown error';

  await llmBrowserService.open(profile.id, imageProvider);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    options?.onProgress?.({
      attempt,
      profileId: profile.id,
      profileName: profile.name,
      status: attempt === 1 ? 'started' : 'retry',
    });

    try {
      const response = await llmBrowserService.generateImage(profile.id, promptUsed, {
        provider: imageProvider,
        outputPath: heroImagePath,
        debugScreenshotPath,
        timeoutMs: 300_000,
      });

      const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
      if (!savedPath) {
        lastReason = 'Flow completed but no local image path returned';
        logValidationFailure(attempt, lastReason);
        continue;
      }

      await persistHeroMeta(outputDir, {
        videoId,
        generatedAt: new Date().toISOString(),
        promptUsed,
        heroImagePath: savedPath,
        provider: imageProvider,
        elapsedMs: response.elapsedMs,
      });

      console.log(`[hero-image] saved: ${savedPath} (${response.elapsedMs}ms)`);
      return { heroImagePath: savedPath, promptUsed };
    } catch (err) {
      lastReason = err instanceof Error ? err.message : 'unknown error';
      logValidationFailure(attempt, lastReason);
    }
  }

  throw new AppError(`Hero image generation failed after ${MAX_RETRIES} attempts: ${lastReason}`, 502, 'HERO_IMAGE_FAILED');
}
