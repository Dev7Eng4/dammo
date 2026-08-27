import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, CDPSession, Page } from 'playwright';
import {
  buildChromeLaunchOptions,
  isChromeBackgroundUseOffscreen,
} from '../../infrastructure/chrome/browser-launch.config.js';
import {
  centerRectInWorkArea,
  resetChromeWindowPlacement,
  type ChromeWorkArea,
} from '../../infrastructure/chrome/chrome-window-placement.js';
import { applyStealthInit, stealthChromium } from '../../infrastructure/chrome/stealth-init.js';
import { clearLlmBrowserSessionsForProfile } from '../../infrastructure/llm-browser/llm-browser.session.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';

const activeContexts = new Map<string, BrowserContext>();
const profileBackgroundMode = new Map<string, boolean>();
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

function isProfileBackground(profileId: string): boolean {
  return profileBackgroundMode.get(profileId) ?? false;
}

async function moveChromeWindowOffscreen(context: BrowserContext, page: Page): Promise<void> {
  let client: CDPSession | undefined;
  try {
    client = await context.newCDPSession(page);
    const { windowId } = await client.send('Browser.getWindowForTarget');
    // Bounds cannot be changed while the window is minimized or maximized.
    await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await client.send('Browser.setWindowBounds', {
      windowId,
      bounds: { left: -32_000, top: -32_000, width: 1920, height: 1080 },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[chrome-profile] failed to move window offscreen: ${detail}`);
  } finally {
    await client?.detach().catch(() => undefined);
  }
}

/** Work area of the display the window currently sits on, per the renderer. */
async function readScreenWorkArea(page: Page): Promise<ChromeWorkArea | undefined> {
  try {
    return await page.evaluate(() => {
      const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
      const left = screen.availLeft ?? 0;
      const top = screen.availTop ?? 0;
      return {
        left,
        top,
        right: left + screen.availWidth,
        bottom: top + screen.availHeight,
      };
    });
  } catch {
    return undefined;
  }
}

/** Brings a window back to the middle of the screen (undoes the off-screen parking). */
async function centerChromeWindow(context: BrowserContext, page: Page): Promise<void> {
  let client: CDPSession | undefined;
  try {
    const rect = centerRectInWorkArea(await readScreenWorkArea(page));
    client = await context.newCDPSession(page);
    const { windowId } = await client.send('Browser.getWindowForTarget');
    // Bounds cannot be changed while the window is minimized or maximized.
    await client.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    await client.send('Browser.setWindowBounds', {
      windowId,
      bounds: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(`[chrome-profile] failed to center window: ${detail}`);
  } finally {
    await client?.detach().catch(() => undefined);
  }
}

/**
 * Background profiles are never brought to front. With off-screen parking disabled
 * the window is left exactly where it is, visible on screen.
 */
async function keepProfileInBackground(profileId: string, page: Page): Promise<void> {
  if (!isProfileBackground(profileId)) return;
  if (!isChromeBackgroundUseOffscreen()) return;
  const context = activeContexts.get(profileId);
  if (!context) return;
  await moveChromeWindowOffscreen(context, page);
}

/**
 * Re-applies the current background window mode to every open profile, so toggling
 * the setting pulls already-parked windows back onto the screen immediately.
 */
export async function applyChromeBackgroundModeToOpenProfiles(): Promise<void> {
  const profileIds = [...activeContexts.keys()];

  await Promise.all(
    profileIds.map(async profileId => {
      const context = activeContexts.get(profileId);
      if (!context) return;

      try {
        const page = await waitForInitialPage(context);
        if (isProfileBackground(profileId) && isChromeBackgroundUseOffscreen()) {
          await moveChromeWindowOffscreen(context, page);
        } else {
          await centerChromeWindow(context, page);
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.warn(`[chrome-profile] failed to re-apply window mode for ${profileId}: ${detail}`);
      }
    }),
  );
}

export interface OpenChromeProfileOptions {
  startUrl?: string;
  background?: boolean;
}

function chromeLaunchError(err: unknown, action: string): AppError {
  const detail = err instanceof Error ? err.message : 'Unknown error';
  return new AppError(
    `Failed to ${action}: ${detail}. Install Google Chrome on this machine or set CHROME_EXECUTABLE_PATH.`,
    502,
    'CHROME_LAUNCH_FAILED',
  );
}

async function logChromeLaunch(
  context: BrowserContext,
  headless: boolean,
  userDataDir: string,
  background: boolean,
): Promise<void> {
  let userAgent: string | undefined;
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    userAgent = await page.evaluate(() => navigator.userAgent);
  } catch {
    // Page may not be ready yet.
  }

  console.log('[chrome-profile] launched', {
    headless,
    background,
    ...(background
      ? { backgroundMode: isChromeBackgroundUseOffscreen() ? 'offscreen' : 'visible' }
      : {}),
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

  const bringToFront = !isProfileBackground(profileId);
  const existing = context.pages()[0];
  if (existing) {
    if (bringToFront) {
      await existing.bringToFront();
    } else {
      await keepProfileInBackground(profileId, existing);
    }
    return existing;
  }

  try {
    const page = await context.waitForEvent('page', { timeout: 5_000 });
    if (!bringToFront) {
      await keepProfileInBackground(profileId, page);
    }
    return page;
  } catch {
    const page = await context.newPage();
    if (bringToFront) {
      await page.bringToFront();
    } else {
      await keepProfileInBackground(profileId, page);
    }
    return page;
  }
}

export async function createChromeProfilePage(profileId: string): Promise<Page> {
  const context = getChromeProfileContext(profileId);
  if (!context) {
    throw new AppError('Chrome profile is not open', 409, 'PROFILE_NOT_OPEN');
  }

  const page = await context.newPage();
  if (!isProfileBackground(profileId)) {
    await page.bringToFront();
  } else {
    await keepProfileInBackground(profileId, page);
  }
  return page;
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
    profileBackgroundMode.delete(profileId);
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

async function navigateToStartPage(
  context: BrowserContext,
  startUrl: string,
  profileId: string,
): Promise<void> {
  const page = await waitForInitialPage(context);

  if (!page.url().startsWith(startUrl)) {
    await page.goto(startUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
  }

  if (!isProfileBackground(profileId)) {
    await page.bringToFront();
  } else {
    await keepProfileInBackground(profileId, page);
  }
}

async function bringChromeProfileToFront(profileId: string): Promise<void> {
  const context = activeContexts.get(profileId);
  if (!context) return;
  const page = await waitForInitialPage(context);
  await page.bringToFront();
}

async function sendChromeProfileToBackground(profileId: string): Promise<void> {
  const context = activeContexts.get(profileId);
  if (!context) return;
  const page = await waitForInitialPage(context);
  await keepProfileInBackground(profileId, page);
}

async function launchChromeContext(
  userDataDir: string,
  headless: boolean,
  background: boolean,
): Promise<BrowserContext> {
  return enqueueChromeLaunch(async () => {
    await waitChromeLaunchSlot();

    // A profile parked off-screen before keeps that position in its Preferences file,
    // so it must be repaired whenever the window is supposed to be visible.
    const shouldBeVisible = !headless && !(background && isChromeBackgroundUseOffscreen());
    const windowRect = shouldBeVisible ? await resetChromeWindowPlacement(userDataDir) : undefined;

    let lastError: unknown;
    for (let attempt = 1; attempt <= CHROME_LAUNCH_MAX_ATTEMPTS; attempt += 1) {
      if (attempt > 1) {
        await removeStaleProfileLocks(userDataDir);
        await sleep(1_000 * attempt);
      }

      try {
        const context = await stealthChromium.launchPersistentContext(
          userDataDir,
          buildChromeLaunchOptions(headless, {
            background,
            ...(windowRect ? { windowRect } : {}),
          }),
        );
        await applyStealthInit(context);
        await logChromeLaunch(context, headless, userDataDir, background);
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
  const background = options?.background ?? false;
  const existing = activeContexts.get(profileId);
  if (existing) {
    if (isContextAlive(existing)) {
      profileBackgroundMode.set(profileId, background);
      if (options?.startUrl) {
        await navigateToStartPage(existing, options.startUrl, profileId);
      } else if (!background) {
        await bringChromeProfileToFront(profileId);
      } else {
        await sendChromeProfileToBackground(profileId);
      }
      return;
    }

    activeContexts.delete(profileId);
    profileBackgroundMode.delete(profileId);
    await existing.close().catch(() => undefined);
  }

  let context: BrowserContext;
  try {
    context = await launchChromeContext(userDataDir, false, background);
  } catch (err) {
    throw chromeLaunchError(err, 'open Chrome profile');
  }

  activeContexts.set(profileId, context);
  profileBackgroundMode.set(profileId, background);
  context.on('close', () => {
    activeContexts.delete(profileId);
    profileBackgroundMode.delete(profileId);
    clearLlmBrowserSessionsForProfile(profileId);
  });

  try {
    await navigateToStartPage(context, options?.startUrl ?? DEFAULT_OPEN_URL, profileId);
  } catch (err) {
    activeContexts.delete(profileId);
    profileBackgroundMode.delete(profileId);
    await context.close().catch(() => undefined);
    throw chromeLaunchError(err, 'open default page');
  }
}

export async function initializeChromeProfile(userDataDir: string): Promise<void> {
  await fs.mkdir(userDataDir, { recursive: true });

  let context;
  try {
    context = await launchChromeContext(userDataDir, true, false);
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
