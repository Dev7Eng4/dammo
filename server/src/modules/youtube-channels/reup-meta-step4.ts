import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../shared/http/errors.js';
import { llmBrowserService } from '../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../prompts/prompts.file-store.js';
import { promptsRepository } from '../prompts/prompts.repository.js';
import type { PromptLanguage } from '../prompts/prompts.types.js';
import type { MetaLlmSession } from './reup-meta-session.js';
import { tryParseMetaStep4Response } from './reup-meta-response.js';
import type { MetaStep3LegacyOutput, MetaStep4Output, MetaStep4PersistedOutput } from './reup-metadata.types.js';

const META_STEP4_KEY = 'step_4';
const MAX_RETRIES = 3;

import { DEFAULT_VISUAL_STYLE } from './reup-meta-visual-preset.js';

export type MetaStep4Status = 'started' | 'retry';

export interface MetaStep4Progress {
  attempt: number;
  profileId: string;
  profileName: string;
  status: MetaStep4Status;
}

export interface ExecuteMetaStep4Options {
  outputDir?: string;
  onProgress?: (progress: MetaStep4Progress) => void;
}

function logValidationFailure(attempt: number, reason: string): void {
  console.warn(`[meta-step4] attempt ${attempt}: validation failed (${reason})`);
}

function resolveStep4PromptKey(language: PromptLanguage): string {
  const prompt = promptsRepository
    .findAll()
    .find(item => item.category === 'meta' && item.language === language && item.key === META_STEP4_KEY);

  if (!prompt) {
    throw new AppError(`Metadata step 4 prompt not found for language "${language}"`, 404, 'PROMPT_NOT_FOUND');
  }

  return prompt.key;
}

async function persistStep4Output(
  parsed: MetaStep4Output,
  videoId: string,
  language: PromptLanguage,
  outputDir?: string,
): Promise<void> {
  if (!outputDir) return;

  const outputPath = path.join(outputDir, 'meta.step4.json');
  const output: MetaStep4PersistedOutput = {
    videoId,
    language,
    generatedAt: new Date().toISOString(),
    result: parsed,
  };
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`[meta-step4] saved: ${outputPath}`);
}

export async function executeMetaStep4(
  session: MetaLlmSession,
  step3Output: MetaStep3LegacyOutput,
  language: PromptLanguage,
  videoId: string,
  options?: ExecuteMetaStep4Options,
): Promise<MetaStep4Output> {
  if (language !== 'ja') {
    throw new AppError('Metadata step 4 is only supported for Japanese', 400, 'UNSUPPORTED_LANGUAGE');
  }

  const promptKey = resolveStep4PromptKey(language);
  const finalSynthesisJson = JSON.stringify(step3Output, null, 2);
  let lastReason = 'unknown error';

  console.log(`[meta-step4] profile ${session.profileName} tạo visual bible...`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    options?.onProgress?.({
      attempt,
      profileId: session.profileId,
      profileName: session.profileName,
      status: attempt === 1 ? 'started' : 'retry',
    });

    try {
      const userPrompt = await executePromptTemplate(language, promptKey, [
        finalSynthesisJson,
        DEFAULT_VISUAL_STYLE,
      ]);
      const response = await llmBrowserService.chat(session.profileId, session.provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'direct',
      });

      const parsed = tryParseMetaStep4Response(response, videoId, step3Output);
      if (parsed) {
        await persistStep4Output(parsed, videoId, language, options?.outputDir);
        return parsed;
      }

      lastReason = 'invalid JSON, schema mismatch, or chapter cross-check failed';
      logValidationFailure(attempt, lastReason);
    } catch (err) {
      lastReason = err instanceof Error ? err.message : 'unknown error';
      logValidationFailure(attempt, lastReason);
    }
  }

  throw new AppError(
    `Metadata step 4 failed after ${MAX_RETRIES} attempts: ${lastReason}`,
    502,
    'META_STEP4_FAILED',
  );
}
