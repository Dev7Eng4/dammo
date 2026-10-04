import type { BrowserContext, Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { randomDelay } from '../../../infrastructure/browser/human-interaction.js';
import { humanPaste } from './gmail-paste.js';
import { GMAIL_LOGIN, TWO_FA_LIVE } from './gmail-selectors.js';

const STEP_TIMEOUT_MS = 30_000;

function log(msg: string): void {
  console.log(`[gmail-login] ${msg}`);
}

function lastSixDigits(text: string): string | null {
  const match = text.match(/(\d{6})\D*$/);
  return match ? match[1] : null;
}

async function readClipboard(page: Page, context: BrowserContext): Promise<string> {
  await context
    .grantPermissions(['clipboard-read', 'clipboard-write'], { origin: TWO_FA_LIVE.origin })
    .catch(() => undefined);
  return page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
}

/**
 * Open 2fa.live in a new tab, convert the 2FA secret into a 6-digit TOTP token
 * (copy button → clipboard, last 6 digits), close the tab and return the token.
 */
export async function fetchTotpToken(context: BrowserContext, secret: string): Promise<string> {
  const tab = await context.newPage();
  try {
    log(`2fa.live: open ${TWO_FA_LIVE.url}`);
    await tab.goto(TWO_FA_LIVE.url, { waitUntil: 'load', timeout: 60_000 });
    await tab.bringToFront();

    const input = tab.locator(TWO_FA_LIVE.input).first();
    await input.waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
    await randomDelay(800, 1_500);
    await humanPaste(tab, input, secret.replace(/\s+/g, ''));
    await randomDelay(1_000, 1_800);

    await tab.locator(TWO_FA_LIVE.submit).first().click({ timeout: 15_000 });
    await randomDelay(1_000, 1_500);

    await tab.locator(TWO_FA_LIVE.copy).first().click({ timeout: 15_000 });
    await randomDelay(600, 1_000);

    let token = lastSixDigits((await readClipboard(tab, context)).trim());
    if (!token) {
      // Clipboard unavailable over CDP — fall back to whatever the page now shows.
      const shown = await input.inputValue().catch(() => '');
      token = lastSixDigits(shown.trim());
    }
    if (!token) {
      throw new AppError('Could not read 2FA token from 2fa.live', 502, 'GMAIL_2FA_TOKEN_FAILED');
    }
    log('2fa.live: token obtained');
    return token;
  } finally {
    await tab.close().catch(() => undefined);
  }
}

/** Fill the TOTP pin on the Google challenge page and submit. */
export async function enterTotpPin(page: Page, token: string): Promise<void> {
  await page.bringToFront();
  const pin = page.locator(GMAIL_LOGIN.totpInput).first();
  try {
    await pin.waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
  } catch {
    throw new AppError(
      'Google did not show the 2FA code input (totpPin)',
      502,
      'GMAIL_LOGIN_UI_TIMEOUT',
    );
  }
  await randomDelay(800, 1_500);
  await humanPaste(page, pin, token);
  await randomDelay(1_000, 1_800);
  await page.keyboard.press('Enter');
}
