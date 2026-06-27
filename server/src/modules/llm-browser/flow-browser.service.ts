import { DEFAULT_FLOW_PROJECT_ID } from '../../infrastructure/llm-browser/flow.config.js';
import { beginBatchGenerateImagesWait, resolveFlowImageSavePath } from '../../infrastructure/llm-browser/flow-api-response.js';
import { getFlowBrowserHandler } from '../../infrastructure/llm-browser/llm-browser.registry.js';
import {
  getLlmBrowserSession,
  setLlmBrowserSessionStatus,
  upsertLlmBrowserSession,
} from '../../infrastructure/llm-browser/llm-browser.session.js';
import type {
  FlowGenerateImageOptions,
  FlowOpenOptions,
  LlmBrowserResponse,
  LlmBrowserSession,
} from '../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../shared/http/errors.js';
import { getChromeProfilePage, isChromeProfileOpen, openChromeProfile } from '../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';

const FLOW_PROVIDER = 'flow' as const;

function assertProfileOpen(profileId: string): void {
  if (!isChromeProfileOpen(profileId)) {
    throw new AppError('Chrome profile is not open', 409, 'PROFILE_NOT_OPEN');
  }
}

function assertFlowSession(profileId: string): LlmBrowserSession {
  const session = getLlmBrowserSession(profileId, FLOW_PROVIDER);
  if (!session) {
    throw new AppError('Flow browser session is not open', 409, 'LLM_SESSION_NOT_OPEN');
  }
  return session;
}

export class FlowBrowserService {
  async open(profileId: string, options?: FlowOpenOptions): Promise<LlmBrowserSession> {
    const profile = chromeProfilesService.getById(profileId);
    const handler = getFlowBrowserHandler();

    await openChromeProfile(profile.id, profile.userDataDir, { background: true });
    const page = await getChromeProfilePage(profile.id);
    await handler.open(page, options);

    return upsertLlmBrowserSession(profileId, FLOW_PROVIDER);
  }

  async generateImage(profileId: string, prompt: string, options?: FlowGenerateImageOptions) {
    if (!getLlmBrowserSession(profileId, FLOW_PROVIDER)) {
      await this.open(profileId, {
        projectId: options?.projectId ?? DEFAULT_FLOW_PROJECT_ID,
      });
    }

    assertProfileOpen(profileId);
    assertFlowSession(profileId);

    const handler = getFlowBrowserHandler();
    const page = await getChromeProfilePage(profileId);

    const projectId = options?.projectId ?? DEFAULT_FLOW_PROJECT_ID;
    const timeoutMs = options?.timeoutMs ?? 300_000;
    const outputPath = resolveFlowImageSavePath(options);

    setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'sending');

    try {
      const batchResponsePromise = beginBatchGenerateImagesWait(page, projectId, timeoutMs);

      await handler.sendPrompt(page, prompt, {
        pasteStrategy: options?.pasteStrategy ?? 'insertText',
        submitWith: 'enter',
      });
      setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'waiting');

      const response = await handler.receiveResponse(page, {
        projectId,
        batchResponsePromise,
        outputPath,
        debugScreenshotPath: options?.debugScreenshotPath,
        timeoutMs,
      });

      setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'idle');
      return response;
    } catch (err) {
      setLlmBrowserSessionStatus(profileId, FLOW_PROVIDER, 'idle');
      throw err;
    }
  }
}

export const flowBrowserService = new FlowBrowserService();
