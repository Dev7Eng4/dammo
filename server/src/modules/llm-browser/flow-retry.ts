import {
  FLOW_CONFIG,
  FLOW_MAX_RETRIES,
  FLOW_RETRY_BASE_DELAY_MS,
  FLOW_RETRY_RATE_LIMIT_DELAY_MS,
} from '../../infrastructure/llm-browser/flow.config.js';
import type { FlowGenerateImageOptions, LlmBrowserResponse } from '../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../shared/http/errors.js';
import { flowBrowserService } from './flow-browser.service.js';

export { FLOW_MAX_RETRIES };

export type FlowRetryStatus = 'started' | 'retry';

export interface FlowRetryProgress {
  attempt: number;
  profileId: string;
  profileName: string;
  status: FlowRetryStatus;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getFlowRetryDelayMs(attempt: number, lastError?: unknown): number {
  const isRateLimited =
    lastError instanceof AppError && lastError.code === 'FLOW_API_RATE_LIMITED';

  if (isRateLimited) {
    return FLOW_RETRY_RATE_LIMIT_DELAY_MS * attempt;
  }

  return FLOW_RETRY_BASE_DELAY_MS * attempt;
}

export interface RunWithFlowRetriesOptions {
  profileId: string;
  profileName: string;
  prompt: string;
  generateOptions?: Omit<FlowGenerateImageOptions, 'timeoutMs'>;
  logPrefix?: string;
  failureCode?: string;
  buildFailureMessage?: (lastReason: string, maxRetries: number) => string;
  onProgress?: (progress: FlowRetryProgress) => void;
  onAttemptFailure?: (attempt: number, reason: string) => void;
}

export interface FlowRetrySuccess {
  response: LlmBrowserResponse;
  savedPath: string;
}

export async function runWithFlowRetries(options: RunWithFlowRetriesOptions): Promise<FlowRetrySuccess> {
  const {
    profileId,
    profileName,
    prompt,
    generateOptions,
    logPrefix = '[flow-retry]',
    failureCode = 'FLOW_IMAGE_FAILED',
    buildFailureMessage,
    onProgress,
    onAttemptFailure,
  } = options;

  let lastReason = 'unknown error';
  let lastError: unknown;

  for (let attempt = 1; attempt <= FLOW_MAX_RETRIES; attempt += 1) {
    onProgress?.({
      attempt,
      profileId,
      profileName,
      status: attempt === 1 ? 'started' : 'retry',
    });

    try {
      const response = await flowBrowserService.generateImage(profileId, prompt, {
        ...generateOptions,
        timeoutMs: FLOW_CONFIG.defaultTimeoutMs,
      });

      const savedPath = response.mediaAssets?.find(asset => asset.localPath)?.localPath;
      if (!savedPath) {
        lastReason = 'Flow completed but no local image path returned';
        lastError = undefined;
        onAttemptFailure?.(attempt, lastReason);
        console.warn(`${logPrefix} attempt ${attempt}: ${lastReason}`);
      } else {
        return { response, savedPath };
      }
    } catch (err) {
      lastError = err;
      lastReason = err instanceof Error ? err.message : 'unknown error';
      onAttemptFailure?.(attempt, lastReason);
      console.warn(`${logPrefix} attempt ${attempt}: ${lastReason}`);
    }

    if (attempt < FLOW_MAX_RETRIES) {
      const delayMs = getFlowRetryDelayMs(attempt, lastError);
      console.log(`${logPrefix} waiting ${delayMs}ms before retry...`);
      await sleep(delayMs);
    }
  }

  const message =
    buildFailureMessage?.(lastReason, FLOW_MAX_RETRIES) ??
    `Flow image generation failed after ${FLOW_MAX_RETRIES} attempts: ${lastReason}`;

  throw new AppError(message, 502, failureCode);
}
