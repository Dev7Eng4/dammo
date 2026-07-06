import fs from 'node:fs/promises';
import path from 'node:path';
import { extractTranscriptForMetadata } from '../../../../infrastructure/subtitle/srt-utils.js';
import { AppError } from '../../../../shared/http/errors.js';
import { chromeProfilesService } from '../../../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../../../llm-browser/llm-browser.service.js';
import { executePromptTemplate } from '../../../prompts/prompts.file-store.js';
import { promptsRepository } from '../../../prompts/prompts.repository.js';
import { promptsSettingsService } from '../../../prompts/prompts-settings.service.js';
import type { PromptLanguage } from '../../../prompts/prompts.types.js';
import { tryParseGeneralImageResponse } from '../meta/meta-response.js';
import type { GeneralImageLlmOutput } from '../meta/metadata.types.js';
import { DEFAULT_HERO_IMAGE_FILENAME, runFlowImageGeneration, type HeroImageProgress } from './hero-image.js';

const GENERAL_PROMPT_KEY = 'general';
const MAX_RETRIES = 3;

export type GeneralImagePhase = 'prompt' | 'image';

export interface GeneralImageProgress extends HeroImageProgress {
  phase: GeneralImagePhase;
}

export interface RunGeneralImageOptions {
  onProgress?: (progress: GeneralImageProgress) => void;
}

export interface GeneralImageResult {
  heroImagePath: string;
  promptUsed: string;
}

interface GeneralImageLlmSession {
  profileId: string;
  profileName: string;
  provider: ReturnType<typeof promptsSettingsService.get>['defaultLlmProvider'];
}

function logValidationFailure(attempt: number, reason: string): void {
  console.warn(`[run-general-image] attempt ${attempt}: validation failed (${reason})`);
}

function resolveGeneralPromptKey(language: PromptLanguage): string {
  const prompt = promptsRepository
    .findAll()
    .find(item => item.category === 'image' && item.language === language && item.key === GENERAL_PROMPT_KEY);

  if (!prompt) {
    throw new AppError(`General image prompt not found for language "${language}"`, 404, 'PROMPT_NOT_FOUND');
  }

  return prompt.key;
}

async function persistGeneralImagePrompt(parsed: GeneralImageLlmOutput, workDir: string): Promise<void> {
  const outputPath = path.join(workDir, 'general-image-prompt.json');
  await fs.writeFile(outputPath, JSON.stringify(parsed, null, 2), 'utf8');
  console.log(`[run-general-image] saved: ${outputPath}`);
}

async function executeGeneralImagePrompt(
  session: GeneralImageLlmSession,
  srtPath: string,
  language: PromptLanguage,
  workDir: string,
  options?: RunGeneralImageOptions,
): Promise<string> {
  if (language !== 'ja') {
    throw new AppError('General image prompt generation is only supported for Japanese', 400, 'UNSUPPORTED_LANGUAGE');
  }

  const promptKey = resolveGeneralPromptKey(language);
  const transcript = await extractTranscriptForMetadata(srtPath);
  let lastReason = 'unknown error';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    options?.onProgress?.({
      phase: 'prompt',
      attempt,
      profileId: session.profileId,
      profileName: session.profileName,
      status: attempt === 1 ? 'started' : 'retry',
    });

    try {
      const userPrompt = await executePromptTemplate(language, promptKey, [transcript]);
      const response = await llmBrowserService.chat(session.profileId, session.provider, userPrompt, undefined, {
        submitWith: 'enter',
        pasteStrategy: 'direct',
      });

      const parsed = tryParseGeneralImageResponse(response);
      if (parsed) {
        await persistGeneralImagePrompt(parsed, workDir);
        return parsed.image_prompt;
      }

      lastReason = 'invalid JSON or schema mismatch';
      logValidationFailure(attempt, lastReason);
    } catch (err) {
      lastReason = err instanceof Error ? err.message : 'unknown error';
      logValidationFailure(attempt, lastReason);
    }
  }

  throw new AppError(`General image prompt generation failed after ${MAX_RETRIES} attempts: ${lastReason}`, 502, 'GENERAL_IMAGE_PROMPT_FAILED');
}

export async function runGeneralImage(
  srtPath: string,
  language: PromptLanguage,
  workDir: string,
  options?: RunGeneralImageOptions,
): Promise<GeneralImageResult> {
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();

  console.log(`[run-general-image] Mở Chrome profile ${profile.name} cho general image prompt...`);

  let imagePrompt: string;

  try {
    await llmBrowserService.open(profile.id, provider);
    imagePrompt = await executeGeneralImagePrompt(
      { profileId: profile.id, profileName: profile.name, provider },
      srtPath,
      language,
      workDir,
      options,
    );
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }

  console.log(`[run-general-image] Generating hero image with Google Flow...`);

  const flowResult = await runFlowImageGeneration(imagePrompt, workDir, {
    fileName: DEFAULT_HERO_IMAGE_FILENAME,
    onProgress: progress =>
      options?.onProgress?.({
        phase: 'image',
        ...progress,
      }),
  });

  return {
    heroImagePath: flowResult.imagePath,
    promptUsed: flowResult.promptUsed,
  };
}
