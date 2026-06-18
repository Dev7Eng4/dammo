import { chromium } from 'playwright';
import { env } from '../../config/env.js';
import { buildChromeBrowserOptions } from './browser-launch.config.js';

export async function verifySystemChrome(): Promise<boolean> {
  const target = env.chromeExecutablePath || `channel:${env.chromeChannel}`;

  try {
    const browser = await chromium.launch(buildChromeBrowserOptions(true));
    const version = await browser.version();
    await browser.close();
    console.log(`[chrome] system Chrome available (${target}): ${version}`);
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    console.warn(
      `[chrome] Google Chrome not found (${target}). Install Google Chrome on this machine or set CHROME_EXECUTABLE_PATH. ${detail}`,
    );
    return false;
  }
}

const isDirectRun = process.argv[1]?.includes('verify-chrome');
if (isDirectRun) {
  verifySystemChrome().then((ok) => process.exit(ok ? 0 : 1));
}
