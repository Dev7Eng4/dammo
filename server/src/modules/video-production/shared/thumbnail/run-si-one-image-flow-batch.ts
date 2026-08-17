import { AppError } from '../../../../shared/http/errors.js';
import {
  resolveThumbnailImageProvider,
  runBrowserImageGenerations,
  DEFAULT_HERO_IMAGE_FILENAME,
  type FlowProfileOptions,
  type HeroImageProgress,
} from './hero-image.js';

const THUMBNAIL_FILENAME = 'thumbnail.jpg';

export interface RunSiOneImageFlowBatchOptions extends FlowProfileOptions {
  onProgress?: (progress: HeroImageProgress) => void;
  onJobProgress?: (jobIndex: number, progress: HeroImageProgress) => void;
}

export interface SiOneImageFlowBatchResult {
  thumbnailPath: string;
  heroImagePath: string;
}

/**
 * Generate thumbnail.jpg + background.jpg via the configured thumbnail provider
 * (open once → two sequential generateImage calls → close once).
 */
export async function runSiOneImageFlowBatch(
  workDir: string,
  imageGenerationPrompt: string,
  videoVisualPrompt: string,
  options?: RunSiOneImageFlowBatchOptions,
): Promise<SiOneImageFlowBatchResult> {
  const thumbnailPrompt = imageGenerationPrompt.trim();
  const backgroundPrompt = videoVisualPrompt.trim();
  const provider = resolveThumbnailImageProvider();

  if (!thumbnailPrompt) {
    throw new AppError(
      'image_generation_prompt is required for SI one_image Flow batch',
      400,
      'INVALID_INPUT',
    );
  }
  if (!backgroundPrompt) {
    throw new AppError(
      'video_visual_prompt is required for SI one_image Flow batch',
      400,
      'INVALID_INPUT',
    );
  }

  console.log(
    `[si-one-image-flow-batch] Generating thumbnail + background via ${provider} (2 jobs, one session)...`,
  );

  const results = await runBrowserImageGenerations(
    workDir,
    [
      {
        prompt: thumbnailPrompt,
        fileName: THUMBNAIL_FILENAME,
        logPrefix: `[si-one-image-flow-batch] thumbnail (${provider})`,
        failureCode: 'SI_ONE_IMAGE_THUMBNAIL_FAILED',
        buildFailureMessage: reason =>
          `SI one_image thumbnail failed via ${provider}: ${reason}`,
      },
      {
        prompt: backgroundPrompt,
        fileName: DEFAULT_HERO_IMAGE_FILENAME,
        logPrefix: `[si-one-image-flow-batch] background (${provider})`,
        failureCode: 'SI_ONE_IMAGE_BACKGROUND_FAILED',
        buildFailureMessage: reason =>
          `SI one_image background failed via ${provider}: ${reason}`,
      },
    ],
    {
      profileId: options?.profileId,
      onProgress: options?.onProgress,
      onJobProgress: options?.onJobProgress,
      provider,
    },
  );

  const thumbnailResult = results[0];
  const backgroundResult = results[1];
  if (!thumbnailResult || !backgroundResult) {
    throw new AppError(
      `SI one_image ${provider} batch returned incomplete results`,
      502,
      'SI_ONE_IMAGE_FLOW_BATCH_INCOMPLETE',
    );
  }

  console.log(
    `[si-one-image-flow-batch] saved → ${thumbnailResult.imagePath}, ${backgroundResult.imagePath}`,
  );

  return {
    thumbnailPath: thumbnailResult.imagePath,
    heroImagePath: backgroundResult.imagePath,
  };
}
