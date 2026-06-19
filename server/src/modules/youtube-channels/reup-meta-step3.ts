import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../shared/http/errors.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../prompts/prompts.file-store.js';
import { promptsRepository } from '../prompts/prompts.repository.js';
import { promptsSettingsService } from '../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../prompts/prompts.types.js';
import type { MetaLlmSession } from './reup-meta-session.js';
import { tryParseMetaStep3Response } from './reup-meta-response.js';
import type { MetaStep3Output, MetaStep3PersistedOutput, MetaSynthesisInput } from './reup-metadata.types.js';

const META_STEP3_KEY = 'step_3';
const MAX_RETRIES = 3;

export type MetaStep3Status = 'started' | 'retry';

export interface MetaStep3Progress {
  attempt: number;
  profileId: string;
  profileName: string;
  status: MetaStep3Status;
}

export interface ExecuteMetaStep3Options {
  outputDir?: string;
  onProgress?: (progress: MetaStep3Progress) => void;
}

export type RunMetaStep3Options = ExecuteMetaStep3Options;

function logValidationFailure(attempt: number, reason: string): void {
  console.warn(`[meta-step3] attempt ${attempt}: validation failed (${reason})`);
}

function resolveStep3PromptKey(language: PromptLanguage): string {
  const prompt = promptsRepository
    .findAll()
    .find(item => item.category === 'meta' && item.language === language && item.key === META_STEP3_KEY);

  if (!prompt) {
    throw new AppError(`Metadata step 3 prompt not found for language "${language}"`, 404, 'PROMPT_NOT_FOUND');
  }

  return prompt.key;
}

async function persistStep3Output(
  parsed: MetaStep3Output,
  videoId: string,
  language: PromptLanguage,
  outputDir?: string,
): Promise<void> {
  if (!outputDir) return;

  const outputPath = path.join(outputDir, 'meta.step3.json');
  const output: MetaStep3PersistedOutput = {
    videoId,
    language,
    generatedAt: new Date().toISOString(),
    result: parsed,
  };
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`[meta-step3] saved: ${outputPath} (${parsed.chapters.length} chapters)`);
}

export async function executeMetaStep3(
  session: MetaLlmSession,
  synthesisInput: MetaSynthesisInput,
  language: PromptLanguage,
  videoId: string,
  options?: ExecuteMetaStep3Options,
): Promise<MetaStep3Output> {
  if (language !== 'ja') {
    throw new AppError('Metadata step 3 is only supported for Japanese', 400, 'UNSUPPORTED_LANGUAGE');
  }

  const promptKey = resolveStep3PromptKey(language);
  const synthesisJson = JSON.stringify(synthesisInput, null, 2);
  let lastReason = 'unknown error';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    options?.onProgress?.({
      attempt,
      profileId: session.profileId,
      profileName: session.profileName,
      status: attempt === 1 ? 'started' : 'retry',
    });

    try {
      const userPrompt = await executePromptTemplate(language, promptKey, [synthesisJson]);
      const response = await llmBrowserService.chat(session.profileId, session.provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'direct',
      });

      const parsed = tryParseMetaStep3Response(response, videoId);
      if (parsed) {
        await persistStep3Output(parsed, videoId, language, options?.outputDir);
        return parsed;
      }

      lastReason = 'invalid JSON or schema mismatch';
      logValidationFailure(attempt, lastReason);
    } catch (err) {
      lastReason = err instanceof Error ? err.message : 'unknown error';
      logValidationFailure(attempt, lastReason);
    }
  }

  throw new AppError(
    `Metadata step 3 failed after ${MAX_RETRIES} attempts: ${lastReason}`,
    502,
    'META_STEP3_FAILED',
  );
}

export async function runMetaStep3(
  synthesisInput: MetaSynthesisInput,
  language: PromptLanguage,
  videoId: string,
  options?: RunMetaStep3Options,
): Promise<MetaStep3Output> {
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  console.log(`[meta-step3] Mở Chrome profile ${profile.name} cho global synthesis...`);

  try {
    await llmBrowserService.open(profile.id, provider);

    return executeMetaStep3(
      { profileId: profile.id, profileName: profile.name, provider },
      synthesisInput,
      language,
      videoId,
      options,
    );
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
