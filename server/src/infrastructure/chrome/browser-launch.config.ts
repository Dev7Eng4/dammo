import { env } from '../../config/env.js';

const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
] as const;

/** Shared launch flags for system Google Chrome (not Playwright Chromium bundle). */
function baseChromeOptions(headless: boolean) {
  return {
    headless,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [...STEALTH_ARGS],
  };
}

function resolveChromeTarget() {
  if (env.chromeExecutablePath) {
    return { executablePath: env.chromeExecutablePath };
  }
  return { channel: env.chromeChannel };
}

/**
 * Options for chromium.launchPersistentContext().
 * Playwright API name is "chromium", but channel/executablePath selects system Google Chrome.
 */
export function buildChromeLaunchOptions(headless: boolean) {
  return {
    ...baseChromeOptions(headless),
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
