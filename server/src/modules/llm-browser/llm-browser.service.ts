import { getLlmBrowserHandler } from '../../infrastructure/llm-browser/llm-browser.registry.js';
import {
  clearLlmBrowserSessionPendingBaseline,
  getLlmBrowserSession,
  setLlmBrowserSessionStatus,
  upsertLlmBrowserSession,
} from '../../infrastructure/llm-browser/llm-browser.session.js';
import type {
  LlmBrowserProvider,
  LlmBrowserResponse,
  LlmBrowserSession,
  LlmReceiveResponseOptions,
  LlmSendPromptOptions,
  LlmSetupConfig,
} from '../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../shared/http/errors.js';
import { getChromeProfilePage, isChromeProfileOpen, openChromeProfile } from '../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';

function assertProfileOpen(profileId: string): void {
  if (!isChromeProfileOpen(profileId)) {
    throw new AppError('Chrome profile is not open', 409, 'PROFILE_NOT_OPEN');
  }
}

function assertLlmSession(profileId: string, provider: LlmBrowserProvider): LlmBrowserSession {
  const session = getLlmBrowserSession(profileId, provider);
  if (!session) {
    throw new AppError('LLM browser session is not open for this provider', 409, 'LLM_SESSION_NOT_OPEN');
  }
  return session;
}

export class LlmBrowserService {
  async open(profileId: string, provider: LlmBrowserProvider): Promise<LlmBrowserSession> {
    const profile = chromeProfilesService.getById(profileId);
    const handler = getLlmBrowserHandler(provider);

    await openChromeProfile(profile.id, profile.userDataDir);
    const page = await getChromeProfilePage(profile.id);
    await handler.open(page);

    return upsertLlmBrowserSession(profileId, provider);
  }

  async setup(profileId: string, provider: LlmBrowserProvider, config: LlmSetupConfig): Promise<LlmBrowserSession> {
    assertProfileOpen(profileId);
    assertLlmSession(profileId, provider);

    const handler = getLlmBrowserHandler(provider);
    const page = await getChromeProfilePage(profileId);
    await handler.setupConfig(page, config);

    return setLlmBrowserSessionStatus(profileId, provider, 'idle');
  }

  async send(
    profileId: string,
    provider: LlmBrowserProvider,
    prompt: string,
    sendOptions?: LlmSendPromptOptions
  ): Promise<LlmBrowserSession> {
    assertProfileOpen(profileId);
    assertLlmSession(profileId, provider);

    const handler = getLlmBrowserHandler(provider);
    const page = await getChromeProfilePage(profileId);

    setLlmBrowserSessionStatus(profileId, provider, 'sending');
    try {
      console.log('🚀 ~ LlmBrowserService ~ send ~ sendOptions:');
      const { baselineBlockCount } = await handler.sendPrompt(page, prompt, sendOptions);
      console.log('🚀 ~ LlmBrowserService ~ send ~ baselineBlockCount:', baselineBlockCount);
      return setLlmBrowserSessionStatus(profileId, provider, 'waiting', { pendingBaselineBlockCount: baselineBlockCount });
    } catch (err) {
      setLlmBrowserSessionStatus(profileId, provider, 'idle');
      throw err;
    }
  }

  async getResponse(profileId: string, provider: LlmBrowserProvider, options?: LlmReceiveResponseOptions): Promise<LlmBrowserResponse> {
    assertProfileOpen(profileId);
    const session = assertLlmSession(profileId, provider);

    const handler = getLlmBrowserHandler(provider);
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
    provider: LlmBrowserProvider,
    prompt: string,
    config?: LlmSetupConfig,
    options?: LlmReceiveResponseOptions & LlmSendPromptOptions
  ): Promise<LlmBrowserResponse> {
    if (config && (config.mode || config.model)) {
      await this.setup(profileId, provider, config);
    }

    const { submitWith, pasteStrategy, timeoutMs, stableMs } = options ?? {};
    const handler = getLlmBrowserHandler(provider);
    const page = await getChromeProfilePage(profileId);
    await handler.readConversationIfNeeded(page);
    await this.send(profileId, provider, prompt, { submitWith, pasteStrategy });
    const response = await this.getResponse(profileId, provider, { timeoutMs, stableMs });
    return response;
  }
}

export const llmBrowserService = new LlmBrowserService();
