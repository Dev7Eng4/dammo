import { AppError } from '../../../../shared/http/errors.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import type { ChannelLanguage } from '../../../youtube-channels/channel-language.js';
import type { MetaStep3Output } from '../meta/metadata.types.js';
import {
  runFlowImageGeneration,
  type FlowProfileOptions,
  type HeroImageProgress,
} from './hero-image.js';

const THUMBNAIL_FILENAME = 'thumbnail.jpg';

export interface RunDirectFlowThumbnailOptions extends FlowProfileOptions {
  onProgress?: (progress: HeroImageProgress) => void;
}

export interface DirectFlowThumbnailResult {
  thumbnailPath: string;
  promptUsed: string;
}

function extractMetaInputs(metaStep3: MetaStep3Output): { title: string; summary: string } {
  const title = typeof metaStep3.metadata.title === 'string' ? metaStep3.metadata.title.trim() : '';
  const summary =
    typeof metaStep3.final_summary.overview === 'string' ? metaStep3.final_summary.overview.trim() : '';

  if (!title) {
    throw new AppError('Metadata step 3 title is empty', 400, 'INVALID_INPUT');
  }
  if (!summary) {
    throw new AppError('Metadata step 3 final_summary.overview is empty', 400, 'INVALID_INPUT');
  }

  return { title, summary };
}

export async function runDirectFlowThumbnail(
  metaStep3: MetaStep3Output,
  language: ChannelLanguage,
  promptKey: string,
  outputDir: string,
  options?: RunDirectFlowThumbnailOptions,
): Promise<DirectFlowThumbnailResult> {
  const { title, summary } = extractMetaInputs(metaStep3);
  const promptUsed = await executePromptTemplate(language, promptKey, [title, summary]);

  if (!promptUsed.trim()) {
    throw new AppError(`Empty prompt for thumbnail style ${promptKey}`, 500, 'PROMPT_EMPTY');
  }

  console.log(`[direct-flow-thumbnail] Generating thumbnail via Flow single (style ${promptKey})...`);

  const flowResult = await runFlowImageGeneration(promptUsed, outputDir, {
    fileName: THUMBNAIL_FILENAME,
    profileId: options?.profileId,
    onProgress: options?.onProgress,
  });

  return { thumbnailPath: flowResult.imagePath, promptUsed: flowResult.promptUsed };
}
