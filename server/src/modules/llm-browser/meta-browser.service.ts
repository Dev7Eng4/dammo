import type { Page } from 'playwright';
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

const META_MEDIA_PREFIX: Record<'image' | 'video', string> = {
  image: 'Create image 16:9',
  video: 'Create video 16:9',
};

function prependMetaMediaPrefix(prompt: string, mediaKind: 'image' | 'video' | 'auto'): string {
  const prefix = mediaKind === 'video' ? META_MEDIA_PREFIX.video : META_MEDIA_PREFIX.image;
  const trimmed = prompt.trim();
  if (trimmed.toLowerCase().startsWith(prefix.toLowerCase())) {
    return prompt;
  }
  return `${prefix} ${trimmed}`;
}

export class MetaBrowserService {
  async open(profileId: string): Promise<LlmBrowserSession> {
    const profile = chromeProfilesService.getById(profileId);
    const handler = getMetaBrowserHandler();

    await openChromeProfile(profile.id, profile.userDataDir);
    const page = await getChromeProfilePage(profile.id);
    await handler.open(page);
    await handler.setupConfig(page, {});

    return upsertLlmBrowserSession(profileId, META_PROVIDER);
  }

  async openOnPage(page: Page): Promise<void> {
    const handler = getMetaBrowserHandler();
    await handler.open(page);
    await handler.setupConfig(page, {});
  }

  async generateMedia(profileId: string, prompt: string, options?: MetaGenerateMediaOptions): Promise<LlmBrowserResponse> {
    if (!getLlmBrowserSession(profileId, META_PROVIDER)) {
      await this.open(profileId);
    }

    assertProfileOpen(profileId);
    assertMetaSession(profileId);

    const page = await getChromeProfilePage(profileId);

    setLlmBrowserSessionStatus(profileId, META_PROVIDER, 'sending');

    try {
      const response = await this.generateMediaOnPage(page, prompt, options, {
        onPromptSent: () => setLlmBrowserSessionStatus(profileId, META_PROVIDER, 'waiting'),
      });
      setLlmBrowserSessionStatus(profileId, META_PROVIDER, 'idle');
      return response;
    } catch (err) {
      setLlmBrowserSessionStatus(profileId, META_PROVIDER, 'idle');
      throw err;
    }
  }

  async generateMediaOnPage(
    page: Page,
    prompt: string,
    options?: MetaGenerateMediaOptions,
    hooks?: { onPromptSent?: () => void },
  ): Promise<LlmBrowserResponse> {
    const handler = getMetaBrowserHandler();
    const mediaKind = resolveMediaKind(options);
    const timeoutMs = options?.timeoutMs ?? 300_000;
    const effectivePrompt = prependMetaMediaPrefix(prompt, mediaKind);

    await handler.sendPrompt(page, effectivePrompt, {
      pasteStrategy: options?.pasteStrategy ?? 'human',
      submitWith: 'enter',
    });
    hooks?.onPromptSent?.();

    return handler.receiveResponse(page, {
      mediaKind,
      outputPath: options?.outputPath,
      outputDir: options?.outputDir,
      fileName: options?.fileName,
      debugScreenshotPath: options?.debugScreenshotPath,
      timeoutMs,
    });
  }
}

export const metaBrowserService = new MetaBrowserService();
