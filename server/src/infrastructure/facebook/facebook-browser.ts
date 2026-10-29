import { chromium, type Page } from 'playwright';
import { buildChromeBrowserOptions } from '../chrome/browser-launch.config.js';
import { env } from '../../config/env.js';
import {
  connectPlaywrightToGpmProfile,
  disconnectGpmPlaywright,
  resolveGpmProfileIdByEmail,
} from '../gpm/gpm-playwright.connector.js';

export interface FacebookBrowserResult<T> {
  value: T;
  /** True when no logged-in GPM profile was used (Facebook may then limit what it serves). */
  loggedOut: boolean;
}

/**
 * Runs `run` against a fresh Facebook-capable Playwright page.
 * With FACEBOOK_SCRAPE_EMAIL set, a logged-in GPM profile is used; otherwise headless Chrome
 * (no visible window) is launched.
 */
export async function withFacebookBrowserPage<T>(
  run: (page: Page) => Promise<T>,
): Promise<FacebookBrowserResult<T>> {
  const email = env.facebookScrapeEmail.trim();

  if (email) {
    const profileId = await resolveGpmProfileIdByEmail(email);
    const connection = await connectPlaywrightToGpmProfile(profileId);
    try {
      return { value: await run(connection.page), loggedOut: false };
    } finally {
      await disconnectGpmPlaywright(connection);
    }
  }

  const browser = await chromium.launch(buildChromeBrowserOptions(true));
  try {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 1600 } });
    const page = await context.newPage();
    return { value: await run(page), loggedOut: true };
  } finally {
    await browser.close();
  }
}
