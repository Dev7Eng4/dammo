import { AppError } from '../../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../../../../prompts/prompts.file-store.js';
import { promptsRepository } from '../../../../prompts/prompts.repository.js';
import { promptsSettingsService } from '../../../../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../../../../prompts/prompts.types.js';
import type { MetaLlmSession } from '../meta-session.js';
import type { MetadataLlmOutput } from '../metadata.types.js';
import { parseDramaStep1Response, parseDramaStep2Response } from './drama-response.js';
import { formatParseFailureReason, type LlmParseResult } from '../llm-parse-result.js';
import { persistLlmParseFailure } from '../persist-llm-failure.js';

const MAX_RETRIES = 3;

export type DramaMetadataStep = 1 | 2;
export type DramaMetadataStatus = 'started' | 'retry';

export interface DramaMetadataProgress {
  step: DramaMetadataStep;
  attempt: number;
  profileId: string;
  profileName: string;
  status: DramaMetadataStatus;
}

export interface RunDramaStepOptions {
  onProgress?: (progress: DramaMetadataProgress) => void;
  outputDir?: string;
}

function resolveDramaStepKey(language: PromptLanguage, step: DramaMetadataStep): string {
  const key = `metadata_drama_step_${step}`;
  const prompt = promptsRepository
    .findAll()
    .find((item) => item.category === 'meta' && item.language === language && item.key === key);

  if (!prompt) {
    throw new AppError(`Drama metadata step ${step} prompt not found (${key})`, 404, 'PROMPT_NOT_FOUND');
  }

  return prompt.key;
}

function logValidationFailure(step: DramaMetadataStep, attempt: number, reason: string): void {
  console.warn(`[drama-metadata] step ${step} attempt ${attempt}: validation failed (${reason})`);
}

async function runDramaLlmStep<T>(
  session: MetaLlmSession,
  language: PromptLanguage,
  step: DramaMetadataStep,
  buildPrompt: () => Promise<string>,
  parse: (response: Awaited<ReturnType<typeof llmBrowserService.chat>>) => LlmParseResult<T>,
  options?: RunDramaStepOptions,
): Promise<T> {
  let lastReason = 'unknown error';
  let lastDetails: Record<string, unknown> | undefined;
  const stepKey = resolveDramaStepKey(language, step);

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
        throw new AppError(`Empty prompt for drama metadata step ${step}`, 500, 'PROMPT_EMPTY');
      }

      const response = await llmBrowserService.chat(session.profileId, session.provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'human',
      });

      const parsed = parse(response);
      if (parsed.ok) {
        console.log(`[drama-metadata] step ${step} done (${stepKey})`);
        return parsed.value;
      }

      lastReason = formatParseFailureReason(parsed);
      const responsePath = await persistLlmParseFailure({
        outputDir: options?.outputDir,
        label: `drama-step-${step}`,
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
    `Drama metadata step ${step} failed after ${MAX_RETRIES} attempts: ${lastReason}`,
    502,
    'DRAMA_METADATA_FAILED',
    lastDetails ?? { step, reason: lastReason },
  );
}

/** Step 1: narrative extraction from truncated transcript. */
export async function runDramaStep1(
  session: MetaLlmSession,
  language: PromptLanguage,
  transcript: string,
  options?: RunDramaStepOptions,
): Promise<Record<string, unknown>> {
  return runDramaLlmStep(
    session,
    language,
    1,
    () => executePromptTemplate(language, resolveDramaStepKey(language, 1), [transcript]),
    parseDramaStep1Response,
    options,
  );
}

/** Step 2: metadata + thumbnail/background prompts from extracted story. */
export async function runDramaStep2(
  session: MetaLlmSession,
  language: PromptLanguage,
  sourceTitle: string,
  extractedStoryJson: Record<string, unknown>,
  imageStyle: string,
  options?: RunDramaStepOptions,
): Promise<MetadataLlmOutput> {
  return runDramaLlmStep(
    session,
    language,
    2,
    () =>
      executePromptTemplate(language, resolveDramaStepKey(language, 2), [
        sourceTitle,
        extractedStoryJson,
        imageStyle,
      ]),
    parseDramaStep2Response,
    options,
  );
}

/** Open one Chrome sub-profile, run `fn`, then close. */
export async function withDramaLlmSession<T>(fn: (session: MetaLlmSession) => Promise<T>): Promise<T> {
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  console.log(`[drama-metadata] open Chrome profile ${profile.name}`);

  try {
    await llmBrowserService.open(profile.id, provider);
    return await fn({ profileId: profile.id, profileName: profile.name, provider });
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
