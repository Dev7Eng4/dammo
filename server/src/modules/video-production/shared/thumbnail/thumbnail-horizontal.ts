import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../llm-browser/llm-browser.service.js';
import { executePromptSetStepTemplate } from '../../../prompts/prompts.file-store.js';
import { promptsRepository } from '../../../prompts/prompts.repository.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import type { ChannelLanguage } from '../../../youtube-channels/channel-language.js';
import type { MetaLlmSession } from '../meta/meta-session.js';
import type { MetaStep3Output } from '../meta/metadata.types.js';
import {
  tryParseThumbnailHorizontalStep1Response,
  tryParseThumbnailHorizontalStep2Response,
  tryParseThumbnailHorizontalStep3Response,
} from './thumbnail-response.js';
import type {
  RunThumbnailHorizontalOptions,
  ThumbnailHorizontalOutput,
  ThumbnailHorizontalPlan,
  ThumbnailHorizontalStep,
  ThumbnailHorizontalStep3Output,
} from './thumbnail.types.js';

const MAX_RETRIES = 3;

function logValidationFailure(step: ThumbnailHorizontalStep, attempt: number, reason: string): void {
  console.warn(`[thumbnail-horizontal] step ${step} attempt ${attempt}: validation failed (${reason})`);
}

function resolveHorizontalStepKey(
  language: ChannelLanguage,
  styleBaseKey: string,
  step: ThumbnailHorizontalStep,
): { setKey: string; stepOrder: number } {
  const set = promptsRepository.findByKeyAndLanguage(styleBaseKey.trim(), language);
  if (set && set.category === 'thumbnail' && set.steps.length >= step) {
    return { setKey: set.key, stepOrder: step - 1 };
  }

  // Legacy flat keys *_step_N
  const key = `${styleBaseKey.trim()}_step_${step}`;
  const legacy = promptsRepository.findByKeyAndLanguage(key, language);
  if (legacy) {
    return { setKey: legacy.key, stepOrder: 0 };
  }

  throw new AppError(`Thumbnail horizontal step ${step} prompt not found`, 404, 'PROMPT_NOT_FOUND');
}

async function runStepWithRetry<T>(
  session: MetaLlmSession,
  language: ChannelLanguage,
  styleBaseKey: string,
  step: ThumbnailHorizontalStep,
  buildPrompt: () => Promise<string>,
  parse: (response: Awaited<ReturnType<typeof llmBrowserService.chat>>) => T | null,
  options?: RunThumbnailHorizontalOptions,
): Promise<T> {
  let lastReason = 'unknown error';
  const stepKey = resolveHorizontalStepKey(language, styleBaseKey, step);

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
        console.log(`[thumbnail-horizontal] step ${step} done (${stepKey})`);
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
  language: ChannelLanguage,
  styleBaseKey: string,
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

  const step1Ref = resolveHorizontalStepKey(language, styleBaseKey, 1);
  const step1 = await runStepWithRetry(
    session,
    language,
    styleBaseKey,
    1,
    () =>
      executePromptSetStepTemplate(language, step1Ref.setKey, step1Ref.stepOrder, [title, summary]),
    tryParseThumbnailHorizontalStep1Response,
    options,
  );

  const step1Json = JSON.stringify(step1, null, 2);

  const step2Ref = resolveHorizontalStepKey(language, styleBaseKey, 2);
  const step2 = await runStepWithRetry(
    session,
    language,
    styleBaseKey,
    2,
    () => executePromptSetStepTemplate(language, step2Ref.setKey, step2Ref.stepOrder, [step1Json]),
    tryParseThumbnailHorizontalStep2Response,
    options,
  );

  const step2Json = JSON.stringify(step2, null, 2);

  const step3Ref = resolveHorizontalStepKey(language, styleBaseKey, 3);
  const step3 = await runStepWithRetry(
    session,
    language,
    styleBaseKey,
    3,
    () =>
      executePromptSetStepTemplate(language, step3Ref.setKey, step3Ref.stepOrder, [step1Json, step2Json]),
    tryParseThumbnailHorizontalStep3Response,
    options,
  );

  return { step1, step2, step3, plan: buildThumbnailPlan(step3) };
}

export async function runThumbnailHorizontal(
  metaStep3: MetaStep3Output,
  language: ChannelLanguage,
  styleBaseKey: string,
  options?: RunThumbnailHorizontalOptions,
): Promise<ThumbnailHorizontalOutput> {
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  console.log(`[thumbnail-horizontal] Mở Chrome profile ${profile.name} cho 3 bước thumbnail (${styleBaseKey})...`);

  try {
    await llmBrowserService.open(profile.id, provider);

    return await executeThumbnailHorizontal(
      { profileId: profile.id, profileName: profile.name, provider },
      metaStep3,
      language,
      styleBaseKey,
      options,
    );
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
