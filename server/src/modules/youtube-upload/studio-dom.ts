import type { Locator, Page } from 'playwright';
import { humanClick, humanScroll, randomDelay, randomInt } from '../../infrastructure/llm-browser/human-interaction.js';

export async function delay(minMs: number, maxMs?: number): Promise<void> {
  const max = maxMs ?? minMs;
  await randomDelay(minMs, max);
}

export async function clickElement(
  page: Page,
  selectorOrLocator: string | Locator,
  scrollIntoView = true,
  force = false,
): Promise<void> {
  const locator = typeof selectorOrLocator === 'string' ? page.locator(selectorOrLocator) : selectorOrLocator;
  if (scrollIntoView) {
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  }
  if (force) {
    await locator.click({ force: true, delay: randomInt(40, 120) });
    await randomDelay(100, 280);
    return;
  }
  await humanClick(page, locator);
}

export async function clearContent(page: Page): Promise<void> {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.down(modifier);
  await page.keyboard.press('a');
  await page.keyboard.up(modifier);
  await randomDelay(80, 150);
  await page.keyboard.press('Backspace');
  await randomDelay(80, 150);
}

export async function scrollUntilVisible(
  page: Page,
  selector: string,
  scrollUp = false,
  maxAttempts = 50,
): Promise<void> {
  const locator = page.locator(selector);
  for (let i = 0; i < maxAttempts; i += 1) {
    if (await locator.isVisible().catch(() => false)) return;
    await humanScroll(page, scrollUp ? -200 : 200 + randomInt(0, 100));
    await randomDelay(80, 200);
  }
}

export async function pollUntilAnyLocatorVisible(
  page: Page,
  selectors: string[],
  timeoutMs = 15_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      if (await page.locator(selector).isVisible().catch(() => false)) {
        return selector;
      }
    }
    await randomDelay(200, 400);
  }
  return null;
}
