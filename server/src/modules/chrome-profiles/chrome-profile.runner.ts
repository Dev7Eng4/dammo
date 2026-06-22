import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { buildChromeLaunchOptions } from '../../infrastructure/chrome/browser-launch.config.js';
import { applyStealthInit } from '../../infrastructure/chrome/stealth-init.js';
import { clearLlmBrowserSessionsForProfile } from '../../infrastructure/llm-browser/llm-browser.session.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';

const activeContexts = new Map<string, BrowserContext>();
const DEFAULT_OPEN_URL = 'https://www.google.com';
const CHROME_LAUNCH_GAP_MS = 1_500;
const CHROME_LAUNCH_MAX_ATTEMPTS = 3;

let launchChain: Promise<unknown> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function enqueueChromeLaunch<T>(task: () => Promise<T>): Promise<T> {
  const run = launchChain.then(task);
  launchChain = run.catch(() => undefined);
  return run;
}

async function waitChromeLaunchSlot(): Promise<void> {
  await sleep(CHROME_LAUNCH_GAP_MS);
}

async function removeStaleProfileLocks(userDataDir: string): Promise<void> {
  const lockNames = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile'];
  for (const name of lockNames) {
    try {
      await fs.unlink(path.join(userDataDir, name));
    } catch {
      /* ignore */
    }
  }

  try {
    await fs.unlink(path.join(userDataDir, 'Default', 'SingletonLock'));
  } catch {
    /* ignore */
  }
}

function isContextAlive(context: BrowserContext): boolean {
  try {
    const browser = context.browser();
    return browser ? browser.isConnected() : context.pages().length >= 0;
  } catch {
    return false;
  }
}

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
  const results = await Promise.all(
    profileIds.map(async profileId => (await closeChromeProfile(profileId) ? profileId : null)),
  );
  return results.filter((id): id is string => id !== null);
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
  return enqueueChromeLaunch(async () => {
    await waitChromeLaunchSlot();

    let lastError: unknown;
    for (let attempt = 1; attempt <= CHROME_LAUNCH_MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 1) {
        await removeStaleProfileLocks(userDataDir);
        await sleep(1_000 * attempt);
      }

      try {
        const context = await chromium.launchPersistentContext(
          userDataDir,
          buildChromeLaunchOptions(headless),
        );
        await applyStealthInit(context);
        await logChromeLaunch(context, headless, userDataDir);
        return context;
      } catch (err) {
        lastError = err;
        const detail = err instanceof Error ? err.message : String(err);
        console.warn(
          `[chrome-profile] launch attempt ${attempt}/${CHROME_LAUNCH_MAX_ATTEMPTS} failed for ${userDataDir}: ${detail}`,
        );
      }
    }

    throw lastError;
  });
}

export async function openChromeProfile(
  profileId: string,
  userDataDir: string,
  options?: OpenChromeProfileOptions,
): Promise<void> {
  const existing = activeContexts.get(profileId);
  if (existing) {
    if (isContextAlive(existing)) {
      if (options?.startUrl) {
        await navigateToStartPage(existing, options.startUrl);
      }
      return;
    }

    activeContexts.delete(profileId);
    await existing.close().catch(() => undefined);
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
