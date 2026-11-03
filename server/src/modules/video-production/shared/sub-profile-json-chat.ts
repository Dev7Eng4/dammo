import { AppError } from '../../../shared/http/errors.js';
import { chromeProfilesService } from '../../chrome-profiles/chrome-profiles.service.js';
import type { LlmBrowserResponse } from '../../llm-browser/core/types.js';
import { llmBrowserService } from '../../llm-browser/text/text.service.js';
import { promptsSettingsService } from '../../prompts/prompts-settings.service.js';
import { extractJsonText } from './meta/llm-parse-result.js';

const LLM_MAX_RETRIES = 3;

export interface SubProfileJsonChatOptions<T> {
  /** Log prefix, e.g. `[mascot-thumbnail]`. */
  logTag: string;
  label: string;
  prompt: string;
  /** Local images uploaded with the prompt, in order. */
  attachments?: string[];
  timeoutMs: number;
  /** Throw to retry; the message is logged and reported when every attempt fails. */
  parse: (jsonText: string) => T;
  log: (msg: string) => void;
  errorCode: string;
}

/** One chat on a sub profile with retries until `parse` accepts the JSON answer. */
export async function chatForJsonOnSubProfile<T>(options: SubProfileJsonChatOptions<T>): Promise<T> {
  const provider = promptsSettingsService.get().defaultLlmProvider;
  const profile = chromeProfilesService.pickSubProfile();
  options.log(
    `${options.logTag} ${options.label} via ${provider} on ${profile.name}` +
      (options.attachments?.length ? ` (${options.attachments.length} image(s) attached)` : '') +
      '...',
  );

  let lastReason = 'unknown error';
  try {
    await llmBrowserService.open(profile.id, provider);
    for (let attempt = 1; attempt <= LLM_MAX_RETRIES; attempt += 1) {
      let response: LlmBrowserResponse;
      try {
        response = await llmBrowserService.chat(profile.id, provider, options.prompt, undefined, {
          submitWith: 'enter',
          timeoutMs: options.timeoutMs,
          ...(options.attachments?.length ? { referenceImagePaths: options.attachments } : {}),
        });
      } catch (err) {
        lastReason = err instanceof Error ? err.message : String(err);
        options.log(`${options.logTag} ${options.label} attempt ${attempt} failed: ${lastReason}`);
        continue;
      }
      try {
        return options.parse(extractJsonText(response));
      } catch (err) {
        lastReason = err instanceof Error ? err.message : String(err);
        options.log(`${options.logTag} ${options.label} attempt ${attempt}: ${lastReason}`);
      }
    }
  } finally {
    await chromeProfilesService.closeSubProfiles([profile.id]);
  }

  throw new AppError(`${options.label} failed after ${LLM_MAX_RETRIES} attempts: ${lastReason}`, 502, options.errorCode);
}
