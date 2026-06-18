import { AppError } from '../../shared/http/errors.js';
import type { LlmBrowserProvider } from '../../infrastructure/llm-browser/llm-browser.types.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { llmBrowserService } from '../llm-browser/llm-browser.service.js';

export interface PromptPlaygroundRunInput {
  provider: LlmBrowserProvider;
  userPrompt: string;
  promptId?: string;
}

export interface PromptPlaygroundRunResult {
  content: string;
  provider: LlmBrowserProvider;
  profileId: string;
  codeBlocks: string[];
  elapsedMs: number;
}

function toPlaygroundError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const detail = err instanceof Error ? err.message : 'Unknown error';
  return new AppError(detail, 502, 'PLAYGROUND_FAILED');
}

export class PromptPlaygroundService {
  async run(input: PromptPlaygroundRunInput): Promise<PromptPlaygroundRunResult> {
    const profile = chromeProfilesService.pickSubProfile();
    const startedAt = Date.now();

    try {
      await llmBrowserService.open(profile.id, input.provider);
      const response = await llmBrowserService.chat(profile.id, input.provider, input.userPrompt, undefined, {
        submitWith: 'enter',
      });

      const result: PromptPlaygroundRunResult = {
        content: response.content,
        provider: input.provider,
        profileId: profile.id,
        codeBlocks: response.codeBlocks,
        elapsedMs: Date.now() - startedAt,
      };

      console.log('[prompt-playground]', {
        promptId: input.promptId,
        profileId: profile.id,
        provider: input.provider,
        elapsedMs: result.elapsedMs,
        contentPreview: result.content.slice(0, 200),
      });

      return result;
    } catch (err) {
      console.error('[prompt-playground] failed', err);
      throw toPlaygroundError(err);
    }
  }
}

export const promptPlaygroundService = new PromptPlaygroundService();
