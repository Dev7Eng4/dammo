import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../../config/paths.js';
import { AppError } from '../../shared/http/errors.js';
import { generateId } from '../../shared/id.js';
import type { ImageBrowserProvider, LlmTextProvider } from '../../infrastructure/llm-browser/llm-browser.types.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { flowBrowserService } from '../llm-browser/flow-browser.service.js';
import { llmBrowserService } from '../llm-browser/llm-browser.service.js';
import { resolvePromptOutputType } from '../prompts/prompt-output-type.js';
import { promptsRepository } from '../prompts/prompts.repository.js';
import { promptsSettingsService } from '../prompts/prompts-settings.service.js';
import type { PromptOutputType } from '../prompts/prompts.types.js';
import type { PromptPlaygroundRunBody } from './prompt-playground.schema.js';

export interface PromptPlaygroundRunInput extends PromptPlaygroundRunBody {}

export interface PromptPlaygroundRunResult {
  kind: PromptOutputType;
  content: string;
  imageBase64?: string;
  imageMimeType?: string;
  provider: LlmTextProvider | ImageBrowserProvider;
  profileId: string;
  codeBlocks?: string[];
  elapsedMs: number;
}

function toPlaygroundError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const detail = err instanceof Error ? err.message : 'Unknown error';
  return new AppError(detail, 502, 'PLAYGROUND_FAILED');
}

function resolveOutputType(input: PromptPlaygroundRunInput): PromptOutputType {
  if (input.outputType) return input.outputType;

  if (input.promptId) {
    const prompt = promptsRepository.findById(input.promptId);
    if (prompt) {
      return resolvePromptOutputType(prompt);
    }
  }

  return 'text';
}

function guessImageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function runTextPlayground(
  input: PromptPlaygroundRunInput,
  provider: LlmTextProvider,
): Promise<PromptPlaygroundRunResult> {
  const profile = chromeProfilesService.pickSubProfile();
  const startedAt = Date.now();

  try {
    await llmBrowserService.open(profile.id, provider);
    const response = await llmBrowserService.chat(profile.id, provider, input.userPrompt, undefined, {
      submitWith: 'enter',
    });

    const result: PromptPlaygroundRunResult = {
      kind: 'text',
      content: response.content,
      provider,
      profileId: profile.id,
      codeBlocks: response.codeBlocks,
      elapsedMs: Date.now() - startedAt,
    };

    console.log('[prompt-playground:text]', {
      promptId: input.promptId,
      profileId: profile.id,
      provider,
      elapsedMs: result.elapsedMs,
      contentPreview: result.content.slice(0, 200),
    });

    return result;
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}

async function runImagePlayground(
  input: PromptPlaygroundRunInput,
  imageProvider: ImageBrowserProvider,
): Promise<PromptPlaygroundRunResult> {
  if (imageProvider !== 'flow') {
    throw new AppError(`Unsupported image provider: ${imageProvider}`, 400, 'INVALID_IMAGE_PROVIDER');
  }

  const profile = chromeProfilesService.requireMainProfile();
  const startedAt = Date.now();
  const runDir = path.join(paths.playgroundDir, generateId());
  await fs.mkdir(runDir, { recursive: true });

  try {
    const response = await flowBrowserService.generateImage(profile.id, input.userPrompt, {
      outputDir: runDir,
      fileName: 'output.jpg',
      debugScreenshotPath: path.join(runDir, 'flow-debug.png'),
      timeoutMs: 300_000,
    });

    const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
    if (!savedPath) {
      throw new AppError('Flow completed but no local image path returned', 502, 'PLAYGROUND_FAILED');
    }

    const imageBuffer = await fs.readFile(savedPath);
    const imageMimeType = guessImageMimeType(savedPath);
    const result: PromptPlaygroundRunResult = {
      kind: 'image',
      content: '',
      imageBase64: imageBuffer.toString('base64'),
      imageMimeType,
      provider: imageProvider,
      profileId: profile.id,
      elapsedMs: Date.now() - startedAt,
    };

    console.log('[prompt-playground:image]', {
      promptId: input.promptId,
      profileId: profile.id,
      provider: imageProvider,
      elapsedMs: result.elapsedMs,
      savedPath,
    });

    return result;
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }
}

export class PromptPlaygroundService {
  async run(input: PromptPlaygroundRunInput): Promise<PromptPlaygroundRunResult> {
    const settings = promptsSettingsService.get();
    const outputType = resolveOutputType(input);

    try {
      if (outputType === 'image') {
        const imageProvider = input.imageProvider ?? settings.defaultImageProvider;
        return await runImagePlayground(input, imageProvider);
      }

      const provider = input.provider ?? settings.defaultLlmProvider;
      return await runTextPlayground(input, provider);
    } catch (err) {
      console.error('[prompt-playground] failed', err);
      throw toPlaygroundError(err);
    }
  }
}

export const promptPlaygroundService = new PromptPlaygroundService();
