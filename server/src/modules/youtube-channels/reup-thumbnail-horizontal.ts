import { AppError } from '../../shared/http/errors.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../prompts/prompts.file-store.js';
import { promptsRepository } from '../prompts/prompts.repository.js';
import { promptsSettingsService } from '../prompts/prompts-settings.service.js';
import type { MetaLlmSession } from './reup-meta-session.js';
import type { MetaStep3Output } from './reup-metadata.types.js';
import {
  tryParseThumbnailHorizontalStep1Response,
  tryParseThumbnailHorizontalStep2Response,
  tryParseThumbnailHorizontalStep3Response,
} from './reup-thumbnail-response.js';
import type {
  RunThumbnailHorizontalOptions,
  ThumbnailHorizontalOutput,
  ThumbnailHorizontalPlan,
  ThumbnailHorizontalStep,
  ThumbnailHorizontalStep3Output,
} from './reup-thumbnail.types.js';

const THUMBNAIL_STEP_KEYS: Record<ThumbnailHorizontalStep, string> = {
  1: 'ja_thumbnail_horizontal_step_1',
  2: 'ja_thumbnail_horizontal_step_2',
  3: 'ja_thumbnail_horizontal_step_3',
};

const MAX_RETRIES = 3;

function logValidationFailure(step: ThumbnailHorizontalStep, attempt: number, reason: string): void {
  console.warn(`[thumbnail-horizontal] step ${step} attempt ${attempt}: validation failed (${reason})`);
}

function resolveThumbnailPromptKey(step: ThumbnailHorizontalStep): string {
  const key = THUMBNAIL_STEP_KEYS[step];
  const prompt = promptsRepository
    .findAll()
    .find(item => item.category === 'thumbnail' && item.language === 'ja' && item.key === key);

  if (!prompt) {
    throw new AppError(`Thumbnail horizontal step ${step} prompt not found`, 404, 'PROMPT_NOT_FOUND');
  }

  return prompt.key;
}

async function runStepWithRetry<T>(
  session: MetaLlmSession,
  step: ThumbnailHorizontalStep,
  buildPrompt: () => Promise<string>,
  parse: (response: Awaited<ReturnType<typeof llmBrowserService.chat>>) => T | null,
  options?: RunThumbnailHorizontalOptions,
): Promise<T> {
  let lastReason = 'unknown error';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    options?.onProgress?.({
      step,
      attempt,
      profileId: session.profileId,
      profileName: session.profileName,
      status: attempt === 1 ? 'started' : 'retry',
    });

    try {
      const userPrompt = await buildPrompt();
      if (!userPrompt.trim()) {
        throw new AppError(`Empty prompt for thumbnail step ${step}`, 500, 'PROMPT_EMPTY');
      }

      const response = await llmBrowserService.chat(session.profileId, session.provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'direct',
      });

      const parsed = parse(response);
      if (parsed) {
        console.log(`[thumbnail-horizontal] step ${step} done (${THUMBNAIL_STEP_KEYS[step]})`);
        return parsed;
      }

      lastReason = 'invalid JSON or schema mismatch';
      logValidationFailure(step, attempt, lastReason);
    } catch (err) {
      lastReason = err instanceof Error ? err.message : 'unknown error';
      logValidationFailure(step, attempt, lastReason);
    }
  }

  throw new AppError(`Thumbnail horizontal step ${step} failed after ${MAX_RETRIES} attempts: ${lastReason}`, 502, 'THUMBNAIL_HORIZONTAL_FAILED');
}

function buildThumbnailPlan(step3: ThumbnailHorizontalStep3Output): ThumbnailHorizontalPlan {
  return {
    thumbnailCopy: step3.thumbnail_copy,
    colorStrategy: step3.color_strategy,
    visualPrompt: step3.visual_prompt,
    negativePrompt: step3.negative_prompt,
  };
}

export async function executeThumbnailHorizontal(
  session: MetaLlmSession,
  metaStep3: MetaStep3Output,
  options?: RunThumbnailHorizontalOptions,
): Promise<ThumbnailHorizontalOutput> {
  const title = typeof metaStep3.metadata.title === 'string' ? metaStep3.metadata.title.trim() : '';
  const summary =
    typeof metaStep3.final_summary.overview === 'string' ? metaStep3.final_summary.overview.trim() : '';

  if (!title) {
    throw new AppError('Metadata step 3 title is empty', 400, 'INVALID_INPUT');
  }
  if (!summary) {
    throw new AppError('Metadata step 3 final_summary.overview is empty', 400, 'INVALID_INPUT');
  }

  const step1 = await runStepWithRetry(
    session,
    1,
    () => executePromptTemplate('ja', resolveThumbnailPromptKey(1), [title, summary]),
    tryParseThumbnailHorizontalStep1Response,
    options,
  );

  const step1Json = JSON.stringify(step1, null, 2);

  const step2 = await runStepWithRetry(
    session,
    2,
    () => executePromptTemplate('ja', resolveThumbnailPromptKey(2), [step1Json]),
    tryParseThumbnailHorizontalStep2Response,
    options,
  );

  const step2Json = JSON.stringify(step2, null, 2);

  const step3 = await runStepWithRetry(
    session,
    3,
    () => executePromptTemplate('ja', resolveThumbnailPromptKey(3), [step1Json, step2Json]),
    tryParseThumbnailHorizontalStep3Response,
    options,
  );

  return { step1, step2, step3, plan: buildThumbnailPlan(step3) };
}

export async function runThumbnailHorizontal(
  metaStep3: MetaStep3Output,
  options?: RunThumbnailHorizontalOptions,
): Promise<ThumbnailHorizontalOutput> {
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  console.log(`[thumbnail-horizontal] Mở Chrome profile ${profile.name} cho 3 bước thumbnail...`);

  try {
    await llmBrowserService.open(profile.id, provider);

    return await executeThumbnailHorizontal({ profileId: profile.id, profileName: profile.name, provider }, metaStep3, options);
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
