import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../../chrome-profiles/chrome-profiles.types.js';
import { FLOW_MAX_RETRIES, runWithFlowRetries } from '../../../llm-browser/flow-retry.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import type { ChannelLanguage } from '../../../youtube-channels/channel-language.js';
import type { FlowProfileOptions, HeroImageProgress } from './hero-image.js';

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

function resolveFlowProfile(options?: FlowProfileOptions): ChromeProfile {
  if (options?.profileId) {
    const profile = chromeProfilesService.getById(options.profileId);
    if (profile.role !== 'main') {
      throw new AppError('Google Flow requires the main Chrome profile', 400, 'MAIN_PROFILE_REQUIRED');
    }
    return profile;
  }
  return chromeProfilesService.requireMainProfile();
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

  const profile = resolveFlowProfile(options);
  const debugScreenshotPath = path.join(workDir, 'flow-debug.png');

  console.log(`[default-flow-thumbnail] Mở Chrome main profile ${profile.name} cho style ${promptKey}...`);

  try {
    const { savedPath, response } = await runWithFlowRetries({
      profileId: profile.id,
      profileName: profile.name,
      prompt: promptUsed,
      logPrefix: '[default-flow-thumbnail]',
      failureCode: 'DEFAULT_FLOW_THUMBNAIL_FAILED',
      buildFailureMessage: reason => `Default flow thumbnail failed after ${FLOW_MAX_RETRIES} attempts: ${reason}`,
      generateOptions: {
        outputDir: workDir,
        fileName: THUMBNAIL_FILENAME,
        referenceImagePaths: flowReferenceImagePaths,
        debugScreenshotPath,
      },
      onProgress: options?.onProgress,
      onAttemptFailure: (attempt, reason) => {
        console.warn(`[default-flow-thumbnail] attempt ${attempt}: generation failed (${reason})`);
      },
    });

    console.log(`[default-flow-thumbnail] saved: ${savedPath} (${response.elapsedMs}ms)`);
    return { thumbnailPath: savedPath, promptUsed };
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
