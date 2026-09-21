import type { BrowserContext, Locator, Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { randomDelay } from '../../../infrastructure/llm-browser/human-interaction.js';
import { GMAIL_LOGIN } from './gmail-selectors.js';

const POPUP_TIMEOUT_MS = 30_000;
const IDENTIFIER_TIMEOUT_MS = 45_000;
const SIGNIN_URL_TIMEOUT_MS = 45_000;

function log(msg: string): void {
  console.log(`[gmail-login] ${msg}`);
}

function emailLocator(page: Page): Locator {
  // Prefer #identifierId — Google often marks it readonly until focused.
  return page.locator(GMAIL_LOGIN.emailInputPrimary).or(page.locator(GMAIL_LOGIN.emailInput)).first();
}

async function dismissAccountChooserIfPresent(page: Page): Promise<void> {
  const useAnother = page
    .getByRole('link', { name: GMAIL_LOGIN.useAnotherAccountName })
    .or(page.getByRole('button', { name: GMAIL_LOGIN.useAnotherAccountName }))
    .first();

  const visible = await useAnother.isVisible().catch(() => false);
  if (!visible) {
    log('accountchooser: not present');
    return;
  }

  log('accountchooser: detected — clicking Use another account');
  await useAnother.click({ timeout: 15_000, force: true });
  await randomDelay(300, 700);
  log(`accountchooser: after click url=${page.url()}`);
}

async function waitForSignInUrl(page: Page): Promise<void> {
  log(`waitForSignInUrl: current=${page.url()}`);
  try {
    await page.waitForURL(
      url => {
        try {
          const parsed = typeof url === 'string' ? new URL(url) : url;
          return (
            parsed.hostname.includes('accounts.google.com') &&
            (parsed.pathname.includes('/signin') || parsed.pathname.includes('/v3/signin'))
          );
        } catch {
          return false;
        }
      },
      { timeout: SIGNIN_URL_TIMEOUT_MS },
    );
    log(`waitForSignInUrl: ok url=${page.url()}`);
  } catch {
    log(`waitForSignInUrl: FAILED url=${page.url()}`);
    throw new AppError(
      'Sign-in tab did not navigate to accounts.google.com sign-in',
      502,
      'GMAIL_LOGIN_UI_TIMEOUT',
    );
  }
}

/**
 * Click Gmail "Sign in", wait for the accounts.google.com tab,
 * close the starter tab, and focus the sign-in page until email input is visible.
 *
 * Note: do NOT wait for isEditable — Google keeps #identifierId readonly until focused.
 */
export async function openGoogleSignInTab(
  starterPage: Page,
  context: BrowserContext,
): Promise<Page> {
  log(`openGoogleSignInTab: start url=${starterPage.url()} pages=${context.pages().length}`);

  const signIn = starterPage.locator(GMAIL_LOGIN.signIn).first();
  await signIn.waitFor({ state: 'visible', timeout: 45_000 });
  log('openGoogleSignInTab: Sign in button visible — clicking');

  const nextPagePromise = context.waitForEvent('page', { timeout: POPUP_TIMEOUT_MS }).catch(() => null);
  await signIn.click({ timeout: 15_000 });
  log('openGoogleSignInTab: Sign in clicked, waiting for popup…');

  const popup = await nextPagePromise;
  let signInPage: Page;

  if (popup) {
    signInPage = popup;
    log(`openGoogleSignInTab: popup opened url=${signInPage.url()}`);
    await signInPage.waitForLoadState('domcontentloaded').catch(() => undefined);
    try {
      await starterPage.close();
      log('openGoogleSignInTab: starter tab closed');
    } catch (err) {
      log(
        `openGoogleSignInTab: starter close skipped — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    log('openGoogleSignInTab: No popup — using same tab after Sign in');
    signInPage = starterPage;
  }

  await signInPage.bringToFront();
  log(`openGoogleSignInTab: bringToFront url=${signInPage.url()} pages=${context.pages().length}`);

  await waitForSignInUrl(signInPage);
  await dismissAccountChooserIfPresent(signInPage);

  const emailInput = emailLocator(signInPage);
  try {
    await emailInput.waitFor({ state: 'visible', timeout: IDENTIFIER_TIMEOUT_MS });
    const meta = await emailInput
      .evaluate((el) => {
        if (!(el instanceof HTMLInputElement)) return 'non-input';
        return `id=${el.id} name=${el.name} type=${el.type} readonly=${el.readOnly} disabled=${el.disabled}`;
      })
      .catch(() => 'meta-failed');
    log(`openGoogleSignInTab: email field visible — ${meta}`);
  } catch {
    log(`openGoogleSignInTab: email field NOT found url=${signInPage.url()}`);
    throw new AppError(
      'Google sign-in page did not show the email field (#identifierId)',
      502,
      'GMAIL_LOGIN_UI_TIMEOUT',
    );
  }

  await emailInput.click({ timeout: 15_000, force: true }).catch((err) => {
    log(
      `openGoogleSignInTab: pre-focus click failed — ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  await randomDelay(200, 500);

  log(`sign-in tab ready url=${signInPage.url()}`);
  return signInPage;
}
