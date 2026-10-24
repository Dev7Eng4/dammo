import type { Page } from 'playwright';
import { FACEBOOK_SELECTOR, type FacebookSelectorKey } from './facebook-selectors.js';

export interface SelectorProbeResult {
  key: FacebookSelectorKey;
  /** First selector in the fallback list that matched, or null. */
  matched: string | null;
  visible: boolean;
}

/**
 * Reports which selector groups match on the page currently open.
 * Open each Facebook screen (create page, page home, composer, reel creator)
 * in a logged-in profile and probe it to see which groups still resolve.
 */
export async function probeFacebookSelectors(
  page: Page,
  keys: FacebookSelectorKey[] = Object.keys(FACEBOOK_SELECTOR) as FacebookSelectorKey[],
): Promise<SelectorProbeResult[]> {
  const results: SelectorProbeResult[] = [];
  for (const key of keys) {
    let matched: string | null = null;
    let visible = false;
    for (const selector of FACEBOOK_SELECTOR[key]) {
      const locator = page.locator(selector).first();
      if ((await locator.count().catch(() => 0)) > 0) {
        matched = selector;
        visible = await locator.isVisible().catch(() => false);
        break;
      }
    }
    results.push({ key, matched, visible });
  }
  return results;
}
