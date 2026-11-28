import type { Page } from 'playwright';
import { AppError, isAppError } from '../../../shared/http/errors.js';
import { getChromeProfilePage, isChromeProfileOpen, openChromeProfile } from '../../chrome-profiles/chrome-profile.runner.js';
import { chromeProfilesService } from '../../chrome-profiles/chrome-profiles.service.js';
import type { ChromeProfile } from '../../chrome-profiles/chrome-profiles.types.js';
import { getMuseBrowserHandler } from '../core/registry.js';
import { getLlmBrowserSession, setLlmBrowserSessionStatus, upsertLlmBrowserSession } from '../core/session.js';
import type { LlmBrowserResponse, LlmBrowserSession } from '../core/types.js';
import {
  MUSE_IMAGE_TIMEOUT_MS,
  MUSE_VIDEO_DEFAULT_SECONDS,
  MUSE_VIDEO_MAX_SECONDS,
  MUSE_VIDEO_MIN_SECONDS,
  MUSE_VIDEO_TIMEOUT_MS,
} from './muse.config.js';

const MUSE_PROVIDER = 'muse' as const;
const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 5_000;
/** Muse said its image/video service is down: give it this long (times the attempt number) before the next try. */
const SERVICE_DOWN_RETRY_DELAY_MS = 60_000;
/** Errors no retry can fix. */
const FATAL_CODES = new Set(['MUSE_NOT_LOGGED_IN', 'NO_LLM_PROFILE', 'NOT_FOUND', 'PROFILE_NOT_OPEN']);

type MuseMediaKind = 'image' | 'video';

interface MuseJobOptions {
  /** Default: the first Chrome profile with Muse ticked in LLM Image (image) or LLM Video (video). */
  profileId?: string;
  outputPath?: string;
  outputDir?: string;
  fileName?: string;
  debugScreenshotPath?: string;
  /** Per attempt. */
  timeoutMs?: number;
  /** Tries, each in a new side chat. Default 3. */
  maxAttempts?: number;
  onLog?: (msg: string) => void;
}

export interface MuseGenerateImageOptions extends MuseJobOptions {
  /** Added in front of the prompt as "Create image 16:9: …". Default '16:9'. */
  aspectRatio?: '16:9' | '3:4';
  referenceImagePaths?: string[];
  /** Keep Muse's full size instead of fitting 16:9 to 1280x720. */
  skipResize?: boolean;
}

export interface MuseGenerateVideoOptions extends MuseJobOptions {
  /** Clip length, 3–10 s (rounded and clamped). Default 8. */
  durationSeconds?: number;
  /** Image(s) to animate; without one Muse makes the video from the text alone. */
  referenceImagePaths?: string[];
}

/** Muse decides from the wording whether to draw, so say it plainly; the ratio goes in the same line. */
export function buildMuseImagePrompt(prompt: string, aspectRatio: '16:9' | '3:4' = '16:9'): string {
  const trimmed = prompt.trim();
  if (/^create (an )?image\b/i.test(trimmed)) return trimmed;
  return `Create image ${aspectRatio}: ${trimmed}`;
}

/** Clip length Muse accepts: a whole number of seconds from 3 to 10. */
export function clampMuseVideoSeconds(seconds?: number): number {
  if (seconds === undefined || !Number.isFinite(seconds)) return MUSE_VIDEO_DEFAULT_SECONDS;
  return Math.min(MUSE_VIDEO_MAX_SECONDS, Math.max(MUSE_VIDEO_MIN_SECONDS, Math.round(seconds)));
}

/** The length goes in the prompt ("Create video 16:9 5s: …"); without it Muse makes 10 s. */
export function buildMuseVideoPrompt(prompt: string, durationSeconds?: number): string {
  // Drop a "Create video 16:9 4s:" the caller already wrote, so the length given here is the only one.
  const trimmed = prompt
    .trim()
    .replace(/^create (a )?video(\s+\d+:\d+)?(\s+\d+(\.\d+)?\s*s(ec(ond)?s?)?)?\s*:?\s*/i, '');
  return `Create video 16:9 ${clampMuseVideoSeconds(durationSeconds)}s: ${trimmed}`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export class MuseBrowserService {
  /** Open the profile and a new Muse side chat on its first tab. */
  async open(profileId: string): Promise<LlmBrowserSession> {
    const profile = chromeProfilesService.getById(profileId);
    await openChromeProfile(profile.id, profile.userDataDir, { background: true, gpu: true });
    const page = await getChromeProfilePage(profile.id);
    await getMuseBrowserHandler().open(page);
    return upsertLlmBrowserSession(profileId, MUSE_PROVIDER);
  }

  /** One image attempt on a page that is already logged into Muse. */
  async generateImageOnPage(
    page: Page,
    prompt: string,
    options: Omit<MuseGenerateImageOptions, 'profileId' | 'maxAttempts' | 'onLog'> = {},
  ): Promise<LlmBrowserResponse> {
    const handler = getMuseBrowserHandler();
    const aspectRatio = options.aspectRatio ?? '16:9';
    const sent = await handler.sendPrompt(page, buildMuseImagePrompt(prompt, aspectRatio), {
      referenceImagePaths: options.referenceImagePaths,
    });
    return handler.receiveResponse(page, {
      mediaKind: 'image',
      baselineBlockCount: sent?.baselineBlockCount,
      timeoutMs: options.timeoutMs ?? MUSE_IMAGE_TIMEOUT_MS,
      aspectRatio,
      skipResize: options.skipResize,
      outputPath: options.outputPath,
      outputDir: options.outputDir,
      fileName: options.fileName,
      debugScreenshotPath: options.debugScreenshotPath,
    });
  }

  /** One video attempt on a page that is already logged into Muse. */
  async generateVideoOnPage(
    page: Page,
    prompt: string,
    options: Omit<MuseGenerateVideoOptions, 'profileId' | 'maxAttempts' | 'onLog'> = {},
  ): Promise<LlmBrowserResponse> {
    const handler = getMuseBrowserHandler();
    const sent = await handler.sendPrompt(page, buildMuseVideoPrompt(prompt, options.durationSeconds), {
      referenceImagePaths: options.referenceImagePaths,
    });
    return handler.receiveResponse(page, {
      mediaKind: 'video',
      baselineBlockCount: sent?.baselineBlockCount,
      timeoutMs: options.timeoutMs ?? MUSE_VIDEO_TIMEOUT_MS,
      outputPath: options.outputPath,
      outputDir: options.outputDir,
      fileName: options.fileName,
      debugScreenshotPath: options.debugScreenshotPath,
    });
  }

  /** Generate one image with Muse, retrying in a new side chat when Muse's image tool fails. */
  async generateImage(prompt: string, options: MuseGenerateImageOptions = {}): Promise<LlmBrowserResponse> {
    return this.runWithRetries('image', options, page => this.generateImageOnPage(page, prompt, options));
  }

  /** Generate one 3–10 s video (16:9, 1280x720 MP4) with Muse, from text or by animating a reference image. */
  async generateVideo(prompt: string, options: MuseGenerateVideoOptions = {}): Promise<LlmBrowserResponse> {
    return this.runWithRetries('video', options, page => this.generateVideoOnPage(page, prompt, options));
  }

  private resolveProfile(kind: MuseMediaKind, profileId?: string): ChromeProfile {
    if (profileId) return chromeProfilesService.getById(profileId);
    return kind === 'video'
      ? chromeProfilesService.requireProfileForLlm('video', 'muse')
      : chromeProfilesService.requireProfileForLlm('image', 'muse');
  }

  private async runWithRetries(
    kind: MuseMediaKind,
    options: MuseJobOptions,
    attemptOnPage: (page: Page) => Promise<LlmBrowserResponse>,
  ): Promise<LlmBrowserResponse> {
    const log = options.onLog ?? ((msg: string) => console.log(msg));
    const profile = this.resolveProfile(kind, options.profileId);

    if (!getLlmBrowserSession(profile.id, MUSE_PROVIDER) || !isChromeProfileOpen(profile.id)) {
      log(`[muse] opening profile ${profile.name}`);
      await this.open(profile.id);
    }
    const page = await getChromeProfilePage(profile.id);

    const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      setLlmBrowserSessionStatus(profile.id, MUSE_PROVIDER, 'sending');
      try {
        const response = await attemptOnPage(page);
        log(`[muse] ${profile.name}: ${kind} saved (attempt ${attempt}/${maxAttempts})`);
        return response;
      } catch (err) {
        lastError = err;
        if (isAppError(err) && err.code && FATAL_CODES.has(err.code)) throw err;
        log(`[muse] ${profile.name}: ${kind} attempt ${attempt}/${maxAttempts} failed - ${errorText(err)}`);
        if (attempt < maxAttempts) {
          const serviceDown = isAppError(err) && err.code === 'MUSE_SERVICE_UNAVAILABLE';
          const waitMs = (serviceDown ? SERVICE_DOWN_RETRY_DELAY_MS : RETRY_DELAY_MS) * attempt;
          if (serviceDown) log(`[muse] ${kind} service is down - waiting ${Math.round(waitMs / 1000)}s before the next try`);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      } finally {
        setLlmBrowserSessionStatus(profile.id, MUSE_PROVIDER, 'idle');
      }
    }
    throw isAppError(lastError)
      ? lastError
      : new AppError(`Muse ${kind} failed after ${maxAttempts} tries: ${errorText(lastError)}`, 502, `MUSE_${kind.toUpperCase()}_FAILED`);
  }
}

export const museBrowserService = new MuseBrowserService();
