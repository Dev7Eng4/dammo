import { env } from '../../config/env.js';

const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
] as const;

/** Flags reducing Chrome memory. Only safe, non-visual-breaking ones (browser stays visible). */
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

/** Chrome flags to avoid stealing focus from the user's foreground apps. */
export function backgroundChromeArgs(): string[] {
  if (process.platform === 'win32') {
    return ['--start-minimized'];
  }
  return [];
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
