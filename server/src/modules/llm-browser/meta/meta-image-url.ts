import type { Locator } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { META_CONFIG } from './meta.config.js';

/**
 * Generated Meta images are served from this exact host. Anything else in the assistant message
 * (notably the echoed reference upload) is not a generation result.
 */
export const META_GENERATED_IMAGE_URL_PREFIX = 'https://scontent.xx.fbcdn.net/';

export const META_INVALID_IMAGE_SOURCE_CODE = 'META_INVALID_IMAGE_SOURCE';

export interface ResolvedMetaImageUrl {
  url: string;
  /** All http(s) `src` values seen in the assistant message on the last poll. */
  candidates: string[];
}

export function isHttpUrl(url: string): boolean {
  const trimmed = url.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

export function isBlobUrl(url: string): boolean {
  return url.trim().startsWith('blob:');
}

export function isIgnoredImageUrl(url: string): boolean {
  const trimmed = url.trim();
  return !trimmed || trimmed.includes('favicon');
}

/** True only for `src` URLs on the generated-image host (https://scontent.xx.fbcdn.net/). */
export function isMetaGeneratedImageUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.trim().startsWith(META_GENERATED_IMAGE_URL_PREFIX));
}

/**
 * Pick the image to download from the `src` attributes of the assistant images.
 * Prefers a generated-host URL; otherwise returns the first http(s) src (which will then fail
 * validation). blob:/data:/empty src values mean the image is still loading and are skipped.
 */
export function pickMetaImageSrc(srcs: Array<string | null | undefined>): string | null {
  const httpSrcs = srcs
    .map(src => src?.trim() ?? '')
    .filter(src => isHttpUrl(src) && !isIgnoredImageUrl(src));
  return httpSrcs.find(isMetaGeneratedImageUrl) ?? httpSrcs[0] ?? null;
}

export function metaInvalidImageSourceError(url: string): AppError {
  return new AppError(
    `Meta image src is not a generated image (expected ${META_GENERATED_IMAGE_URL_PREFIX}...): ${url.slice(0, 120)}`,
    502,
    META_INVALID_IMAGE_SOURCE_CODE,
  );
}

/** Throws (so the job is retried) when the src is not on the generated-image host. */
export function assertMetaGeneratedImageUrl(url: string): void {
  if (!isMetaGeneratedImageUrl(url)) {
    throw metaInvalidImageSourceError(url);
  }
}

export async function collectAssistantImageSrcs(assistant: Locator): Promise<Array<string | null>> {
  let images = assistant.locator(META_CONFIG.selectors.resultImages);
  if ((await images.count().catch(() => 0)) === 0) {
    images = assistant.locator('img');
  }
  const count = await images.count().catch(() => 0);
  const srcs: Array<string | null> = [];
  for (let index = 0; index < count; index += 1) {
    srcs.push(await images.nth(index).getAttribute('src').catch(() => null));
  }
  return srcs;
}

export interface ResolveMetaImageSourceUrlOptions {
  pollDelayMs?: number;
  /** Runs before every poll; throw to stop waiting (e.g. the account ran out of quota). */
  onPoll?: () => Promise<void>;
}

/**
 * Poll the assistant message until an image has an http(s) `src`, then return it.
 * The URL is NOT validated here — call assertMetaGeneratedImageUrl before downloading.
 */
export async function resolveMetaImageSourceUrl(
  assistant: Locator,
  timeoutMs: number,
  options?: ResolveMetaImageSourceUrlOptions,
): Promise<ResolvedMetaImageUrl> {
  const deadline = Date.now() + timeoutMs;
  const pollDelayMs = options?.pollDelayMs ?? 400;
  let lastSrcs: Array<string | null> = [];

  while (Date.now() < deadline) {
    await options?.onPoll?.();
    lastSrcs = await collectAssistantImageSrcs(assistant);
    const url = pickMetaImageSrc(lastSrcs);
    if (url) {
      const candidates = lastSrcs.map(src => src?.trim() ?? '').filter(isHttpUrl);
      return { url, candidates };
    }
    await new Promise(resolve => setTimeout(resolve, pollDelayMs));
  }

  const seen = lastSrcs.filter(Boolean).map(src => src!.slice(0, 80));
  throw new Error(`No http(s) image src found in assistant message${seen.length ? ` (src: ${seen.join(', ')})` : ''}`);
}
