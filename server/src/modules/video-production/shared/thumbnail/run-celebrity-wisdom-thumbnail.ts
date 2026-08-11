import path from 'node:path';
import { celebrityDir } from '../../../../config/paths.js';
import { AppError } from '../../../../shared/http/errors.js';
import { celebritiesService } from '../../../celebrities/celebrities.service.js';
import {
  runFlowImageGeneration,
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

function pickRandomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
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

  celebritiesService.getById(trimmedCelebrityId);

  const imageMedia = celebritiesService
    .listMedia(trimmedCelebrityId)
    .filter(item => item.kind === 'image');

  if (imageMedia.length === 0) {
    throw new AppError(
      `No celebrity images found for celebrityId "${trimmedCelebrityId}"`,
      400,
      'CELEBRITY_IMAGES_EMPTY',
    );
  }

  const referenceImagePath = path.join(celebrityDir(trimmedCelebrityId), pickRandomItem(imageMedia).name);

  console.log(
    `[celebrity-wisdom-thumbnail] Generating thumbnail with Flow (reference: ${path.basename(referenceImagePath)})...`,
  );

  const flowResult = await runFlowImageGeneration(prompt, workDir, {
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
