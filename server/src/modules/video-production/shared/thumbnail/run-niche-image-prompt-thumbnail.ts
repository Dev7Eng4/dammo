import { AppError } from '../../../../shared/http/errors.js';
import {
  resolveThumbnailImageProvider,
  runBrowserImageGeneration,
  type FlowProfileOptions,
  type HeroImageProgress,
} from './hero-image.js';

const THUMBNAIL_FILENAME = 'thumbnail.jpg';

export interface RunNicheImagePromptThumbnailOptions extends FlowProfileOptions {
  onProgress?: (progress: HeroImageProgress) => void;
}

export interface NicheImagePromptThumbnailResult {
  thumbnailPath: string;
  promptUsed: string;
}

/**
 * Generate thumbnail.jpg from metadata `image_generation_prompt` via the
 * configured thumbnail provider, without attaching any reference images
 * (unlike celebrity-wisdom path).
 */
export async function runNicheImagePromptThumbnail(
  workDir: string,
  imageGenerationPrompt: string,
  options?: RunNicheImagePromptThumbnailOptions,
): Promise<NicheImagePromptThumbnailResult> {
  const prompt = imageGenerationPrompt.trim();
  if (!prompt) {
    throw new AppError(
      'image_generation_prompt is required for niche thumbnail',
      400,
      'INVALID_INPUT',
    );
  }

  const provider = resolveThumbnailImageProvider();
  console.log(`[niche-image-prompt-thumbnail] Generating thumbnail with ${provider} (no reference)...`);

  const flowResult = await runBrowserImageGeneration(prompt, workDir, {
    fileName: THUMBNAIL_FILENAME,
    profileId: options?.profileId,
    onProgress: options?.onProgress,
  });

  return {
    thumbnailPath: flowResult.imagePath,
    promptUsed: flowResult.promptUsed,
  };
}
