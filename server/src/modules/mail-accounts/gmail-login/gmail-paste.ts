import type { Locator, Page } from 'playwright';
import { randomDelay } from '../../../infrastructure/browser/human-interaction.js';

/**
 * Paste text into an input like a person would: put it on the clipboard,
 * focus the field and press Ctrl+V (Cmd+V on macOS).
 * Falls back to insertText (fires the same input event) if the clipboard is unavailable.
 */
export async function humanPaste(page: Page, locator: Locator, text: string): Promise<void> {
  await locator.click({ timeout: 15_000, force: true });
  await randomDelay(500, 1_000);

  const origin = new URL(page.url()).origin;
  await page
    .context()
    .grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
    .catch(() => undefined);

  const copied = await page
    .evaluate(async (value) => {
      await navigator.clipboard.writeText(value);
      return true;
    }, text)
    .catch(() => false);

  await locator.focus().catch(() => undefined);
  await randomDelay(250, 600);

  if (copied) {
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+V`);
  } else {
    await page.keyboard.insertText(text);
  }
  await randomDelay(400, 900);
}
