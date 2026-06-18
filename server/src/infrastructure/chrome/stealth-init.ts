import type { BrowserContext } from 'playwright';

const STEALTH_INIT_SCRIPT = `
(() => {
  try {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });
  } catch {}
})();
`;

export async function applyStealthInit(context: BrowserContext): Promise<void> {
  await context.addInitScript(STEALTH_INIT_SCRIPT);

  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  } catch {
    // Clipboard permissions are optional; paste falls back to sequential typing.
  }
}
