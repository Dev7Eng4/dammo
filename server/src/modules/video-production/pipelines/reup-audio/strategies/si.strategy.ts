import { AppError } from '../../../../../shared/http/errors.js';
import { timedStep } from '../../../../../shared/timing/step-timer.js';
import { AI_VIDEO_SI_MULTI_MAX_TRANSCRIPT_SEC } from '../../../shared/ai-video/index.js';
import { isThumbnailOnlyTwoStepNiche } from '../../../shared/meta/two-step/two-step-niche.config.js';
import { copyCelebrityImagesToWorkDir, listSiMultiImagePaths } from '../../../shared/si-video/si-multi-image.js';
import { assembleReupSiVideo } from '../../../shared/si-video/si-video-assembler.js';
import {
  DEFAULT_HERO_IMAGE_FILENAME,
  resolveThumbnailImageProvider,
  runBrowserImageGeneration,
} from '../../../shared/thumbnail/hero-image.js';
import { runGeneralImage } from '../../../shared/thumbnail/run-general-image.js';
import { runSiOneImageFlowBatch } from '../../../shared/thumbnail/run-si-one-image-flow-batch.js';
import type { ReupAudioBackgroundImage } from '../../../../youtube-channels/youtube-channels.types.js';
import type { ProductionDestination } from '../../../ports/production-destination.port.js';
import { runSceneAssetsStep } from '../steps/scene-assets.step.js';
import { cleanupImageDebugArtifacts, nonFatalMessage, type ThumbnailFlow } from '../steps/thumbnail.step.js';
import { toOnLog, type AssembleContext, type VideoTaskContext } from '../video-task.context.js';
import type { AssembleReadiness, VideoTypeStrategy, VisualAssets } from './video-type.strategy.js';

function resolveBackgroundImageMode(destination: ProductionDestination): ReupAudioBackgroundImage {
  return destination.reupAudioBackgroundImage ?? 'one_image';
}

/** SI `one_image` asks the image tool for thumbnail.jpg and background.jpg in one batch. */
async function runOneImageBatch(
  ctx: VideoTaskContext,
  imageGenerationPrompt: string,
): Promise<Pick<VisualAssets, 'reupThumbnailPath' | 'heroImagePath'>> {
  const { workDir, log, stepTimer } = ctx;

  const videoVisualPrompt = ctx.videoMeta?.video_visual_prompt?.trim() ?? '';
  if (!videoVisualPrompt) {
    throw new AppError('video_visual_prompt is required for SI one_image background', 400, 'INVALID_INPUT');
  }

  log.info(
    `Creating thumbnail + background via ${resolveThumbnailImageProvider()} (image_generation_prompt + video_visual_prompt)...`,
  );

  try {
    const batchResult = await timedStep(
      `SI one_image (thumbnail + background ${resolveThumbnailImageProvider()})`,
      () =>
        runSiOneImageFlowBatch(workDir, imageGenerationPrompt, videoVisualPrompt, {
          onJobProgress: log.enabled
            ? (jobIndex, progress) => {
                const jobLabel = jobIndex === 0 ? 'thumbnail' : 'background';
                const suffix = progress.status === 'retry' ? 'retry ' : '';
                log.info(`SI ${jobLabel} on ${progress.profileName} ${suffix}(attempt ${progress.attempt})...`);
              }
            : undefined,
        }),
      stepTimer,
    );

    await cleanupImageDebugArtifacts(workDir);
    log.ok(`SI one_image ${resolveThumbnailImageProvider()} saved → thumbnail.jpg, background.jpg`);

    return {
      reupThumbnailPath: batchResult.thumbnailPath,
      heroImagePath: batchResult.heroImagePath,
    };
  } catch (err) {
    const message = nonFatalMessage(err, 'SI one_image batch failed');
    console.warn(`[reup-video] SI one_image batch skipped (non-fatal): ${message}`);
    log.info(`SI one_image batch skipped: ${message}`);
    return {};
  }
}

/**
 * Background image for SI `one_image` when the thumbnail step did not already
 * produce one. Uses `video_visual_prompt` when metadata carries one, otherwise
 * falls back to a general image seeded with the source thumbnail.
 */
async function generateBackgroundImage(ctx: VideoTaskContext): Promise<string> {
  const { destination, downloaded, workDir, log, stepTimer } = ctx;

  if (!ctx.videoMeta) {
    throw new AppError('Metadata is required for SI general image', 400, 'INVALID_INPUT');
  }

  const videoVisualPrompt = ctx.videoMeta.video_visual_prompt?.trim() ?? '';

  const onProgress = (label: string) =>
    log.enabled
      ? (progress: { attempt: number; profileName: string; status: string }) => {
          const suffix = progress.status === 'retry' ? 'retry ' : '';
          log.info(`${label} on ${progress.profileName} ${suffix}(attempt ${progress.attempt})...`);
        }
      : undefined;

  if (videoVisualPrompt) {
    log.info(
      `Creating background image via ${resolveThumbnailImageProvider()} (video_visual_prompt, no reference)...`,
    );

    const heroResult = await timedStep(
      `Background image (${resolveThumbnailImageProvider()} video_visual_prompt)`,
      () =>
        runBrowserImageGeneration(videoVisualPrompt, workDir, {
          fileName: DEFAULT_HERO_IMAGE_FILENAME,
          onProgress: onProgress('Background image'),
        }),
      stepTimer,
    );

    await cleanupImageDebugArtifacts(workDir);
    log.ok('Background image saved → background.jpg (video_visual_prompt)');
    return heroResult.imagePath;
  }

  const generalImageTitle = String(ctx.videoMeta.metadata.title ?? '').trim();
  if (!generalImageTitle) {
    throw new AppError('Metadata title is required for general image', 400, 'INVALID_INPUT');
  }

  log.info(`Creating general image via ${resolveThumbnailImageProvider()} (general + reference)...`);

  const heroResult = await timedStep(
    `General image (${resolveThumbnailImageProvider()} + reference)`,
    () =>
      runGeneralImage(generalImageTitle, destination.language, workDir, {
        referenceImagePaths: downloaded.thumbnailPath ? [downloaded.thumbnailPath] : [],
        onProgress: onProgress('General image'),
      }),
    stepTimer,
  );

  await cleanupImageDebugArtifacts(workDir);
  log.ok('General image saved → background.jpg');
  return heroResult.heroImagePath;
}

export const siStrategy: VideoTypeStrategy = {
  type: 'si',

  async tryCombinedThumbnailBatch(ctx, imageGenerationPrompt) {
    const backgroundImage = resolveBackgroundImageMode(ctx.destination);

    /* Thumbnail-only 2-step meta niches have no video_visual_prompt. */
    const useBatch =
      backgroundImage === 'one_image' &&
      !isThumbnailOnlyTwoStepNiche(ctx.destination.language, ctx.destination.niche);

    if (!useBatch) return null;

    return runOneImageBatch(ctx, imageGenerationPrompt);
  },

  async prepareEnrichedVisuals(ctx, assets, thumbnailFlow: ThumbnailFlow) {
    /* The niche-prompt and celebrity-wisdom flows already settled the background. */
    if (thumbnailFlow !== 'legacy') return {};

    const backgroundImage = resolveBackgroundImageMode(ctx.destination);
    if (backgroundImage !== 'one_image') {
      ctx.log.info(`Skipping general image (backgroundImage=${backgroundImage})`);
      console.log(`[reup-video] Skipping general image (backgroundImage=${backgroundImage})`);
      return {};
    }

    if (assets.heroImagePath) {
      ctx.log.info('Skipping background image (already created with thumbnail batch)');
      return {};
    }

    return { heroImagePath: await generateBackgroundImage(ctx) };
  },

  async prepareSceneAssets(ctx) {
    if (resolveBackgroundImageMode(ctx.destination) !== 'multi_image') return {};

    const result = await runSceneAssetsStep(ctx, {
      label: 'SI multi_image',
      maxTranscriptSec: AI_VIDEO_SI_MULTI_MAX_TRANSCRIPT_SEC,
    });

    return {
      aiScenePrompts: result.scenes,
      aiScenePromptsPath: result.promptsPath,
      aiSlidesDir: result.slidesDir,
    };
  },

  async canAssemble(ctx, assets): Promise<AssembleReadiness> {
    const { destination, workDir, log } = ctx;
    const backgroundImage = resolveBackgroundImageMode(destination);
    const needsCenterImage = backgroundImage === 'one_image';
    const needsMultiImage = backgroundImage === 'multi_image' || backgroundImage === 'celebrity';

    if (backgroundImage === 'celebrity') {
      const celebrityId = destination.celebrityId?.trim();
      if (!celebrityId) {
        throw new AppError(
          'Channel is missing celebrityId for celebrity background image mode',
          400,
          'VALIDATION_ERROR',
        );
      }

      log.info(`Copying celebrity images (${celebrityId}) into images/...`);
      const copied = await copyCelebrityImagesToWorkDir(celebrityId, workDir, toOnLog(log));
      log.ok(`Copied ${copied.length} celebrity image(s) → images/`);
    }

    if (needsCenterImage && !assets.heroImagePath) {
      console.warn('[reup-video] SI video assembly skipped: hero image not generated');
      return { ready: false, reason: 'SI video assembly skipped: hero image missing' };
    }

    if (needsMultiImage && (await listSiMultiImagePaths(workDir)).length === 0) {
      console.warn('[reup-video] SI video assembly skipped: no images in videoId/images');
      return {
        ready: false,
        reason:
          backgroundImage === 'celebrity'
            ? 'SI video assembly skipped: celebrity has no images in images/'
            : 'SI video assembly skipped: multi_image requires at least one image in images/',
      };
    }

    if (!destination.backgroundFootageSources?.length) {
      console.warn(
        `[reup-video] SI video assembly skipped: channel ${destination.id} has no backgroundFootageSources`,
      );
      return {
        ready: false,
        reason: 'SI video assembly skipped: no backgroundFootageSources configured on channel',
      };
    }

    return { ready: true };
  },

  async assemble(ctx: AssembleContext, assets) {
    const { destination, workDir, log, outputBasename } = ctx;
    const backgroundImage = resolveBackgroundImageMode(destination);
    const needsCenterImage = backgroundImage === 'one_image';
    const needsMultiImage = backgroundImage === 'multi_image' || backgroundImage === 'celebrity';
    const multiImagePaths = needsMultiImage ? await listSiMultiImagePaths(workDir) : [];

    ctx.beginRenderPhase?.();
    log.info(
      needsMultiImage
        ? `Assembling SI video (stock + ${backgroundImage === 'celebrity' ? 'celebrity' : 'multi-image'} slideshow ${multiImagePaths.length} images + subtitles)...`
        : needsCenterImage
          ? 'Assembling SI video (stock + overlay + subtitles)...'
          : `Assembling SI video (stock + subtitles, backgroundImage=${backgroundImage})...`,
    );

    const outputPath = await assembleReupSiVideo({
      workDir,
      audioPath: ctx.audioPath,
      subtitlePath: ctx.subtitlePath,
      outputBasename,
      ...(needsCenterImage && assets.heroImagePath ? { centerImagePath: assets.heroImagePath } : {}),
      ...(needsMultiImage
        ? {
            centerImagePaths: multiImagePaths,
            centerSlideshowVariant:
              backgroundImage === 'celebrity' ? ('celebrity' as const) : ('multi' as const),
          }
        : {}),
      backgroundFootageSourceIds: destination.backgroundFootageSources,
      language: destination.language,
      captionStyleKey: destination.captionStyleKey,
      showAudioBar: destination.showAudioBar,
      audioBarFile: destination.audioBarFile,
      showSmallVideo: destination.showSmallVideo,
      smallVideoFile: destination.smallVideoFile,
      showSubscribe: destination.showSubscribe,
      subscribeFile: destination.subscribeFile,
      showDisclaim: ctx.showDisclaim,
      disclaimerText: ctx.disclaimerText,
      ...(ctx.channelAvatarPath ? { channelAvatarPath: ctx.channelAvatarPath } : {}),
      onLog: toOnLog(log),
    });

    log.ok(`SI video saved → ${outputBasename}.mp4`);
    return outputPath;
  },
};
