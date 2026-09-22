import { AppError } from '../../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../../../../prompts/prompts.file-store.js';
import { promptsRepository } from '../../../../prompts/prompts.repository.js';
import { promptsSettingsService } from '../../../../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../../../../prompts/prompts.types.js';
import type { MetaLlmSession } from '../meta-session.js';
import type { MetadataLlmOutput } from '../metadata.types.js';
import {
  parseCelebrityWisdomStep1Response,
  parseCelebrityWisdomStep2Response,
} from './celebrity-wisdom-response.js';
import { formatParseFailureReason, type LlmParseResult } from '../llm-parse-result.js';
import { persistLlmParseFailure } from '../persist-llm-failure.js';

const MAX_RETRIES = 3;
const PROMPT_BASE = 'metadata_loi_day_nguoi_noi_tieng';

export type CelebrityWisdomMetadataStep = 1 | 2;
export type CelebrityWisdomMetadataStatus = 'started' | 'retry';

export interface CelebrityWisdomMetadataProgress {
  step: CelebrityWisdomMetadataStep;
  attempt: number;
  profileId: string;
  profileName: string;
  status: CelebrityWisdomMetadataStatus;
}

export interface RunCelebrityWisdomStepOptions {
  onProgress?: (progress: CelebrityWisdomMetadataProgress) => void;
  outputDir?: string;
}

export function resolveCelebrityWisdomStepKey(
  language: PromptLanguage,
  step: CelebrityWisdomMetadataStep,
): string {
  const key = `${PROMPT_BASE}_step_${step}`;
  const prompt = promptsRepository
    .findAll()
    .find(item => item.category === 'meta' && item.language === language && item.key === key);

  if (!prompt) {
    throw new AppError(
      `Celebrity wisdom metadata step ${step} prompt not found (${key})`,
      404,
      'PROMPT_NOT_FOUND',
    );
  }

  return prompt.key;
}

/** Render step-1 template with empty title+transcript to measure fixed prompt shell size. */
export async function measureCelebrityWisdomStep1PromptShellLength(
  language: PromptLanguage,
  step1Key: string,
): Promise<number> {
  const shell = await executePromptTemplate(language, step1Key, ['', '']);
  return shell.length;
}

function logValidationFailure(step: CelebrityWisdomMetadataStep, attempt: number, reason: string): void {
  console.warn(`[celebrity-wisdom-metadata] step ${step} attempt ${attempt}: validation failed (${reason})`);
}

async function runCelebrityWisdomLlmStep<T>(
  session: MetaLlmSession,
  language: PromptLanguage,
  step: CelebrityWisdomMetadataStep,
  buildPrompt: () => Promise<string>,
  parse: (response: Awaited<ReturnType<typeof llmBrowserService.chat>>) => LlmParseResult<T>,
  options?: RunCelebrityWisdomStepOptions,
): Promise<T> {
  let lastReason = 'unknown error';
  let lastDetails: Record<string, unknown> | undefined;
  const stepKey = resolveCelebrityWisdomStepKey(language, step);

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
        throw new AppError(
          `Empty prompt for celebrity wisdom metadata step ${step}`,
          500,
          'PROMPT_EMPTY',
        );
      }

      const response = await llmBrowserService.chat(session.profileId, session.provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'human',
      });

      const parsed = parse(response);
      if (parsed.ok) {
        console.log(`[celebrity-wisdom-metadata] step ${step} done (${stepKey})`);
        return parsed.value;
      }

      lastReason = formatParseFailureReason(parsed);
      const responsePath = await persistLlmParseFailure({
        outputDir: options?.outputDir,
        label: `celebrity-wisdom-step-${step}`,
        attempt,
        reason: lastReason,
        response,
      });
      lastDetails = {
        step,
        attempt,
        reason: parsed.reason,
        ...(parsed.missingFields?.length ? { missingFields: parsed.missingFields } : {}),
        ...(parsed.snippet ? { snippet: parsed.snippet } : {}),
        ...(responsePath ? { responsePath } : {}),
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
    `Celebrity wisdom metadata step ${step} failed after ${MAX_RETRIES} attempts: ${lastReason}`,
    502,
    'CELEBRITY_WISDOM_METADATA_FAILED',
    lastDetails ?? { step, reason: lastReason },
  );
}

/** Step 1: content analysis from title + truncated transcript. */
export async function runCelebrityWisdomStep1(
  session: MetaLlmSession,
  language: PromptLanguage,
  title: string,
  transcript: string,
  options?: RunCelebrityWisdomStepOptions,
): Promise<Record<string, unknown>> {
  return runCelebrityWisdomLlmStep(
    session,
    language,
    1,
    () =>
      executePromptTemplate(language, resolveCelebrityWisdomStepKey(language, 1), [title, transcript]),
    parseCelebrityWisdomStep1Response,
    options,
  );
}

/** Step 2: metadata + thumbnail.prompt from step-1 JSON (no imageStyle). */
export async function runCelebrityWisdomStep2(
  session: MetaLlmSession,
  language: PromptLanguage,
  sourceTitle: string,
  extractedJson: Record<string, unknown>,
  options?: RunCelebrityWisdomStepOptions,
): Promise<MetadataLlmOutput> {
  return runCelebrityWisdomLlmStep(
    session,
    language,
    2,
    () =>
      executePromptTemplate(language, resolveCelebrityWisdomStepKey(language, 2), [
        sourceTitle,
        extractedJson,
      ]),
    parseCelebrityWisdomStep2Response,
    options,
  );
}

/** Open one Chrome sub-profile, run `fn`, then close. */
export async function withCelebrityWisdomLlmSession<T>(
  fn: (session: MetaLlmSession) => Promise<T>,
): Promise<T> {
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  console.log(`[celebrity-wisdom-metadata] open Chrome profile ${profile.name}`);

  try {
    await llmBrowserService.open(profile.id, provider);
    return await fn({ profileId: profile.id, profileName: profile.name, provider });
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
