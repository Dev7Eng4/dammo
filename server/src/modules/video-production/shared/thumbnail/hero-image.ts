import path from 'node:path';
import type { ImageBrowserProvider } from '../../../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../../chrome-profiles/chrome-profiles.types.js';
import { FLOW_MAX_RETRIES, runWithFlowRetries, type FlowRetryProgress } from '../../../llm-browser/flow-retry.js';
import { metaBrowserService } from '../../../llm-browser/meta-browser.service.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';

export const DEFAULT_HERO_IMAGE_FILENAME = 'background.jpg';
const THUMBNAIL_VISUAL_FILENAME = 'thumbnail_visual.jpg';
const META_IMAGE_TIMEOUT_MS = 300_000;

export type HeroImageStatus = FlowRetryProgress['status'];
export type HeroImageProgress = FlowRetryProgress;

export interface ThumbnailVisualGenerationInput {
  visualPrompt: string;
  negativePrompt?: string;
}

export interface FlowProfileOptions {
  profileId?: string;
}

export interface FlowImageJob {
  prompt: string;
  fileName: string;
  referenceImagePaths?: string[];
  logPrefix?: string;
  failureCode?: string;
  buildFailureMessage?: (reason: string, maxRetries: number) => string;
}

export type BrowserImageJob = FlowImageJob;

export interface RunFlowImageGenerationsOptions extends FlowProfileOptions {
  onProgress?: (progress: HeroImageProgress) => void;
  onJobProgress?: (jobIndex: number, progress: HeroImageProgress) => void;
}

export interface RunBrowserImageGenerationsOptions extends RunFlowImageGenerationsOptions {
  /** Defaults to `promptsSettings.defaultThumbnailProvider`. */
  provider?: ImageBrowserProvider;
}

export interface RunFlowImageGenerationOptions extends FlowProfileOptions {
  fileName?: string;
  referenceImagePaths?: string[];
  onProgress?: (progress: HeroImageProgress) => void;
}

export interface RunBrowserImageGenerationOptions extends RunFlowImageGenerationOptions {
  /** Defaults to `promptsSettings.defaultThumbnailProvider`. */
  provider?: ImageBrowserProvider;
}

export interface RunThumbnailVisualGenerationOptions extends FlowProfileOptions {
  onProgress?: (progress: HeroImageProgress) => void;
  provider?: ImageBrowserProvider;
}

export interface FlowImageGenerationResult {
  imagePath: string;
  promptUsed: string;
}

export type BrowserImageGenerationResult = FlowImageGenerationResult;

export interface ThumbnailVisualGenerationResult {
  thumbnailVisualPath: string;
  thumbnailVisualPromptUsed: string;
}

export function resolveThumbnailImageProvider(provider?: ImageBrowserProvider): ImageBrowserProvider {
  return provider ?? promptsSettingsService.get().defaultThumbnailProvider;
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

/**
 * Run one or more Flow single (`generateImage`) jobs in one Chrome session:
 * open profile once → generate sequentially → close once.
 */
export async function runFlowImageGenerations(
  outputDir: string,
  jobs: FlowImageJob[],
  options?: RunFlowImageGenerationsOptions,
): Promise<FlowImageGenerationResult[]> {
  if (jobs.length === 0) {
    throw new AppError('Flow image jobs array is empty', 400, 'INVALID_INPUT');
  }

  const profile = resolveFlowProfile(options);
  const debugScreenshotPath = path.join(outputDir, 'flow-debug.png');
  const results: FlowImageGenerationResult[] = [];

  console.log(
    `[hero-image] Mở Chrome main profile ${profile.name} cho Google Flow (${jobs.length} job(s))...`,
  );

  try {
    for (let jobIndex = 0; jobIndex < jobs.length; jobIndex += 1) {
      const job = jobs[jobIndex]!;
      const promptUsed = buildFlowPrompt(job.prompt);
      const logPrefix = job.logPrefix ?? `[hero-image] job ${jobIndex + 1}/${jobs.length}`;
      const failureCode = job.failureCode ?? 'FLOW_IMAGE_FAILED';

      const { savedPath, response } = await runWithFlowRetries({
        profileId: profile.id,
        profileName: profile.name,
        prompt: promptUsed,
        logPrefix,
        failureCode,
        buildFailureMessage:
          job.buildFailureMessage ??
          (reason => `Flow image generation failed after ${FLOW_MAX_RETRIES} attempts: ${reason}`),
        generateOptions: {
          outputDir,
          fileName: job.fileName,
          ...(job.referenceImagePaths?.length ? { referenceImagePaths: job.referenceImagePaths } : {}),
          debugScreenshotPath,
        },
        onProgress: progress => {
          options?.onProgress?.(progress);
          options?.onJobProgress?.(jobIndex, progress);
        },
        onAttemptFailure: (attempt, reason) => {
          console.warn(`${logPrefix} attempt ${attempt}: generation failed (${reason})`);
        },
      });

      console.log(`${logPrefix} saved: ${savedPath} (${response.elapsedMs}ms)`);
      results.push({ imagePath: savedPath, promptUsed });
    }

    return results;
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}

export async function runFlowImageGeneration(
  prompt: string,
  outputDir: string,
  options?: RunFlowImageGenerationOptions,
): Promise<FlowImageGenerationResult> {
  const [result] = await runFlowImageGenerations(
    outputDir,
    [
      {
        prompt,
        fileName: options?.fileName ?? DEFAULT_HERO_IMAGE_FILENAME,
        ...(options?.referenceImagePaths?.length
          ? { referenceImagePaths: options.referenceImagePaths }
          : {}),
      },
    ],
    {
      profileId: options?.profileId,
      onProgress: options?.onProgress,
    },
  );

  if (!result) {
    throw new AppError('Flow image generation returned no result', 502, 'FLOW_IMAGE_FAILED');
  }

  return result;
}

async function runMetaImageGenerations(
  outputDir: string,
  jobs: BrowserImageJob[],
  options?: RunBrowserImageGenerationsOptions,
): Promise<BrowserImageGenerationResult[]> {
  const profile = resolveFlowProfile(options);
  const debugScreenshotPath = path.join(outputDir, 'meta-debug.png');
  const results: BrowserImageGenerationResult[] = [];

  console.log(
    `[hero-image] Mở Chrome main profile ${profile.name} cho Meta AI (${jobs.length} job(s))...`,
  );

  const progress: HeroImageProgress = {
    attempt: 1,
    profileId: profile.id,
    profileName: profile.name,
    status: 'started',
  };
  options?.onProgress?.(progress);

  try {
    for (let jobIndex = 0; jobIndex < jobs.length; jobIndex += 1) {
      const job = jobs[jobIndex]!;
      const promptUsed = buildFlowPrompt(job.prompt);
      const logPrefix = job.logPrefix ?? `[hero-image] meta job ${jobIndex + 1}/${jobs.length}`;
      const failureCode = job.failureCode ?? 'META_IMAGE_FAILED';

      options?.onJobProgress?.(jobIndex, progress);
      console.log(`${logPrefix}: generating via Meta AI...`);

      try {
        const response = await metaBrowserService.generateMedia(profile.id, promptUsed, {
          mediaKind: 'image',
          aspectRatio: '16:9',
          outputDir,
          fileName: job.fileName,
          debugScreenshotPath,
          timeoutMs: META_IMAGE_TIMEOUT_MS,
          ...(job.referenceImagePaths?.length ? { referenceImagePaths: job.referenceImagePaths } : {}),
        });

        const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
        if (!savedPath) {
          throw new AppError(
            job.buildFailureMessage?.('no local image path returned', 1) ??
              'Meta image generation produced no local file',
            502,
            failureCode,
          );
        }

        console.log(`${logPrefix} saved: ${savedPath} (${response.elapsedMs}ms)`);
        results.push({ imagePath: savedPath, promptUsed });
      } catch (err) {
        if (err instanceof AppError) throw err;
        const reason = err instanceof Error ? err.message : String(err);
        throw new AppError(
          job.buildFailureMessage?.(reason, 1) ?? `Meta image generation failed: ${reason}`,
          502,
          failureCode,
        );
      }
    }

    return results;
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}

/**
 * Generate one or more images via the configured thumbnail provider
 * (`defaultThumbnailProvider`: flow | meta).
 */
export async function runBrowserImageGenerations(
  outputDir: string,
  jobs: BrowserImageJob[],
  options?: RunBrowserImageGenerationsOptions,
): Promise<BrowserImageGenerationResult[]> {
  const provider = resolveThumbnailImageProvider(options?.provider);
  if (provider === 'meta') {
    return runMetaImageGenerations(outputDir, jobs, options);
  }
  return runFlowImageGenerations(outputDir, jobs, options);
}

export async function runBrowserImageGeneration(
  prompt: string,
  outputDir: string,
  options?: RunBrowserImageGenerationOptions,
): Promise<BrowserImageGenerationResult> {
  const [result] = await runBrowserImageGenerations(
    outputDir,
    [
      {
        prompt,
        fileName: options?.fileName ?? DEFAULT_HERO_IMAGE_FILENAME,
        ...(options?.referenceImagePaths?.length
          ? { referenceImagePaths: options.referenceImagePaths }
          : {}),
      },
    ],
    {
      profileId: options?.profileId,
      onProgress: options?.onProgress,
      provider: options?.provider,
    },
  );

  if (!result) {
    throw new AppError('Browser image generation returned no result', 502, 'BROWSER_IMAGE_FAILED');
  }

  return result;
}

export async function runThumbnailVisualGeneration(
  outputDir: string,
  thumbnailVisual: ThumbnailVisualGenerationInput,
  options?: RunThumbnailVisualGenerationOptions,
): Promise<ThumbnailVisualGenerationResult> {
  const thumbnailVisualPromptUsed = buildFlowPrompt(
    thumbnailVisual.visualPrompt,
    thumbnailVisual.negativePrompt,
  );
  const provider = resolveThumbnailImageProvider(options?.provider);

  const [result] = await runBrowserImageGenerations(
    outputDir,
    [
      {
        prompt: thumbnailVisualPromptUsed,
        fileName: THUMBNAIL_VISUAL_FILENAME,
        logPrefix: `[hero-image] thumbnail visual (${provider})`,
        failureCode: 'THUMBNAIL_VISUAL_FAILED',
        buildFailureMessage: reason =>
          `Thumbnail visual generation failed via ${provider}: ${reason}`,
      },
    ],
    {
      profileId: options?.profileId,
      onProgress: options?.onProgress,
      provider,
    },
  );

  if (!result) {
    throw new AppError('Thumbnail visual generation returned no result', 502, 'THUMBNAIL_VISUAL_FAILED');
  }

  return {
    thumbnailVisualPath: result.imagePath,
    thumbnailVisualPromptUsed: result.promptUsed,
  };
}
