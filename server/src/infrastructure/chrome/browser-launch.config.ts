import { env } from '../../config/env.js';

const STEALTH_ARGS = ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'] as const;

/** Flags reducing Chrome memory. Only safe, non-visual-breaking ones (page still renders normally). */
const RAM_OPTIMIZATION_ARGS = [
  '--disable-gpu',
  '--renderer-process-limit=2',
  '--disable-extensions',
  '--disable-dev-shm-usage',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-breakpad',
  '--disable-default-apps',
] as const;

/**
 * When true (default), background Chrome windows are parked off-screen.
 * When false, windows are minimized via CDP instead (see chrome-profile.runner).
 *
 * Note: launch uses `viewport: null`, so a minimized window may collapse the page
 * viewport and cause Playwright click actionability failures.
 */
export const CHROME_BACKGROUND_USE_OFFSCREEN = true;

/**
 * Chrome flags to avoid stealing focus from the user's foreground apps.
 */
export function backgroundChromeArgs(): string[] {
  const args = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
  if (CHROME_BACKGROUND_USE_OFFSCREEN && process.platform === 'win32') {
    args.push('--window-position=-32000,-32000', '--window-size=1920,1080');
  }
  return args;
}

/** Shared launch flags for system Google Chrome (not Playwright Chromium bundle). */
function baseChromeOptions(headless: boolean, background = false) {
  const args: string[] = [...STEALTH_ARGS, ...RAM_OPTIMIZATION_ARGS];
  if (background) {
    args.push(...backgroundChromeArgs());
  }
  return {
    headless,
    ignoreDefaultArgs: ['--enable-automation'],
    args,
  };
}

function resolveChromeTarget() {
  if (env.chromeExecutablePath) {
    return { executablePath: env.chromeExecutablePath };
  }
  return { channel: env.chromeChannel };
}

export interface ChromeLaunchOptions {
  background?: boolean;
}

/**
 * Options for chromium.launchPersistentContext().
 * Playwright API name is "chromium", but channel/executablePath selects system Google Chrome.
 */
export function buildChromeLaunchOptions(headless: boolean, options: ChromeLaunchOptions = {}) {
  return {
    ...baseChromeOptions(headless, options.background),
    viewport: null,
    locale: 'en-US',
    acceptDownloads: true,
    ...resolveChromeTarget(),
  };
}

/** Options for chromium.launch() — used by startup verification. */
export function buildChromeBrowserOptions(headless = true) {
  return {
    ...baseChromeOptions(headless),
    ...resolveChromeTarget(),
  };
}
