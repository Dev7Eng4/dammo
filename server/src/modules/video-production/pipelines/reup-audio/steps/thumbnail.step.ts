import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../../../shared/http/errors.js';
import { timedStep } from '../../../../../shared/timing/step-timer.js';
import { hasNicheMetadataPrompt } from '../../../shared/meta/run-metadata.js';
import { isCelebrityWisdomNiche } from '../../../shared/meta/metadata.types.js';
import { runDefaultFlowThumbnail } from '../../../shared/thumbnail/default-flow-thumbnail.js';
import { resolveThumbnailImageProvider } from '../../../shared/thumbnail/hero-image.js';
import { runCelebrityWisdomThumbnail } from '../../../shared/thumbnail/run-celebrity-wisdom-thumbnail.js';
import { runNicheImagePromptThumbnail } from '../../../shared/thumbnail/run-niche-image-prompt-thumbnail.js';
import { buildThumbnailReferenceImagePaths } from '../../../shared/thumbnail/thumbnail-reference-images.js';
import type { VideoTypeStrategy } from '../strategies/video-type.strategy.js';
import type { VideoTaskContext } from '../video-task.context.js';

/**
 * Which of the three mutually exclusive thumbnail flows ran. The background
 * image a video type needs afterwards depends on this.
 */
export type ThumbnailFlow = 'celebrity_wisdom' | 'niche_prompt' | 'legacy';

export interface ThumbnailStepResult {
  flow: ThumbnailFlow;
  reupThumbnailPath?: string;
  /** Set only when the video type produced thumbnail + background in one batch. */
  heroImagePath?: string;
}

/** Image tools drop these next to the output; they are never part of the deliverable. */
export async function cleanupImageDebugArtifacts(workDir: string): Promise<void> {
  await fs.unlink(path.join(workDir, 'flow-debug.png')).catch(() => undefined);
  await fs.unlink(path.join(workDir, 'meta-debug.png')).catch(() => undefined);
}

export function nonFatalMessage(err: unknown, fallback: string): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

function requireImageGenerationPrompt(ctx: VideoTaskContext, flowLabel: string): string {
  const prompt = ctx.videoMeta?.image_generation_prompt?.trim() ?? '';
  if (!prompt) {
    throw new AppError(`image_generation_prompt is required for ${flowLabel}`, 400, 'INVALID_INPUT');
  }
  return prompt;
}

export async function runThumbnailStep(
  ctx: VideoTaskContext,
  strategy: VideoTypeStrategy,
): Promise<ThumbnailStepResult> {
  const { destination, downloaded, workDir, log, stepTimer } = ctx;

  if (!ctx.videoMeta) {
    throw new AppError('Metadata is required for thumbnail generation', 400, 'INVALID_INPUT');
  }

  if (isCelebrityWisdomNiche(destination.niche)) {
    return runCelebrityWisdomFlow(ctx);
  }

  if (hasNicheMetadataPrompt(destination.language, destination.niche)) {
    const imageGenerationPrompt = requireImageGenerationPrompt(ctx, 'niche metadata thumbnail');

    const batch = await strategy.tryCombinedThumbnailBatch(ctx, imageGenerationPrompt);
    if (batch) {
      return { flow: 'niche_prompt', ...batch };
    }

    log.info(
      `Creating niche thumbnail via ${resolveThumbnailImageProvider()} (image_generation_prompt, no reference)...`,
    );

    try {
      const nicheThumb = await timedStep(
        `Niche image_generation_prompt thumbnail (${resolveThumbnailImageProvider()})`,
        () =>
          runNicheImagePromptThumbnail(workDir, imageGenerationPrompt, {
            onProgress: log.enabled
              ? progress => {
                  const suffix = progress.status === 'retry' ? 'retry ' : '';
                  log.info(`Niche thumbnail on ${progress.profileName} ${suffix}(attempt ${progress.attempt})...`);
                }
              : undefined,
          }),
        stepTimer,
      );

      await cleanupImageDebugArtifacts(workDir);
      log.ok('Niche thumbnail saved → thumbnail.jpg (no reference)');
      return { flow: 'niche_prompt', reupThumbnailPath: nicheThumb.thumbnailPath };
    } catch (err) {
      const message = nonFatalMessage(err, 'Niche thumbnail generation failed');
      console.warn(`[reup-video] niche image_generation_prompt thumbnail skipped (non-fatal): ${message}`);
      log.info(`Niche thumbnail skipped: ${message}`);
      return { flow: 'niche_prompt' };
    }
  }

  const styleKey = destination.thumbnailStyleKey?.trim();

  if (styleKey) {
    log.info(`Creating thumbnail via ${resolveThumbnailImageProvider()} (${styleKey})...`);

    try {
      const referenceImagePaths = buildThumbnailReferenceImagePaths({
        promptKey: styleKey,
        language: destination.language,
        oldThumbnailPath: downloaded.thumbnailPath,
        channelId: destination.id,
        thumbnailBackgroundFile: destination.thumbnailBackgroundFile,
      });

      const defaultResult = await timedStep(
        `Thumbnail ${resolveThumbnailImageProvider()} (${styleKey})`,
        () =>
          runDefaultFlowThumbnail(workDir, destination.language, {
            promptKey: styleKey,
            referenceImagePaths,
            onProgress: log.enabled
              ? progress => {
                  const suffix = progress.status === 'retry' ? 'retry ' : '';
                  log.info(`Thumbnail on ${progress.profileName} ${suffix}(attempt ${progress.attempt})...`);
                }
              : undefined,
          }),
        stepTimer,
      );

      log.ok('Thumbnail saved → thumbnail.jpg');
      return { flow: 'legacy', reupThumbnailPath: defaultResult.thumbnailPath };
    } catch (err) {
      const message = nonFatalMessage(err, 'Thumbnail generation failed');
      console.warn(`[reup-video] default thumbnail skipped (non-fatal): ${message}`);
      log.info(`Thumbnail skipped: ${message}`);
      return { flow: 'legacy' };
    }
  }

  return { flow: 'legacy' };
}

async function runCelebrityWisdomFlow(ctx: VideoTaskContext): Promise<ThumbnailStepResult> {
  const { destination, workDir, log, stepTimer } = ctx;
  const imageGenerationPrompt = requireImageGenerationPrompt(ctx, 'celebrity wisdom thumbnail');

  const celebrityId = destination.celebrityId?.trim() ?? '';
  if (!celebrityId) {
    throw new AppError('celebrityId is required for celebrity wisdom thumbnail', 400, 'INVALID_INPUT');
  }

  log.info(
    `Creating celebrity wisdom thumbnail via ${resolveThumbnailImageProvider()} (celebrity reference)...`,
  );

  try {
    const wisdomThumb = await timedStep(
      `Celebrity wisdom thumbnail (${resolveThumbnailImageProvider()})`,
      () =>
        runCelebrityWisdomThumbnail(workDir, celebrityId, imageGenerationPrompt, {
          onProgress: log.enabled
            ? progress => {
                const suffix = progress.status === 'retry' ? 'retry ' : '';
                log.info(`Wisdom thumbnail on ${progress.profileName} ${suffix}(attempt ${progress.attempt})...`);
              }
            : undefined,
        }),
      stepTimer,
    );

    await cleanupImageDebugArtifacts(workDir);
    log.ok(`Wisdom thumbnail saved → thumbnail.jpg (ref: ${path.basename(wisdomThumb.referenceImagePath)})`);
    return { flow: 'celebrity_wisdom', reupThumbnailPath: wisdomThumb.thumbnailPath };
  } catch (err) {
    const message = nonFatalMessage(err, 'Celebrity wisdom thumbnail generation failed');
    console.warn(`[reup-video] celebrity wisdom thumbnail skipped (non-fatal): ${message}`);
    log.info(`Wisdom thumbnail skipped: ${message}`);
    return { flow: 'celebrity_wisdom' };
  }
}
