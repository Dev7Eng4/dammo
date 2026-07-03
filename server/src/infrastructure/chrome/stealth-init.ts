import playwright from 'playwright';
import type { BrowserContext } from 'playwright';
import { addExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { installMouseTracking } from '../llm-browser/human-interaction.js';

export const stealthChromium = addExtra(playwright.chromium);
stealthChromium.use(StealthPlugin());

export async function applyStealthInit(context: BrowserContext): Promise<void> {
  await installMouseTracking(context);

  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  } catch {
    // Clipboard permissions are optional; paste falls back to sequential typing.
  }
}
