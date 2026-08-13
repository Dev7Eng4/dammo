import { AppError } from '../../../../../shared/http/errors.js';
import type { ChromeProfile } from '../../../../chrome-profiles/chrome-profiles.types.js';
import { chromeProfilesService } from '../../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../../../../prompts/prompts.file-store.js';
import { promptsRepository } from '../../../../prompts/prompts.repository.js';
import { promptsSettingsService } from '../../../../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../../../../prompts/prompts.types.js';
import type { MetaLlmSession } from '../meta-session.js';
import type { MetadataLlmOutput } from '../metadata.types.js';
import {
  tryParseDramaStep1Response,
  tryParseDramaStep2Response,
  tryParseDramaStep3Response,
} from './drama-response.js';
import type { DramaTranscriptSegment } from './drama-segments.js';

const MAX_RETRIES = 3;
const MAX_PARALLEL_PROFILES = 7;
const BATCH_DELAY_MS = 2_000;

export type DramaMetadataStep = 1 | 2 | 3;
export type DramaMetadataStatus = 'started' | 'retry';

export interface DramaMetadataProgress {
  step: DramaMetadataStep;
  attempt: number;
  profileId: string;
  profileName: string;
  status: DramaMetadataStatus;
  segmentIndex?: number;
  segmentTotal?: number;
}

export interface RunDramaStepOptions {
  onProgress?: (progress: DramaMetadataProgress) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  parse: (response: Awaited<ReturnType<typeof llmBrowserService.chat>>) => T | null,
  options?: RunDramaStepOptions & {
    segmentIndex?: number;
    segmentTotal?: number;
  },
): Promise<T> {
  let lastReason = 'unknown error';
  const stepKey = resolveDramaStepKey(language, step);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    options?.onProgress?.({
      step,
      attempt,
      profileId: session.profileId,
      profileName: session.profileName,
      status: attempt === 1 ? 'started' : 'retry',
      segmentIndex: options.segmentIndex,
      segmentTotal: options.segmentTotal,
    });

    try {
      const userPrompt = await buildPrompt();
      if (!userPrompt.trim()) {
        throw new AppError(`Empty prompt for drama metadata step ${step}`, 500, 'PROMPT_EMPTY');
      }

      const response = await llmBrowserService.chat(session.profileId, session.provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'direct',
      });

      const parsed = parse(response);
      if (parsed) {
        const segLabel =
          options?.segmentIndex !== undefined && options?.segmentTotal !== undefined
            ? ` seg ${options.segmentIndex + 1}/${options.segmentTotal}`
            : '';
        console.log(`[drama-metadata] step ${step}${segLabel} done (${stepKey})`);
        return parsed;
      }

      lastReason = 'invalid JSON or schema mismatch';
      logValidationFailure(step, attempt, lastReason);
    } catch (err) {
      lastReason = err instanceof Error ? err.message : 'unknown error';
      logValidationFailure(step, attempt, lastReason);
    }
  }

  throw new AppError(
    `Drama metadata step ${step} failed after ${MAX_RETRIES} attempts: ${lastReason}`,
    502,
    'DRAMA_METADATA_FAILED',
  );
}

export async function runDramaStep1(
  session: MetaLlmSession,
  language: PromptLanguage,
  segment: DramaTranscriptSegment,
  segmentTotal: number,
  options?: RunDramaStepOptions,
): Promise<Record<string, unknown>> {
  return runDramaLlmStep(
    session,
    language,
    1,
    () => executePromptTemplate(language, resolveDramaStepKey(language, 1), [segment.text, segment.id]),
    tryParseDramaStep1Response,
    {
      ...options,
      segmentIndex: segment.index,
      segmentTotal,
    },
  );
}

/** Run step 1 for every segment with up to 7 Chrome profiles; results stay in transcript order. */
export async function runDramaStep1Parallel(
  language: PromptLanguage,
  segments: DramaTranscriptSegment[],
  options?: RunDramaStepOptions,
): Promise<Record<string, unknown>[]> {
  if (segments.length === 0) {
    throw new AppError('No drama transcript segments to analyze', 400, 'INVALID_INPUT');
  }

  if (segments.length === 1) {
    const provider = promptsSettingsService.get().defaultLlmProvider;
    const profile = chromeProfilesService.pickSubProfile();
    try {
      await llmBrowserService.open(profile.id, provider);
      return [
        await runDramaStep1(
          { profileId: profile.id, profileName: profile.name, provider },
          language,
          segments[0]!,
          1,
          options,
        ),
      ];
    } finally {
      await chromeProfilesService.closeSubProfiles([profile.id]);
    }
  }

  const provider = promptsSettingsService.get().defaultLlmProvider;
  const workerCount = Math.min(MAX_PARALLEL_PROFILES, segments.length);
  const profiles = chromeProfilesService.pickSubProfiles(workerCount);
  const results: Record<string, unknown>[] = new Array(segments.length);
  let nextIndex = 0;

  console.log(
    `[drama-metadata] parallel step1: ${segments.length} segments on ${workerCount} profiles (${profiles
      .map((p) => p.name)
      .join(', ')})`,
  );

  try {
    async function worker(profile: ChromeProfile): Promise<void> {
      await llmBrowserService.open(profile.id, provider);
      const session: MetaLlmSession = {
        profileId: profile.id,
        profileName: profile.name,
        provider,
      };

      while (true) {
        const index = nextIndex++;
        if (index >= segments.length) break;

        const segment = segments[index]!;
        console.log(
          `[drama-metadata] profile ${profile.name} step1 seg ${index + 1}/${segments.length} (${segment.id})`,
        );

        results[index] = await runDramaStep1(session, language, segment, segments.length, options);

        if (nextIndex < segments.length) {
          await sleep(BATCH_DELAY_MS);
        }
      }
    }

    await Promise.all(profiles.map(worker));
    return results;
  } finally {
    await chromeProfilesService.closeSubProfiles(profiles.map((profile) => profile.id));
  }
}

export async function runDramaStep2(
  session: MetaLlmSession,
  language: PromptLanguage,
  segmentAnalyses: Record<string, unknown>[],
  options?: RunDramaStepOptions,
): Promise<Record<string, unknown>> {
  const payload = JSON.stringify(segmentAnalyses);
  return runDramaLlmStep(
    session,
    language,
    2,
    () => executePromptTemplate(language, resolveDramaStepKey(language, 2), [payload]),
    tryParseDramaStep2Response,
    options,
  );
}

export async function runDramaStep3(
  session: MetaLlmSession,
  language: PromptLanguage,
  sourceTitle: string,
  storyInput: string,
  imageStyle: string,
  options?: RunDramaStepOptions,
): Promise<MetadataLlmOutput> {
  return runDramaLlmStep(
    session,
    language,
    3,
    () =>
      executePromptTemplate(language, resolveDramaStepKey(language, 3), [sourceTitle, storyInput, imageStyle]),
    tryParseDramaStep3Response,
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
