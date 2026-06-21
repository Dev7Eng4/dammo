import path from 'node:path';
import { AppError } from '../../shared/http/errors.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../chrome-profiles/chrome-profiles.types.js';
import { flowBrowserService } from '../llm-browser/flow-browser.service.js';
import type { MetaStep3Output } from './reup-metadata.types.js';

const MAX_RETRIES = 3;
const DEFAULT_HERO_IMAGE_FILENAME = 'background.jpg';
const THUMBNAIL_VISUAL_FILENAME = 'thumbnail_visual.jpg';

export type HeroImageStatus = 'started' | 'retry';

export interface HeroImageProgress {
  attempt: number;
  profileId: string;
  profileName: string;
  status: HeroImageStatus;
}

export interface ThumbnailVisualGenerationInput {
  visualPrompt: string;
  negativePrompt?: string;
}

export interface FlowProfileOptions {
  profileId?: string;
}

export interface RunHeroImageGenerationOptions extends FlowProfileOptions {
  fileName?: string;
  thumbnailVisual?: ThumbnailVisualGenerationInput;
  onProgress?: (progress: HeroImageProgress) => void;
}

export interface RunThumbnailVisualGenerationOptions extends FlowProfileOptions {
  onProgress?: (progress: HeroImageProgress) => void;
}

export interface ThumbnailVisualGenerationResult {
  thumbnailVisualPath: string;
  thumbnailVisualPromptUsed: string;
}

export interface HeroImageGenerationResult {
  heroImagePath: string;
  promptUsed: string;
  thumbnailVisualPath?: string;
  thumbnailVisualPromptUsed?: string;
}

function logValidationFailure(attempt: number, reason: string): void {
  console.warn(`[hero-image] attempt ${attempt}: generation failed (${reason})`);
}

function buildFlowPrompt(mainPrompt: unknown, negativePrompt?: unknown): string {
  const promptText = typeof mainPrompt === 'string' ? mainPrompt.trim() : String(mainPrompt ?? '').trim();
  if (!promptText) {
    throw new AppError('Flow image prompt is empty', 400, 'INVALID_FLOW_PROMPT');
  }

  const negative = typeof negativePrompt === 'string' ? negativePrompt.trim() : '';
  if (negative.length > 0) {
    return `${promptText}\n\nNegative prompt: ${negative}`;
  }

  return promptText;
}

function buildHeroPrompt(metaStep3: MetaStep3Output): string {
  return buildFlowPrompt(metaStep3.hero_image_prompt.prompt, metaStep3.hero_image_prompt.negative_prompt);
}

function resolveFlowProfile(options?: FlowProfileOptions): ChromeProfile {
  if (options?.profileId) {
    const profile = chromeProfilesService.getById(options.profileId);
    if (profile.role !== 'main') {
      throw new AppError('Google Flow requires the main Chrome profile', 400, 'MAIN_PROFILE_REQUIRED');
    }
    return profile;
  }
  return chromeProfilesService.requireMainProfile();
}

async function tryGenerateThumbnailVisual(
  profileId: string,
  outputDir: string,
  thumbnailVisual: ThumbnailVisualGenerationInput,
  debugScreenshotPath: string,
): Promise<{ thumbnailVisualPath: string; thumbnailVisualPromptUsed: string } | undefined> {
  try {
    const thumbnailVisualPromptUsed = buildFlowPrompt(thumbnailVisual.visualPrompt, thumbnailVisual.negativePrompt);
    const response = await flowBrowserService.generateImage(profileId, thumbnailVisualPromptUsed, {
      outputDir,
      fileName: THUMBNAIL_VISUAL_FILENAME,
      debugScreenshotPath,
      timeoutMs: 300_000,
    });

    const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
    if (!savedPath) {
      console.warn('[hero-image] thumbnail visual: Flow completed but no local image path returned');
      return undefined;
    }

    console.log(`[hero-image] thumbnail visual saved: ${savedPath} (${response.elapsedMs}ms)`);
    return { thumbnailVisualPath: savedPath, thumbnailVisualPromptUsed };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error';
    console.warn(`[hero-image] thumbnail visual generation failed (non-fatal): ${reason}`);
    return undefined;
  }
}

export async function runThumbnailVisualGeneration(
  outputDir: string,
  thumbnailVisual: ThumbnailVisualGenerationInput,
  options?: RunThumbnailVisualGenerationOptions,
): Promise<ThumbnailVisualGenerationResult> {
  const debugScreenshotPath = path.join(outputDir, 'flow-debug.png');
  const profile = resolveFlowProfile(options);

  console.log(`[hero-image] Mở Chrome main profile ${profile.name} cho thumbnail visual...`);

  let lastReason = 'unknown error';

  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      options?.onProgress?.({
        attempt,
        profileId: profile.id,
        profileName: profile.name,
        status: attempt === 1 ? 'started' : 'retry',
      });

      const result = await tryGenerateThumbnailVisual(profile.id, outputDir, thumbnailVisual, debugScreenshotPath);
      if (result) {
        return result;
      }

      lastReason = 'Flow completed but no local image path returned';
      logValidationFailure(attempt, lastReason);
    }

    throw new AppError(
      `Thumbnail visual generation failed after ${MAX_RETRIES} attempts: ${lastReason}`,
      502,
      'THUMBNAIL_VISUAL_FAILED',
    );
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}

export async function runHeroImageGeneration(
  metaStep3: MetaStep3Output,
  videoId: string,
  outputDir: string,
  options?: RunHeroImageGenerationOptions,
): Promise<HeroImageGenerationResult> {
  const promptUsed = buildHeroPrompt(metaStep3);
  const fileName = options?.fileName ?? DEFAULT_HERO_IMAGE_FILENAME;
  const debugScreenshotPath = path.join(outputDir, 'flow-debug.png');

  const profile = resolveFlowProfile(options);

  console.log(`[hero-image] Mở Chrome main profile ${profile.name} cho Google Flow...`);

  let lastReason = 'unknown error';

  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      options?.onProgress?.({
        attempt,
        profileId: profile.id,
        profileName: profile.name,
        status: attempt === 1 ? 'started' : 'retry',
      });

      try {
        const response = await flowBrowserService.generateImage(profile.id, promptUsed, {
          outputDir,
          fileName,
          debugScreenshotPath,
          timeoutMs: 300_000,
        });

        const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
        if (!savedPath) {
          lastReason = 'Flow completed but no local image path returned';
          logValidationFailure(attempt, lastReason);
          continue;
        }

        console.log(`[hero-image] saved: ${savedPath} (${response.elapsedMs}ms)`);

        const thumbnailVisualResult =
          options?.thumbnailVisual &&
          (await tryGenerateThumbnailVisual(profile.id, outputDir, options.thumbnailVisual, debugScreenshotPath));

        return {
          heroImagePath: savedPath,
          promptUsed,
          ...(thumbnailVisualResult ?? {}),
        };
      } catch (err) {
        lastReason = err instanceof Error ? err.message : 'unknown error';
        logValidationFailure(attempt, lastReason);
      }
    }

    throw new AppError(`Hero image generation failed after ${MAX_RETRIES} attempts: ${lastReason}`, 502, 'HERO_IMAGE_FAILED');
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
