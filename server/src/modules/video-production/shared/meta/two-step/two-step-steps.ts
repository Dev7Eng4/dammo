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
import { persistLlmParseFailure } from '../persist-llm-failure.js';
import type { TwoStepNicheConfig } from './two-step-niche.config.js';
import { parseTwoStepStep1Response, parseTwoStepStep2Response } from './two-step-response.js';

const MAX_RETRIES = 3;

export type TwoStepMetadataStep = 1 | 2;
export type TwoStepMetadataStatus = 'started' | 'retry';

export interface TwoStepMetadataProgress {
  step: TwoStepMetadataStep;
  attempt: number;
  profileId: string;
  profileName: string;
  status: TwoStepMetadataStatus;
}

export interface RunTwoStepStepOptions {
  onProgress?: (progress: TwoStepMetadataProgress) => void;
  outputDir?: string;
}

function resolveTwoStepKey(
  language: PromptLanguage,
  config: TwoStepNicheConfig,
  step: TwoStepMetadataStep,
): string {
  const key = `${config.promptBaseKey}_step_${step}`;
  const prompt = promptsRepository
    .findAll()
    .find(item => item.category === 'meta' && item.language === language && item.key === key);

  if (!prompt) {
    throw new AppError(
      `${config.logLabel} metadata step ${step} prompt not found (${key})`,
      404,
      'PROMPT_NOT_FOUND',
    );
  }

  return prompt.key;
}

function logValidationFailure(
  logLabel: string,
  step: TwoStepMetadataStep,
  attempt: number,
  reason: string,
): void {
  console.warn(`[${logLabel}-metadata] step ${step} attempt ${attempt}: validation failed (${reason})`);
}

async function runTwoStepLlmStep<T>(
  session: MetaLlmSession,
  language: PromptLanguage,
  config: TwoStepNicheConfig,
  step: TwoStepMetadataStep,
  buildPrompt: () => Promise<string>,
  parse: (response: Awaited<ReturnType<typeof llmBrowserService.chat>>) => LlmParseResult<T>,
  options?: RunTwoStepStepOptions,
): Promise<T> {
  let lastReason = 'unknown error';
  let lastDetails: Record<string, unknown> | undefined;
  const stepKey = resolveTwoStepKey(language, config, step);
  const logLabel = config.logLabel;

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
        throw new AppError(`Empty prompt for ${logLabel} metadata step ${step}`, 500, 'PROMPT_EMPTY');
      }

      const response = await llmBrowserService.chat(session.profileId, session.provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'human',
      });

      const parsed = parse(response);
      if (parsed.ok) {
        console.log(`[${logLabel}-metadata] step ${step} done (${stepKey})`);
        return parsed.value;
      }

      lastReason = formatParseFailureReason(parsed);
      const responsePath = await persistLlmParseFailure({
        outputDir: options?.outputDir,
        label: `${logLabel}-step-${step}`,
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
      logValidationFailure(logLabel, step, attempt, lastReason);
    } catch (err) {
      lastReason = err instanceof Error ? err.message : 'unknown error';
      lastDetails =
        err instanceof AppError && err.details
          ? { step, attempt, ...err.details }
          : { step, attempt, reason: lastReason };
      logValidationFailure(logLabel, step, attempt, lastReason);
    }
  }

  throw new AppError(
    `${logLabel} metadata step ${step} failed after ${MAX_RETRIES} attempts: ${lastReason}`,
    502,
    'TWO_STEP_METADATA_FAILED',
    lastDetails ?? { step, reason: lastReason },
  );
}

/** Step 1: niche extraction from truncated transcript. */
export async function runTwoStepStep1(
  session: MetaLlmSession,
  language: PromptLanguage,
  config: TwoStepNicheConfig,
  transcript: string,
  options?: RunTwoStepStepOptions,
): Promise<Record<string, unknown>> {
  return runTwoStepLlmStep(
    session,
    language,
    config,
    1,
    () => executePromptTemplate(language, resolveTwoStepKey(language, config, 1), [transcript]),
    parseTwoStepStep1Response,
    options,
  );
}

/** Step 2: metadata + image prompts from step-1 JSON. */
export async function runTwoStepStep2(
  session: MetaLlmSession,
  language: PromptLanguage,
  config: TwoStepNicheConfig,
  sourceTitle: string,
  extractedJson: Record<string, unknown>,
  imageStyle: string,
  options?: RunTwoStepStepOptions,
): Promise<MetadataLlmOutput> {
  return runTwoStepLlmStep(
    session,
    language,
    config,
    2,
    () =>
      executePromptTemplate(language, resolveTwoStepKey(language, config, 2), [
        sourceTitle,
        extractedJson,
        imageStyle,
      ]),
    response => parseTwoStepStep2Response(response, config.requireGeneralBackground),
    options,
  );
}

/** Open one Chrome sub-profile, run `fn`, then close. */
export async function withTwoStepLlmSession<T>(
  config: TwoStepNicheConfig,
  fn: (session: MetaLlmSession) => Promise<T>,
): Promise<T> {
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  console.log(`[${config.logLabel}-metadata] open Chrome profile ${profile.name}`);

  try {
    await llmBrowserService.open(profile.id, provider);
    return await fn({ profileId: profile.id, profileName: profile.name, provider });
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
