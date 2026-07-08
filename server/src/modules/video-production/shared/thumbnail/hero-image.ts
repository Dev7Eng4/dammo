import path from 'node:path';
import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../../chrome-profiles/chrome-profiles.types.js';
import { FLOW_MAX_RETRIES, runWithFlowRetries, type FlowRetryProgress } from '../../../llm-browser/flow-retry.js';

export const DEFAULT_HERO_IMAGE_FILENAME = 'background.jpg';
const THUMBNAIL_VISUAL_FILENAME = 'thumbnail_visual.jpg';

export type HeroImageStatus = FlowRetryProgress['status'];
export type HeroImageProgress = FlowRetryProgress;

export interface ThumbnailVisualGenerationInput {
  visualPrompt: string;
  negativePrompt?: string;
}

export interface FlowProfileOptions {
  profileId?: string;
}

export interface RunFlowImageGenerationOptions extends FlowProfileOptions {
  fileName?: string;
  referenceImagePath?: string;
  onProgress?: (progress: HeroImageProgress) => void;
}

export interface RunThumbnailVisualGenerationOptions extends FlowProfileOptions {
  onProgress?: (progress: HeroImageProgress) => void;
}

export interface FlowImageGenerationResult {
  imagePath: string;
  promptUsed: string;
}

export interface ThumbnailVisualGenerationResult {
  thumbnailVisualPath: string;
  thumbnailVisualPromptUsed: string;
}

export function buildFlowPrompt(mainPrompt: unknown, negativePrompt?: unknown): string {
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

export async function runFlowImageGeneration(
  prompt: string,
  outputDir: string,
  options?: RunFlowImageGenerationOptions,
): Promise<FlowImageGenerationResult> {
  const promptUsed = buildFlowPrompt(prompt);
  const fileName = options?.fileName ?? DEFAULT_HERO_IMAGE_FILENAME;
  const debugScreenshotPath = path.join(outputDir, 'flow-debug.png');
  const profile = resolveFlowProfile(options);

  console.log(`[hero-image] Mở Chrome main profile ${profile.name} cho Google Flow...`);

  try {
    const { savedPath, response } = await runWithFlowRetries({
      profileId: profile.id,
      profileName: profile.name,
      prompt: promptUsed,
      logPrefix: '[hero-image]',
      failureCode: 'FLOW_IMAGE_FAILED',
      buildFailureMessage: reason => `Flow image generation failed after ${FLOW_MAX_RETRIES} attempts: ${reason}`,
      generateOptions: {
        outputDir,
        fileName,
        referenceImagePath: options?.referenceImagePath,
        debugScreenshotPath,
      },
      onProgress: options?.onProgress,
      onAttemptFailure: (attempt, reason) => {
        console.warn(`[hero-image] attempt ${attempt}: generation failed (${reason})`);
      },
    });

    console.log(`[hero-image] saved: ${savedPath} (${response.elapsedMs}ms)`);
    return { imagePath: savedPath, promptUsed };
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}

export async function runThumbnailVisualGeneration(
  outputDir: string,
  thumbnailVisual: ThumbnailVisualGenerationInput,
  options?: RunThumbnailVisualGenerationOptions,
): Promise<ThumbnailVisualGenerationResult> {
  const thumbnailVisualPromptUsed = buildFlowPrompt(thumbnailVisual.visualPrompt, thumbnailVisual.negativePrompt);
  const debugScreenshotPath = path.join(outputDir, 'flow-debug.png');
  const profile = resolveFlowProfile(options);

  console.log(`[hero-image] Mở Chrome main profile ${profile.name} cho thumbnail visual...`);

  try {
    const { savedPath, response } = await runWithFlowRetries({
      profileId: profile.id,
      profileName: profile.name,
      prompt: thumbnailVisualPromptUsed,
      logPrefix: '[hero-image] thumbnail visual',
      failureCode: 'THUMBNAIL_VISUAL_FAILED',
      buildFailureMessage: reason =>
        `Thumbnail visual generation failed after ${FLOW_MAX_RETRIES} attempts: ${reason}`,
      generateOptions: {
        outputDir,
        fileName: THUMBNAIL_VISUAL_FILENAME,
        debugScreenshotPath,
      },
      onProgress: options?.onProgress,
      onAttemptFailure: (attempt, reason) => {
        console.warn(`[hero-image] thumbnail visual attempt ${attempt}: generation failed (${reason})`);
      },
    });

    console.log(`[hero-image] thumbnail visual saved: ${savedPath} (${response.elapsedMs}ms)`);
    return { thumbnailVisualPath: savedPath, thumbnailVisualPromptUsed };
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
