import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../../chrome-profiles/chrome-profiles.types.js';
import { flowBrowserService } from '../../../llm-browser/flow-browser.service.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import type { ChannelLanguage } from '../../../youtube-channels/channel-language.js';
import type { FlowProfileOptions, HeroImageProgress } from './hero-image.js';

const MAX_RETRIES = 3;
const DEFAULT_PROMPT_KEY = 'thumbnail_default';
const OLD_THUMBNAIL_FILENAME = 'old-thumbnail.jpg';
const THUMBNAIL_FILENAME = 'thumbnail.jpg';

export interface RunDefaultFlowThumbnailOptions extends FlowProfileOptions {
  referenceImagePath?: string;
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

function logValidationFailure(attempt: number, reason: string): void {
  console.warn(`[default-flow-thumbnail] attempt ${attempt}: generation failed (${reason})`);
}

export async function runDefaultFlowThumbnail(
  workDir: string,
  language: ChannelLanguage,
  options?: RunDefaultFlowThumbnailOptions
): Promise<DefaultFlowThumbnailResult> {
  const referenceImagePath = options?.referenceImagePath ?? path.join(workDir, OLD_THUMBNAIL_FILENAME);

  try {
    await fs.access(referenceImagePath);
  } catch {
    throw new AppError(`Reference thumbnail not found: ${referenceImagePath}`, 400, 'INVALID_INPUT');
  }

  const promptUsed = await executePromptTemplate(language, DEFAULT_PROMPT_KEY, []);
  if (!promptUsed.trim()) {
    throw new AppError(`Empty prompt for thumbnail style ${DEFAULT_PROMPT_KEY}`, 500, 'PROMPT_EMPTY');
  }

  const profile = resolveFlowProfile(options);
  const debugScreenshotPath = path.join(workDir, 'flow-debug.png');

  console.log(`[default-flow-thumbnail] Mở Chrome main profile ${profile.name} cho style ${DEFAULT_PROMPT_KEY}...`);

  let lastReason = 'unknown error';

  try {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      options?.onProgress?.({
        attempt,
        profileId: profile.id,
        profileName: profile.name,
        status: attempt === 1 ? 'started' : 'retry',
      });

      try {
        const response = await flowBrowserService.generateImage(profile.id, promptUsed, {
          outputDir: workDir,
          fileName: THUMBNAIL_FILENAME,
          referenceImagePath,
          debugScreenshotPath,
          timeoutMs: 300_000,
        });

        const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
        if (!savedPath) {
          lastReason = 'Flow completed but no local image path returned';
          logValidationFailure(attempt, lastReason);
          continue;
        }

        console.log(`[default-flow-thumbnail] saved: ${savedPath} (${response.elapsedMs}ms)`);
        return { thumbnailPath: savedPath, promptUsed };
      } catch (err) {
        lastReason = err instanceof Error ? err.message : 'unknown error';
        logValidationFailure(attempt, lastReason);
      }
    }

    throw new AppError(`Default flow thumbnail failed after ${MAX_RETRIES} attempts: ${lastReason}`, 502, 'DEFAULT_FLOW_THUMBNAIL_FAILED');
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
