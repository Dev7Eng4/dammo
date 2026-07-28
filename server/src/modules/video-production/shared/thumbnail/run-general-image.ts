import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../../shared/http/errors.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import { promptsRepository } from '../../../prompts/prompts.repository.js';
import type { PromptLanguage } from '../../../prompts/prompts.types.js';
import {
  DEFAULT_HERO_IMAGE_FILENAME,
  runFlowImageGeneration,
  type FlowProfileOptions,
  type HeroImageProgress,
} from './hero-image.js';

const GENERAL_PROMPT_KEY = 'general';
const OLD_THUMBNAIL_FILENAME = 'old-thumbnail.jpg';

export interface RunGeneralImageOptions extends FlowProfileOptions {
  referenceImagePaths?: string[];
  onProgress?: (progress: HeroImageProgress) => void;
  /** PromptSet.key override (from resolvePromptSet) */
  promptKey?: string;
}

export interface GeneralImageResult {
  heroImagePath: string;
  promptUsed: string;
}

function resolveGeneralPromptKey(language: PromptLanguage, overrideKey?: string): string {
  const trimmed = overrideKey?.trim();
  if (trimmed) {
    const byKey = promptsRepository.findByKeyAndLanguage(trimmed, language);
    if (byKey && byKey.category === 'image') {
      return byKey.key;
    }
  }

  const prompt = promptsRepository
    .findAll()
    .find(item => item.category === 'image' && item.language === language && item.key === GENERAL_PROMPT_KEY);

  if (!prompt) {
    throw new AppError(`General image prompt not found for language "${language}"`, 404, 'PROMPT_NOT_FOUND');
  }

  return prompt.key;
}

async function assertReferenceImagesExist(paths: string[]): Promise<void> {
  for (const imagePath of paths) {
    try {
      await fs.access(imagePath);
    } catch {
      throw new AppError(`Reference thumbnail not found: ${imagePath}`, 400, 'INVALID_INPUT');
    }
  }
}

export async function runGeneralImage(
  title: string,
  language: PromptLanguage,
  workDir: string,
  options?: RunGeneralImageOptions,
): Promise<GeneralImageResult> {
  if (language !== 'ja') {
    throw new AppError('General image generation is only supported for Japanese', 400, 'UNSUPPORTED_LANGUAGE');
  }

  const referenceImagePaths =
    options?.referenceImagePaths?.length && options.referenceImagePaths.length > 0
      ? options.referenceImagePaths
      : [path.join(workDir, OLD_THUMBNAIL_FILENAME)];

  await assertReferenceImagesExist(referenceImagePaths);

  const promptKey = resolveGeneralPromptKey(language, options?.promptKey);
  const promptUsed = await executePromptTemplate(language, promptKey, [title]);
  if (!promptUsed.trim()) {
    throw new AppError(`Empty prompt for general image style ${promptKey}`, 500, 'PROMPT_EMPTY');
  }

  console.log(`[run-general-image] Generating hero image with Google Flow (general + reference)...`);

  const flowResult = await runFlowImageGeneration(promptUsed, workDir, {
    fileName: DEFAULT_HERO_IMAGE_FILENAME,
    referenceImagePaths,
    profileId: options?.profileId,
    onProgress: options?.onProgress,
  });

  return {
    heroImagePath: flowResult.imagePath,
    promptUsed: flowResult.promptUsed,
  };
}
