import path from 'node:path';
import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../../chrome-profiles/chrome-profiles.types.js';
import { flowBrowserService } from '../../../llm-browser/flow-browser.service.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import type { ChannelLanguage } from '../../../youtube-channels/channel-language.js';
import type { MetaStep3Output } from '../meta/metadata.types.js';
import type { FlowProfileOptions, HeroImageProgress } from './hero-image.js';

const MAX_RETRIES = 3;
const THUMBNAIL_FILENAME = 'thumbnail.jpg';

export interface RunDirectFlowThumbnailOptions extends FlowProfileOptions {
  onProgress?: (progress: HeroImageProgress) => void;
}

export interface DirectFlowThumbnailResult {
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

function logValidationFailure(attempt: number, reason: string): void {
  console.warn(`[direct-flow-thumbnail] attempt ${attempt}: generation failed (${reason})`);
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

  const profile = resolveFlowProfile(options);
  const debugScreenshotPath = path.join(outputDir, 'flow-debug.png');

  console.log(`[direct-flow-thumbnail] Mở Chrome main profile ${profile.name} cho style ${promptKey}...`);

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
          outputDir,
          fileName: THUMBNAIL_FILENAME,
          debugScreenshotPath,
          timeoutMs: 300_000,
        });

        const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
        if (!savedPath) {
          lastReason = 'Flow completed but no local image path returned';
          logValidationFailure(attempt, lastReason);
          continue;
        }

        console.log(`[direct-flow-thumbnail] saved: ${savedPath} (${response.elapsedMs}ms)`);
        return { thumbnailPath: savedPath, promptUsed };
      } catch (err) {
        lastReason = err instanceof Error ? err.message : 'unknown error';
        logValidationFailure(attempt, lastReason);
      }
    }

    throw new AppError(
      `Direct flow thumbnail failed after ${MAX_RETRIES} attempts: ${lastReason}`,
      502,
      'DIRECT_FLOW_THUMBNAIL_FAILED',
    );
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
