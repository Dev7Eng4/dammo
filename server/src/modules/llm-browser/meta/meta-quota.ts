import type { Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';

export const META_QUOTA_EXHAUSTED_CODE = 'META_IMAGE_QUOTA_EXHAUSTED';

/** Meta says "wait until tomorrow"; skip the profile for this long before trying it again. */
export const META_QUOTA_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/**
 * Text Meta shows when the account ran out of image generations: the "Upgrade to create more
 * images / You reached your limit" card, or the assistant replying that its quota is exhausted.
 */
const QUOTA_EXHAUSTED_PATTERNS: RegExp[] = [
  /you(?:'ve| have)? reached your limit/i,
  /upgrade to create more (?:images|media|videos)/i,
  /image generation (?:quota|limit)[^.]{0,40}(?:exhausted|reached|used up)/i,
  /quota is (?:temporarily )?exhausted/i,
  /đã đạt (?:đến |tới )?giới hạn/i,
  /nâng cấp để tạo thêm/i,
];

export function matchesMetaQuotaExhausted(text: string): boolean {
  const normalized = text.replace(/[‘’]/g, "'").replace(/\s+/g, ' ');
  return QUOTA_EXHAUSTED_PATTERNS.some(pattern => pattern.test(normalized));
}

export async function isMetaQuotaExhaustedOnPage(page: Page): Promise<boolean> {
  const text = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  return matchesMetaQuotaExhausted(text);
}

export function metaQuotaExhaustedError(): AppError {
  return new AppError('Meta image generation quota exhausted on this profile', 429, META_QUOTA_EXHAUSTED_CODE);
}

export function isMetaQuotaExhaustedError(err: unknown): boolean {
  return err instanceof AppError && err.code === META_QUOTA_EXHAUSTED_CODE;
}

/** profileId → timestamp (ms) until which the profile must not be used for Meta media. */
const exhaustedUntilByProfile = new Map<string, number>();

export function markMetaProfileQuotaExhausted(profileId: string, now = Date.now()): void {
  exhaustedUntilByProfile.set(profileId, now + META_QUOTA_COOLDOWN_MS);
}

export function isMetaProfileQuotaExhausted(profileId: string, now = Date.now()): boolean {
  const until = exhaustedUntilByProfile.get(profileId);
  if (until === undefined) return false;
  if (until <= now) {
    exhaustedUntilByProfile.delete(profileId);
    return false;
  }
  return true;
}
