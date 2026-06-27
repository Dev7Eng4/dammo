import { getLlmTextBrowserHandler } from '../../infrastructure/llm-browser/llm-browser.registry.js';
import type { LlmBrowserResponse } from '../../infrastructure/llm-browser/llm-browser.types.js';
import {
  connectPlaywrightToGpmProfile,
  detachGpmPlaywright,
} from '../../infrastructure/gpm/gpm-playwright.connector.js';
import { AppError } from '../../shared/http/errors.js';

const DEFAULT_TEST_PROMPT = 'Say hello in one short sentence.';

export interface GpmGeminiTestResult extends LlmBrowserResponse {
  profileId: string;
  prompt: string;
}

const activeTests = new Map<string, Promise<GpmGeminiTestResult>>();

export class GpmLlmTestService {
  async testGemini(profileId: string): Promise<GpmGeminiTestResult> {
    const normalizedId = profileId.trim();
    if (!normalizedId) {
      throw new AppError('Profile id is required', 400, 'INVALID_PROFILE_ID');
    }

    const existing = activeTests.get(normalizedId);
    if (existing) {
      throw new AppError('A Gemini test is already running for this profile', 409, 'GPM_TEST_IN_PROGRESS');
    }

    const testPromise = this.runGeminiTest(normalizedId);
    activeTests.set(normalizedId, testPromise);

    try {
      return await testPromise;
    } finally {
      activeTests.delete(normalizedId);
    }
  }

  private async runGeminiTest(profileId: string): Promise<GpmGeminiTestResult> {
    const connection = await connectPlaywrightToGpmProfile(profileId);
    const handler = getLlmTextBrowserHandler('gemini');
    const page = connection.page;

    try {
      await handler.open(page);
      await handler.readConversationIfNeeded(page);

      const sendResult = await handler.sendPrompt(page, DEFAULT_TEST_PROMPT);
      if (!sendResult) {
        throw new AppError('Gemini sendPrompt did not return baselineBlockCount', 500, 'LLM_SEND_FAILED');
      }

      const response = await handler.receiveResponse(page, {
        baselineBlockCount: sendResult.baselineBlockCount,
        timeoutMs: 120_000,
        stableMs: 2_000,
      });

      return {
        profileId: connection.profileId,
        prompt: DEFAULT_TEST_PROMPT,
        ...response,
      };
    } finally {
      await detachGpmPlaywright(connection);
    }
  }
}

export const gpmLlmTestService = new GpmLlmTestService();
