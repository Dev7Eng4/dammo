import type { Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { META_CONFIG } from './meta.config.js';

export const META_QUOTA_EXHAUSTED_CODE = 'META_IMAGE_QUOTA_EXHAUSTED';

/** Meta says "wait until tomorrow"; skip the profile for this long before trying it again. */
export const META_QUOTA_COOLDOWN_MS = 12 * 60 * 60 * 1000;

/** The "Upgrade to create more images / You reached your limit" card: matched on the whole page. */
const QUOTA_CARD_PATTERNS: RegExp[] = [
  /you(?:'ve| have)? reached your limit/i,
  /upgrade to create more (?:images|media|videos)/i,
  /đã đạt (?:đến |tới )?giới hạn/i,
  /nâng cấp để tạo thêm/i,
];

/**
 * The assistant replying that its quota is exhausted. Matched on its messages only: the sidebar keeps
 * old chats titled e.g. "Image generation quota exhausted" long after the quota is back.
 */
const QUOTA_REPLY_PATTERNS: RegExp[] = [
  /image generation (?:quota|limit)[^.]{0,40}(?:exhausted|reached|used up)/i,
  /quota is (?:temporarily )?exhausted/i,
];

function normalizeQuotaText(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/\s+/g, ' ');
}

export function matchesMetaQuotaExhausted(pageText: string, assistantText: string): boolean {
  const page = normalizeQuotaText(pageText);
  const assistant = normalizeQuotaText(assistantText);
  return (
    QUOTA_CARD_PATTERNS.some(pattern => pattern.test(page)) ||
    QUOTA_REPLY_PATTERNS.some(pattern => pattern.test(assistant))
  );
}

export async function isMetaQuotaExhaustedOnPage(page: Page): Promise<boolean> {
  const text = await page
    .evaluate(
      selector => ({
        page: document.body?.innerText ?? '',
        assistant: Array.from(document.querySelectorAll<HTMLElement>(selector))
          .map(el => el.innerText)
          .join(' '),
      }),
      META_CONFIG.selectors.assistantMessage,
    )
    .catch(() => ({ page: '', assistant: '' }));
  return matchesMetaQuotaExhausted(text.page, text.assistant);
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
