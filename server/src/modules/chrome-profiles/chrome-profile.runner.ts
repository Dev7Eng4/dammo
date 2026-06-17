import fs from 'node:fs/promises';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { AppError } from '../../shared/http/errors.js';

const activeContexts = new Map<string, BrowserContext>();
const DEFAULT_OPEN_URL = 'https://www.google.com';
const CHROMIUM_LAUNCH_ARGS = ['--no-first-run', '--no-default-browser-check'] as const;

function playwrightLaunchError(err: unknown, action: string): AppError {
  const detail = err instanceof Error ? err.message : 'Unknown error';
  return new AppError(
    `Failed to ${action}: ${detail}. Run "npm run playwright:install" in server/.`,
    502,
    'PLAYWRIGHT_LAUNCH_FAILED',
  );
}

export function isChromeProfileOpen(profileId: string): boolean {
  return activeContexts.has(profileId);
}

export async function closeChromeProfile(profileId: string): Promise<void> {
  const context = activeContexts.get(profileId);
  if (!context) return;

  activeContexts.delete(profileId);
  await context.close().catch(() => undefined);
}

export async function closeChromeProfiles(profileIds: string[]): Promise<void> {
  for (const profileId of profileIds) {
    await closeChromeProfile(profileId);
  }
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

async function navigateToDefaultPage(context: BrowserContext): Promise<void> {
  const page = await waitForInitialPage(context);

  if (!page.url().startsWith('https://www.google.com')) {
    await page.goto(DEFAULT_OPEN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
  }

  await page.bringToFront();
}

export async function openChromeProfile(profileId: string, userDataDir: string): Promise<void> {
  if (activeContexts.has(profileId)) {
    throw new AppError('Chrome profile is already open', 409, 'PROFILE_ALREADY_OPEN');
  }

  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [...CHROMIUM_LAUNCH_ARGS],
    });
  } catch (err) {
    throw playwrightLaunchError(err, 'open Chromium profile');
  }

  activeContexts.set(profileId, context);
  context.on('close', () => {
    activeContexts.delete(profileId);
  });

  try {
    await navigateToDefaultPage(context);
  } catch (err) {
    activeContexts.delete(profileId);
    await context.close().catch(() => undefined);
    throw playwrightLaunchError(err, 'open default page');
  }
}

export async function initializeChromeProfile(userDataDir: string): Promise<void> {
  await fs.mkdir(userDataDir, { recursive: true });

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      args: ['--no-first-run', '--no-default-browser-check'],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    throw new AppError(
      `Failed to initialize Chromium profile: ${detail}. Run "npm run playwright:install" in server/.`,
      502,
      'PLAYWRIGHT_INIT_FAILED',
    );
  }

  try {
    await context.close();
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    throw new AppError(`Failed to close Chromium profile context: ${detail}`, 502, 'PLAYWRIGHT_CLOSE_FAILED');
  }
}
