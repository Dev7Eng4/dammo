import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../../shared/http/errors.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import type { ChannelLanguage } from '../../../youtube-channels/channel-language.js';
import {
  runFlowImageGeneration,
  type FlowProfileOptions,
  type HeroImageProgress,
} from './hero-image.js';

const DEFAULT_PROMPT_KEY = 'recreate';
const OLD_THUMBNAIL_FILENAME = 'old-thumbnail.jpg';
const THUMBNAIL_FILENAME = 'thumbnail.jpg';

export interface RunDefaultFlowThumbnailOptions extends FlowProfileOptions {
  promptKey?: string;
  referenceImagePaths?: string[];
  onProgress?: (progress: HeroImageProgress) => void;
}

export interface DefaultFlowThumbnailResult {
  thumbnailPath: string;
  promptUsed: string;
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

/** Copy refs into workDir as ref-1.ext, ref-2.ext, … so Flow attach avoids long Windows paths. */
async function copyReferenceImagesToWorkDir(workDir: string, sourcePaths: string[]): Promise<string[]> {
  await fs.mkdir(workDir, { recursive: true });
  const copied: string[] = [];

  for (let index = 0; index < sourcePaths.length; index += 1) {
    const sourcePath = sourcePaths[index]!;
    const ext = path.extname(sourcePath).toLowerCase() || '.jpg';
    const destPath = path.join(workDir, `ref-${index + 1}${ext}`);
    try {
      await fs.copyFile(sourcePath, destPath);
    } catch (err) {
      throw new AppError(
        `Failed to copy reference image to workDir: ${sourcePath} → ${destPath} (${err instanceof Error ? err.message : String(err)})`,
        500,
        'REFERENCE_IMAGE_COPY_FAILED',
      );
    }
    copied.push(destPath);
  }

  return copied;
}

export async function runDefaultFlowThumbnail(
  workDir: string,
  language: ChannelLanguage,
  options?: RunDefaultFlowThumbnailOptions,
): Promise<DefaultFlowThumbnailResult> {
  const promptKey = options?.promptKey?.trim() || DEFAULT_PROMPT_KEY;
  const referenceImagePaths =
    options?.referenceImagePaths !== undefined
      ? options.referenceImagePaths
      : [path.join(workDir, OLD_THUMBNAIL_FILENAME)];

  await assertReferenceImagesExist(referenceImagePaths);
  const flowReferenceImagePaths = await copyReferenceImagesToWorkDir(workDir, referenceImagePaths);

  const promptUsed = await executePromptTemplate(language, promptKey, []);
  if (!promptUsed.trim()) {
    throw new AppError(`Empty prompt for thumbnail style ${promptKey}`, 500, 'PROMPT_EMPTY');
  }

  console.log(`[default-flow-thumbnail] Generating thumbnail via Flow single (style ${promptKey})...`);

  const flowResult = await runFlowImageGeneration(promptUsed, workDir, {
    fileName: THUMBNAIL_FILENAME,
    referenceImagePaths: flowReferenceImagePaths,
    profileId: options?.profileId,
    onProgress: options?.onProgress,
  });

  return { thumbnailPath: flowResult.imagePath, promptUsed: flowResult.promptUsed };
}
