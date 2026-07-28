import { AppError } from '../../../../shared/http/errors.js';
import { promptsRepository } from '../../../prompts/prompts.repository.js';
import type { PromptLanguage } from '../../../prompts/prompts.types.js';
import { thumbnailBackgroundsService } from '../../../youtube-channels/thumbnail-backgrounds.service.js';
import type { ChannelLanguage } from '../../../youtube-channels/channel-language.js';

export interface BuildThumbnailReferenceImagePathsInput {
  promptKey: string;
  language: ChannelLanguage | PromptLanguage;
  oldThumbnailPath?: string;
  channelId: string;
  thumbnailBackgroundFile?: string;
}

export function buildThumbnailReferenceImagePaths(
  input: BuildThumbnailReferenceImagePathsInput,
): string[] {
  const promptKey = input.promptKey.trim();
  if (!promptKey) return [];

  const prompt = promptsRepository.findByKeyWithFallback(promptKey, input.language);
  const refs: string[] = [];

  if (prompt?.useReferenceImage) {
    const oldThumbnailPath = input.oldThumbnailPath?.trim();
    if (!oldThumbnailPath) {
      throw new AppError(
        'Old thumbnail is required when thumbnail prompt uses a reference image',
        400,
        'INVALID_INPUT',
      );
    }
    refs.push(oldThumbnailPath);
  }

  if (prompt?.useChannelBackgroundImage) {
    const backgroundFile = input.thumbnailBackgroundFile?.trim();
    if (!backgroundFile) {
      throw new AppError(
        'Channel thumbnail background image is required when thumbnail prompt uses channel background',
        400,
        'INVALID_INPUT',
      );
    }
    const asset = thumbnailBackgroundsService.getChannelAsset(input.channelId, backgroundFile);
    refs.push(asset.filePath);
  }

  return refs;
}
