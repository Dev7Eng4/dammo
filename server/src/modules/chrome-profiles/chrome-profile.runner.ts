import fs from 'node:fs/promises';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { buildChromeLaunchOptions } from '../../infrastructure/chrome/browser-launch.config.js';
import { applyStealthInit } from '../../infrastructure/chrome/stealth-init.js';
import { clearLlmBrowserSessionsForProfile } from '../../infrastructure/llm-browser/llm-browser.session.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';

const activeContexts = new Map<string, BrowserContext>();
const DEFAULT_OPEN_URL = 'https://www.google.com';

export interface OpenChromeProfileOptions {
  startUrl?: string;
}

function chromeLaunchError(err: unknown, action: string): AppError {
  const detail = err instanceof Error ? err.message : 'Unknown error';
  return new AppError(
    `Failed to ${action}: ${detail}. Install Google Chrome on this machine or set CHROME_EXECUTABLE_PATH.`,
    502,
    'CHROME_LAUNCH_FAILED',
  );
}

async function logChromeLaunch(context: BrowserContext, headless: boolean, userDataDir: string): Promise<void> {
  let userAgent: string | undefined;
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    userAgent = await page.evaluate(() => navigator.userAgent);
  } catch {
    // Page may not be ready yet.
  }

  console.log('[chrome-profile] launched', {
    headless,
    chrome: env.chromeExecutablePath || `channel:${env.chromeChannel}`,
    userAgent,
    userDataDir,
  });
}

export function isChromeProfileOpen(profileId: string): boolean {
  return activeContexts.has(profileId);
}

export function getChromeProfileContext(profileId: string): BrowserContext | undefined {
  return activeContexts.get(profileId);
}

export async function getChromeProfilePage(profileId: string): Promise<Page> {
  const context = getChromeProfileContext(profileId);
  if (!context) {
    throw new AppError('Chrome profile is not open', 409, 'PROFILE_NOT_OPEN');
  }

  const existing = context.pages()[0];
  if (existing) {
    await existing.bringToFront();
    return existing;
  }

  try {
    return await context.waitForEvent('page', { timeout: 5_000 });
  } catch {
    const page = await context.newPage();
    await page.bringToFront();
    return page;
  }
}

export async function closeChromeProfile(profileId: string): Promise<boolean> {
  const context = activeContexts.get(profileId);
  if (!context) return false;

  clearLlmBrowserSessionsForProfile(profileId);

  try {
    await context.close();
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[chrome-profile] failed to close profile ${profileId}: ${detail}`);
    return false;
  } finally {
    activeContexts.delete(profileId);
  }
}

export async function closeChromeProfiles(profileIds: string[]): Promise<string[]> {
  const closed: string[] = [];
  for (const profileId of profileIds) {
    if (await closeChromeProfile(profileId)) {
      closed.push(profileId);
    }
  }
  return closed;
}

async function waitForInitialPage(context: BrowserContext): Promise<Page> {
  const existing = context.pages()[0];
  if (existing) return existing;

  try {
    return await context.waitForEvent('page', { timeout: 5_000 });
  } catch {
    return context.newPage();
  }
}

async function navigateToStartPage(context: BrowserContext, startUrl: string): Promise<void> {
  const page = await waitForInitialPage(context);

  if (!page.url().startsWith(startUrl)) {
    await page.goto(startUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
  }

  await page.bringToFront();
}

async function launchChromeContext(userDataDir: string, headless: boolean): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(userDataDir, buildChromeLaunchOptions(headless));
  await applyStealthInit(context);
  await logChromeLaunch(context, headless, userDataDir);
  return context;
}

export async function openChromeProfile(
  profileId: string,
  userDataDir: string,
  options?: OpenChromeProfileOptions,
): Promise<void> {
  if (activeContexts.has(profileId)) {
    if (options?.startUrl) {
      await navigateToStartPage(activeContexts.get(profileId)!, options.startUrl);
    }
    return;
  }

  let context: BrowserContext;
  try {
    context = await launchChromeContext(userDataDir, false);
  } catch (err) {
    throw chromeLaunchError(err, 'open Chrome profile');
  }

  activeContexts.set(profileId, context);
  context.on('close', () => {
    activeContexts.delete(profileId);
    clearLlmBrowserSessionsForProfile(profileId);
  });

  try {
    await navigateToStartPage(context, options?.startUrl ?? DEFAULT_OPEN_URL);
  } catch (err) {
    activeContexts.delete(profileId);
    await context.close().catch(() => undefined);
    throw chromeLaunchError(err, 'open default page');
  }
}

export async function initializeChromeProfile(userDataDir: string): Promise<void> {
  await fs.mkdir(userDataDir, { recursive: true });

  let context;
  try {
    context = await launchChromeContext(userDataDir, true);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    throw new AppError(
      `Failed to initialize Chrome profile: ${detail}. Install Google Chrome on this machine or set CHROME_EXECUTABLE_PATH.`,
      502,
      'CHROME_INIT_FAILED',
    );
  }

  try {
    await context.close();
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    throw new AppError(`Failed to close Chrome profile context: ${detail}`, 502, 'CHROME_CLOSE_FAILED');
  }
}
