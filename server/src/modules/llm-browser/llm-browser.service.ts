import { getLlmTextBrowserHandler } from '../../infrastructure/llm-browser/llm-browser.registry.js';
import {
  clearLlmBrowserSessionPendingBaseline,
  getLlmBrowserSession,
  setLlmBrowserSessionStatus,
  upsertLlmBrowserSession,
} from '../../infrastructure/llm-browser/llm-browser.session.js';
import type {
  LlmBrowserResponse,
  LlmBrowserSession,
  LlmSendPromptOptions,
  LlmSetupConfig,
  LlmTextChatOptions,
  LlmTextProvider,
  LlmTextReceiveResponseOptions,
} from '../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../shared/http/errors.js';
import { getChromeProfilePage, isChromeProfileOpen, openChromeProfile } from '../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';

function assertProfileOpen(profileId: string): void {
  if (!isChromeProfileOpen(profileId)) {
    throw new AppError('Chrome profile is not open', 409, 'PROFILE_NOT_OPEN');
  }
}

function assertLlmSession(profileId: string, provider: LlmTextProvider): LlmBrowserSession {
  const session = getLlmBrowserSession(profileId, provider);
  if (!session) {
    throw new AppError('LLM browser session is not open for this provider', 409, 'LLM_SESSION_NOT_OPEN');
  }
  return session;
}

export class LlmBrowserService {
  async open(profileId: string, provider: LlmTextProvider): Promise<LlmBrowserSession> {
    const profile = chromeProfilesService.getById(profileId);
    const handler = getLlmTextBrowserHandler(provider);

    await openChromeProfile(profile.id, profile.userDataDir, { background: true });
    const page = await getChromeProfilePage(profile.id);
    await handler.open(page);

    return upsertLlmBrowserSession(profileId, provider);
  }

  async setup(profileId: string, provider: LlmTextProvider, config: LlmSetupConfig): Promise<LlmBrowserSession> {
    assertProfileOpen(profileId);
    assertLlmSession(profileId, provider);

    const handler = getLlmTextBrowserHandler(provider);
    const page = await getChromeProfilePage(profileId);
    await handler.setupConfig(page, config);

    return setLlmBrowserSessionStatus(profileId, provider, 'idle');
  }

  async send(
    profileId: string,
    provider: LlmTextProvider,
    prompt: string,
    sendOptions?: LlmSendPromptOptions,
  ): Promise<LlmBrowserSession> {
    assertProfileOpen(profileId);
    assertLlmSession(profileId, provider);

    const handler = getLlmTextBrowserHandler(provider);
    const page = await getChromeProfilePage(profileId);

    setLlmBrowserSessionStatus(profileId, provider, 'sending');
    try {
      const sendResult = await handler.sendPrompt(page, prompt, sendOptions);
      if (!sendResult) {
        throw new AppError('Text provider sendPrompt must return baselineBlockCount', 500, 'LLM_SEND_FAILED');
      }
      const { baselineBlockCount } = sendResult;
      return setLlmBrowserSessionStatus(profileId, provider, 'waiting', { pendingBaselineBlockCount: baselineBlockCount });
    } catch (err) {
      setLlmBrowserSessionStatus(profileId, provider, 'idle');
      throw err;
    }
  }

  async getResponse(
    profileId: string,
    provider: LlmTextProvider,
    options?: LlmTextReceiveResponseOptions,
  ): Promise<LlmBrowserResponse> {
    assertProfileOpen(profileId);
    const session = assertLlmSession(profileId, provider);

    const handler = getLlmTextBrowserHandler(provider);
    const page = await getChromeProfilePage(profileId);

    try {
      const response = await handler.receiveResponse(page, {
        ...options,
        baselineBlockCount: options?.baselineBlockCount ?? session.pendingBaselineBlockCount,
      });
      clearLlmBrowserSessionPendingBaseline(profileId, provider);
      setLlmBrowserSessionStatus(profileId, provider, 'idle');
      return response;
    } catch (err) {
      clearLlmBrowserSessionPendingBaseline(profileId, provider);
      setLlmBrowserSessionStatus(profileId, provider, 'idle');
      throw err;
    }
  }

  async chat(
    profileId: string,
    provider: LlmTextProvider,
    prompt: string,
    config?: LlmSetupConfig,
    options?: LlmTextChatOptions,
  ): Promise<LlmBrowserResponse> {
    if (!getLlmBrowserSession(profileId, provider)) {
      await this.open(profileId, provider);
    }

    if (config && (config.mode || config.model)) {
      await this.setup(profileId, provider, config);
    }

    const { submitWith, pasteStrategy, timeoutMs, stableMs } = options ?? {};
    const handler = getLlmTextBrowserHandler(provider);
    const page = await getChromeProfilePage(profileId);
    await handler.readConversationIfNeeded(page);
    await this.send(profileId, provider, prompt, { submitWith, pasteStrategy });
    return this.getResponse(profileId, provider, { timeoutMs, stableMs });
  }
}

export const llmBrowserService = new LlmBrowserService();
