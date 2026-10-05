import path from 'node:path';
import { AppError } from '../../../../shared/http/errors.js';
import { pickRandomCelebrityImagePath } from '../celebrity-image.js';
import {
  resolveThumbnailImageProvider,
  runBrowserImageGeneration,
  type FlowProfileOptions,
  type HeroImageProgress,
} from './hero-image.js';

const THUMBNAIL_FILENAME = 'thumbnail.jpg';

export interface RunCelebrityWisdomThumbnailOptions extends FlowProfileOptions {
  onProgress?: (progress: HeroImageProgress) => void;
}

export interface CelebrityWisdomThumbnailResult {
  thumbnailPath: string;
  referenceImagePath: string;
  promptUsed: string;
}

export async function runCelebrityWisdomThumbnail(
  workDir: string,
  celebrityId: string,
  imageGenerationPrompt: string,
  options?: RunCelebrityWisdomThumbnailOptions,
): Promise<CelebrityWisdomThumbnailResult> {
  const trimmedCelebrityId = celebrityId.trim();
  if (!trimmedCelebrityId) {
    throw new AppError('celebrityId is required for celebrity wisdom thumbnail', 400, 'INVALID_INPUT');
  }

  const prompt = imageGenerationPrompt.trim();
  if (!prompt) {
    throw new AppError('image_generation_prompt is required for celebrity wisdom thumbnail', 400, 'INVALID_INPUT');
  }

  const referenceImagePath = pickRandomCelebrityImagePath(trimmedCelebrityId);

  const provider = resolveThumbnailImageProvider();
  console.log(
    `[celebrity-wisdom-thumbnail] Generating thumbnail with ${provider} (reference: ${path.basename(referenceImagePath)})...`,
  );

  const flowResult = await runBrowserImageGeneration(prompt, workDir, {
    fileName: THUMBNAIL_FILENAME,
    referenceImagePaths: [referenceImagePath],
    profileId: options?.profileId,
    onProgress: options?.onProgress,
  });

  return {
    thumbnailPath: flowResult.imagePath,
    referenceImagePath,
    promptUsed: flowResult.promptUsed,
  };
}
