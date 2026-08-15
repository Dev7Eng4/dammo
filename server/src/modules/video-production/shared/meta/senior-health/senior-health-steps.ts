import { AppError } from '../../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../../../../prompts/prompts.file-store.js';
import { promptsRepository } from '../../../../prompts/prompts.repository.js';
import { promptsSettingsService } from '../../../../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../../../../prompts/prompts.types.js';
import type { MetaLlmSession } from '../meta-session.js';
import type { MetadataLlmOutput } from '../metadata.types.js';
import { formatParseFailureReason, type LlmParseResult } from '../llm-parse-result.js';
import {
  parseSeniorHealthStep1Response,
  parseSeniorHealthStep2Response,
} from './senior-health-response.js';

const MAX_RETRIES = 3;
const PROMPT_BASE_KEY = 'metadata_dinh_duong_va_phong_sach_song_nguoi_cao_tuoi';

export type SeniorHealthMetadataStep = 1 | 2;
export type SeniorHealthMetadataStatus = 'started' | 'retry';

export interface SeniorHealthMetadataProgress {
  step: SeniorHealthMetadataStep;
  attempt: number;
  profileId: string;
  profileName: string;
  status: SeniorHealthMetadataStatus;
}

export interface RunSeniorHealthStepOptions {
  onProgress?: (progress: SeniorHealthMetadataProgress) => void;
}

function resolveSeniorHealthStepKey(language: PromptLanguage, step: SeniorHealthMetadataStep): string {
  const key = `${PROMPT_BASE_KEY}_step_${step}`;
  const prompt = promptsRepository
    .findAll()
    .find((item) => item.category === 'meta' && item.language === language && item.key === key);

  if (!prompt) {
    throw new AppError(`Senior health metadata step ${step} prompt not found (${key})`, 404, 'PROMPT_NOT_FOUND');
  }

  return prompt.key;
}

function logValidationFailure(step: SeniorHealthMetadataStep, attempt: number, reason: string): void {
  console.warn(`[senior-health-metadata] step ${step} attempt ${attempt}: validation failed (${reason})`);
}

async function runSeniorHealthLlmStep<T>(
  session: MetaLlmSession,
  language: PromptLanguage,
  step: SeniorHealthMetadataStep,
  buildPrompt: () => Promise<string>,
  parse: (response: Awaited<ReturnType<typeof llmBrowserService.chat>>) => LlmParseResult<T>,
  options?: RunSeniorHealthStepOptions,
): Promise<T> {
  let lastReason = 'unknown error';
  let lastDetails: Record<string, unknown> | undefined;
  const stepKey = resolveSeniorHealthStepKey(language, step);

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
        throw new AppError(`Empty prompt for senior health metadata step ${step}`, 500, 'PROMPT_EMPTY');
      }

      const response = await llmBrowserService.chat(session.profileId, session.provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'direct',
      });

      const parsed = parse(response);
      if (parsed.ok) {
        console.log(`[senior-health-metadata] step ${step} done (${stepKey})`);
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
    `Senior health metadata step ${step} failed after ${MAX_RETRIES} attempts: ${lastReason}`,
    502,
    'SENIOR_HEALTH_METADATA_FAILED',
    lastDetails ?? { step, reason: lastReason },
  );
}

/** Step 1: knowledge / visual DNA extraction from truncated transcript. */
export async function runSeniorHealthStep1(
  session: MetaLlmSession,
  language: PromptLanguage,
  transcript: string,
  options?: RunSeniorHealthStepOptions,
): Promise<Record<string, unknown>> {
  return runSeniorHealthLlmStep(
    session,
    language,
    1,
    () => executePromptTemplate(language, resolveSeniorHealthStepKey(language, 1), [transcript]),
    parseSeniorHealthStep1Response,
    options,
  );
}

/** Step 2: metadata + thumbnail prompt from extracted health analysis. */
export async function runSeniorHealthStep2(
  session: MetaLlmSession,
  language: PromptLanguage,
  sourceTitle: string,
  extractedHealthJson: Record<string, unknown>,
  imageStyle: string,
  options?: RunSeniorHealthStepOptions,
): Promise<MetadataLlmOutput> {
  return runSeniorHealthLlmStep(
    session,
    language,
    2,
    () =>
      executePromptTemplate(language, resolveSeniorHealthStepKey(language, 2), [
        sourceTitle,
        extractedHealthJson,
        imageStyle,
      ]),
    parseSeniorHealthStep2Response,
    options,
  );
}

/** Open one Chrome sub-profile, run `fn`, then close. */
export async function withSeniorHealthLlmSession<T>(fn: (session: MetaLlmSession) => Promise<T>): Promise<T> {
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  console.log(`[senior-health-metadata] open Chrome profile ${profile.name}`);

  try {
    await llmBrowserService.open(profile.id, provider);
    return await fn({ profileId: profile.id, profileName: profile.name, provider });
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
