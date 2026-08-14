import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import { promptsRepository } from '../../../prompts/prompts.repository.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import type { ChannelLanguage } from '../../../youtube-channels/channel-language.js';
import type { MetaLlmSession } from '../meta/meta-session.js';
import type { MetaStep3Output } from '../meta/metadata.types.js';
import {
  parseThumbnailHorizontalStep1Response,
  parseThumbnailHorizontalStep2Response,
  parseThumbnailHorizontalStep3Response,
} from './thumbnail-response.js';
import type {
  RunThumbnailHorizontalOptions,
  ThumbnailHorizontalOutput,
  ThumbnailHorizontalPlan,
  ThumbnailHorizontalStep,
  ThumbnailHorizontalStep3Output,
} from './thumbnail.types.js';
import { formatParseFailureReason, type LlmParseResult } from '../meta/llm-parse-result.js';

const MAX_RETRIES = 3;

function logValidationFailure(step: ThumbnailHorizontalStep, attempt: number, reason: string): void {
  console.warn(`[thumbnail-horizontal] step ${step} attempt ${attempt}: validation failed (${reason})`);
}

function resolveHorizontalStepKey(
  language: ChannelLanguage,
  styleBaseKey: string,
  step: ThumbnailHorizontalStep,
): string {
  const key = `${styleBaseKey.trim()}_step_${step}`;
  const prompt = promptsRepository
    .findAll()
    .find(item => item.category === 'thumbnail' && item.language === language && item.key === key);

  if (!prompt) {
    throw new AppError(`Thumbnail horizontal step ${step} prompt not found`, 404, 'PROMPT_NOT_FOUND');
  }

  return prompt.key;
}

async function runStepWithRetry<T>(
  session: MetaLlmSession,
  language: ChannelLanguage,
  styleBaseKey: string,
  step: ThumbnailHorizontalStep,
  buildPrompt: () => Promise<string>,
  parse: (response: Awaited<ReturnType<typeof llmBrowserService.chat>>) => LlmParseResult<T>,
  options?: RunThumbnailHorizontalOptions,
): Promise<T> {
  let lastReason = 'unknown error';
  let lastDetails: Record<string, unknown> | undefined;
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
      if (parsed.ok) {
        console.log(`[thumbnail-horizontal] step ${step} done (${stepKey})`);
        return parsed.value;
      }

      lastReason = formatParseFailureReason(parsed);
      lastDetails = {
        step,
        attempt,
        reason: parsed.reason,
        ...(parsed.missingFields?.length ? { missingFields: parsed.missingFields } : {}),
        ...(parsed.snippet ? { snippet: parsed.snippet } : {}),
      };
      logValidationFailure(step, attempt, lastReason);
    } catch (err) {
      lastReason = err instanceof Error ? err.message : 'unknown error';
      lastDetails =
        err instanceof AppError && err.details
          ? { step, attempt, ...err.details }
          : { step, attempt, reason: lastReason };
      logValidationFailure(step, attempt, lastReason);
    }
  }

  throw new AppError(
    `Thumbnail horizontal step ${step} failed after ${MAX_RETRIES} attempts: ${lastReason}`,
    502,
    'THUMBNAIL_HORIZONTAL_FAILED',
    lastDetails ?? { step, reason: lastReason },
  );
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

  const step1 = await runStepWithRetry(
    session,
    language,
    styleBaseKey,
    1,
    () => executePromptTemplate(language, resolveHorizontalStepKey(language, styleBaseKey, 1), [title, summary]),
    parseThumbnailHorizontalStep1Response,
    options,
  );

  const step1Json = JSON.stringify(step1, null, 2);

  const step2 = await runStepWithRetry(
    session,
    language,
    styleBaseKey,
    2,
    () => executePromptTemplate(language, resolveHorizontalStepKey(language, styleBaseKey, 2), [step1Json]),
    parseThumbnailHorizontalStep2Response,
    options,
  );

  const step2Json = JSON.stringify(step2, null, 2);

  const step3 = await runStepWithRetry(
    session,
    language,
    styleBaseKey,
    3,
    () =>
      executePromptTemplate(language, resolveHorizontalStepKey(language, styleBaseKey, 3), [step1Json, step2Json]),
    parseThumbnailHorizontalStep3Response,
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
