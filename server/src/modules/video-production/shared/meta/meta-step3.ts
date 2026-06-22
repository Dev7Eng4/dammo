import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import { promptsRepository } from '../../../prompts/prompts.repository.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../../../prompts/prompts.types.js';
import type { MetaLlmSession } from './meta-session.js';
import { tryParseMetaStep3Response } from './meta-response.js';
import type { MetaStep1ChunkDigest, MetaStep2StoryBlock, MetaStep3Output, MetaStep3PersistedOutput } from './metadata.types.js';
import { DEFAULT_VISUAL_STYLE, type MetaStep3VisualStylePreset } from './meta-visual-preset.js';

const META_STEP3_KEY = 'step_3';
const MAX_RETRIES = 3;

export type MetaStep3Status = 'started' | 'retry';

export interface MetaStep3Progress {
  attempt: number;
  profileId: string;
  profileName: string;
  status: MetaStep3Status;
}

export interface RunMetaStep3Options {
  outputDir?: string;
  contentTypeHint?: string;
  visualStylePreset?: MetaStep3VisualStylePreset;
  onProgress?: (progress: MetaStep3Progress) => void;
}

export type ExecuteMetaStep3Options = RunMetaStep3Options;

function logValidationFailure(attempt: number, reason: string): void {
  console.warn(`[meta-step3] attempt ${attempt}: validation failed (${reason})`);
}

function formatLogValue(value: unknown, maxLength = 80): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
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

async function persistStep3Output(parsed: MetaStep3Output, videoId: string, language: PromptLanguage, outputDir?: string): Promise<void> {
  if (!outputDir) return;

  const outputPath = path.join(outputDir, 'video-meta.json');
  const output: MetaStep3PersistedOutput = {
    videoId,
    language,
    final_summary: parsed.final_summary,
    metadata: parsed.metadata,
    hero_image_prompt: parsed.hero_image_prompt,
  };
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(
    `[meta-step3] saved: ${outputPath} (title: ${formatLogValue(parsed.metadata.title)}, hero: ${formatLogValue(parsed.hero_image_prompt.prompt)})`,
  );
}

export async function executeMetaStep3(
  session: MetaLlmSession,
  items: MetaStep2StoryBlock[] | MetaStep1ChunkDigest[],
  language: PromptLanguage,
  videoId: string,
  options?: ExecuteMetaStep3Options,
): Promise<MetaStep3Output> {
  if (language !== 'ja') {
    throw new AppError('Metadata step 3 is only supported for Japanese', 400, 'UNSUPPORTED_LANGUAGE');
  }

  if (items.length === 0) {
    throw new AppError('No items provided for metadata step 3', 400, 'INVALID_INPUT');
  }

  const promptKey = resolveStep3PromptKey(language);
  let lastReason = 'unknown error';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    options?.onProgress?.({
      attempt,
      profileId: session.profileId,
      profileName: session.profileName,
      status: attempt === 1 ? 'started' : 'retry',
    });

    try {
      const userPrompt = await executePromptTemplate(language, promptKey, [
        {
          contentTypeHint: options?.contentTypeHint ?? 'auto',
          visualStylePreset: options?.visualStylePreset ?? DEFAULT_VISUAL_STYLE,
          items: JSON.stringify(items, null, 2),
        },
      ]);
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

  throw new AppError(`Metadata step 3 failed after ${MAX_RETRIES} attempts: ${lastReason}`, 502, 'META_STEP3_FAILED');
}

export async function runMetaStep3(
  items: MetaStep2StoryBlock[] | MetaStep1ChunkDigest[],
  language: PromptLanguage,
  videoId: string,
  options?: RunMetaStep3Options,
): Promise<MetaStep3Output> {
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  console.log(`[meta-step3] Mở Chrome profile ${profile.name} cho final package...`);

  try {
    await llmBrowserService.open(profile.id, provider);

    return await executeMetaStep3({ profileId: profile.id, profileName: profile.name, provider }, items, language, videoId, options);
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}
