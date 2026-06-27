import { resolveMetaMediaSavePath } from '../../infrastructure/llm-browser/meta-media.js';
import { getMetaBrowserHandler } from '../../infrastructure/llm-browser/llm-browser.registry.js';
import {
  getLlmBrowserSession,
  setLlmBrowserSessionStatus,
  upsertLlmBrowserSession,
} from '../../infrastructure/llm-browser/llm-browser.session.js';
import type {
  LlmBrowserResponse,
  LlmBrowserSession,
  MetaGenerateMediaOptions,
} from '../../infrastructure/llm-browser/llm-browser.types.js';
import { AppError } from '../../shared/http/errors.js';
import { getChromeProfilePage, isChromeProfileOpen, openChromeProfile } from '../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';

const META_PROVIDER = 'meta' as const;

function assertProfileOpen(profileId: string): void {
  if (!isChromeProfileOpen(profileId)) {
    throw new AppError('Chrome profile is not open', 409, 'PROFILE_NOT_OPEN');
  }
}

function assertMetaSession(profileId: string): LlmBrowserSession {
  const session = getLlmBrowserSession(profileId, META_PROVIDER);
  if (!session) {
    throw new AppError('Meta browser session is not open', 409, 'LLM_SESSION_NOT_OPEN');
  }
  return session;
}

function resolveMediaKind(options?: MetaGenerateMediaOptions): 'image' | 'video' | 'auto' {
  return options?.mediaKind ?? 'auto';
}

export class MetaBrowserService {
  async open(profileId: string): Promise<LlmBrowserSession> {
    const profile = chromeProfilesService.getById(profileId);
    const handler = getMetaBrowserHandler();

    await openChromeProfile(profile.id, profile.userDataDir);
    const page = await getChromeProfilePage(profile.id);
    await handler.open(page);

    return upsertLlmBrowserSession(profileId, META_PROVIDER);
  }

  async generateMedia(
    profileId: string,
    prompt: string,
    options?: MetaGenerateMediaOptions,
  ): Promise<LlmBrowserResponse> {
    if (!getLlmBrowserSession(profileId, META_PROVIDER)) {
      await this.open(profileId);
    }

    assertProfileOpen(profileId);
    assertMetaSession(profileId);

    const handler = getMetaBrowserHandler();
    const page = await getChromeProfilePage(profileId);
    const mediaKind = resolveMediaKind(options);
    const resolvedKind = mediaKind === 'auto' ? 'image' : mediaKind;
    const timeoutMs = options?.timeoutMs ?? 300_000;
    const outputPath = resolveMetaMediaSavePath(resolvedKind, options);

    setLlmBrowserSessionStatus(profileId, META_PROVIDER, 'sending');

    try {
      await handler.sendPrompt(page, prompt, {
        pasteStrategy: options?.pasteStrategy ?? 'insertText',
        submitWith: 'enter',
      });
      setLlmBrowserSessionStatus(profileId, META_PROVIDER, 'waiting');

      const response = await handler.receiveResponse(page, {
        mediaKind,
        outputPath,
        debugScreenshotPath: options?.debugScreenshotPath,
        timeoutMs,
        stableMs: options?.stableMs,
      });

      setLlmBrowserSessionStatus(profileId, META_PROVIDER, 'idle');
      return response;
    } catch (err) {
      setLlmBrowserSessionStatus(profileId, META_PROVIDER, 'idle');
      throw err;
    }
  }
}

export const metaBrowserService = new MetaBrowserService();
