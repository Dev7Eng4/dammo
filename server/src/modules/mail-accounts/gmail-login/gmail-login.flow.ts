import type { BrowserContext, Locator, Page } from 'playwright';
import { AppError } from '../../../shared/http/errors.js';
import { randomDelay } from '../../../infrastructure/browser/human-interaction.js';
import { enterTotpPin, fetchTotpToken } from './gmail-2fa.js';
import { humanPaste } from './gmail-paste.js';
import { openGoogleSignInTab } from './gmail-login-tabs.js';
import { GMAIL_LOGIN } from './gmail-selectors.js';

export interface GmailLoginCredentials {
  email: string;
  /** Omit to stop after the email is entered. */
  password?: string;
  /** 2FA secret; when set, a TOTP token is fetched from 2fa.live after the password. */
  twoFactorAuth?: string;
}

const STEP_TIMEOUT_MS = 45_000;
const SUCCESS_TIMEOUT_MS = 60_000;

function log(msg: string): void {
  console.log(`[gmail-login] ${msg}`);
}

async function readInputValue(locator: Locator): Promise<string> {
  return locator.inputValue().catch(() => '');
}

function valueMatches(actual: string, expected: string): boolean {
  return actual.trim() === expected.trim() || actual.trim().includes(expected.trim());
}

/** Snapshot of input state for debugging — never includes the actual typed secret. */
async function describeInput(locator: Locator, expectedLen: number): Promise<string> {
  try {
    const info = await locator.evaluate((el) => {
      if (!(el instanceof HTMLInputElement)) {
        return { tag: (el as HTMLElement).tagName, kind: 'non-input' };
      }
      return {
        tag: el.tagName,
        id: el.id || '',
        name: el.name || '',
        type: el.type || '',
        readonly: el.readOnly,
        disabled: el.disabled,
        valueLen: el.value.length,
        active: document.activeElement === el,
      };
    });
    const valueLen = await readInputValue(locator).then((v) => v.length).catch(() => -1);
    const visible = await locator.isVisible().catch(() => false);
    const editable = await locator.isEditable().catch(() => false);
    return (
      `id=${(info as { id?: string }).id ?? '?'} ` +
      `name=${(info as { name?: string }).name ?? '?'} ` +
      `type=${(info as { type?: string }).type ?? '?'} ` +
      `readonly=${String((info as { readonly?: boolean }).readonly)} ` +
      `disabled=${String((info as { disabled?: boolean }).disabled)} ` +
      `active=${String((info as { active?: boolean }).active)} ` +
      `visible=${visible} editable=${editable} ` +
      `valueLen=${valueLen} expectedLen=${expectedLen}`
    );
  } catch (err) {
    return `describe-failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Google React controlled inputs ignore plain .fill() / el.value=.
 * Strategy: pressSequentially → insertText → React native value setter.
 */
async function fillGoogleInput(
  page: Page,
  locator: Locator,
  text: string,
  label: 'email' | 'password',
): Promise<void> {
  log(`fill ${label}: start expectedLen=${text.length} url=${page.url()}`);
  await locator.waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
  log(`fill ${label}: visible — ${await describeInput(locator, text.length)}`);

  await locator.click({ timeout: 15_000, force: true });
  await randomDelay(400, 800);
  await locator.focus().catch(() => undefined);
  log(`fill ${label}: after focus — ${await describeInput(locator, text.length)}`);

  // --- strategy 0: human paste (clipboard + Ctrl+V) ---
  log(`fill ${label}: try humanPaste…`);
  try {
    await humanPaste(page, locator, text);
  } catch (err) {
    log(`fill ${label}: humanPaste threw — ${err instanceof Error ? err.message : String(err)}`);
  }
  if (valueMatches(await readInputValue(locator), text)) {
    log(`${label} filled via humanPaste`);
    return;
  }
  // Clear whatever a partial paste left before the typing fallbacks.
  await locator.fill('').catch(() => undefined);

  // --- strategy 1: pressSequentially ---
  log(`fill ${label}: try pressSequentially…`);
  try {
    await locator.pressSequentially(text, { delay: 60 });
    log(`fill ${label}: pressSequentially done — ${await describeInput(locator, text.length)}`);
  } catch (err) {
    log(
      `fill ${label}: pressSequentially threw — ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  {
    const after = await readInputValue(locator);
    log(`fill ${label}: after pressSequentially valueLen=${after.length} match=${valueMatches(after, text)}`);
    if (valueMatches(after, text)) {
      log(`${label} filled via pressSequentially`);
      return;
    }
  }

  // --- strategy 2: insertText ---
  log(`fill ${label}: try insertText…`);
  await locator.click({ timeout: 15_000, force: true }).catch((err) => {
    log(`fill ${label}: re-click failed — ${err instanceof Error ? err.message : String(err)}`);
  });
  await locator.focus().catch(() => undefined);
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+A`).catch(() => undefined);
  await page.keyboard.press('Backspace').catch(() => undefined);
  try {
    await page.keyboard.insertText(text);
    log(`fill ${label}: insertText done — ${await describeInput(locator, text.length)}`);
  } catch (err) {
    log(`fill ${label}: insertText threw — ${err instanceof Error ? err.message : String(err)}`);
  }
  {
    const after = await readInputValue(locator);
    log(`fill ${label}: after insertText valueLen=${after.length} match=${valueMatches(after, text)}`);
    if (valueMatches(after, text)) {
      log(`${label} filled via insertText`);
      return;
    }
  }

  // --- strategy 3: React native setter ---
  log(`fill ${label}: try nativeSetter…`);
  const ok = await locator.evaluate((el, value) => {
    if (!(el instanceof HTMLInputElement)) return false;
    el.removeAttribute('readonly');
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }),
    );
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value === value;
  }, text);
  log(
    `fill ${label}: nativeSetter evaluateReturned=${ok} — ${await describeInput(locator, text.length)}`,
  );

  if (ok && valueMatches(await readInputValue(locator), text)) {
    log(`${label} filled via nativeSetter`);
    return;
  }

  log(`fill ${label}: ALL strategies failed — ${await describeInput(locator, text.length)}`);
  throw new AppError(
    `Could not fill Google sign-in ${label} input`,
    502,
    'GMAIL_LOGIN_UI_TIMEOUT',
  );
}

function isStillOnSignIn(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes('accounts.google.com') &&
      (parsed.pathname.includes('/signin') || parsed.pathname.includes('/v3/signin'))
    );
  } catch {
    return true;
  }
}

function looksLikeChallenge(url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    return (
      path.includes('challenge') ||
      path.includes('rejected') ||
      path.includes('speedbump') ||
      path.includes('verification')
    );
  } catch {
    return false;
  }
}

async function waitForLoginSuccess(page: Page, ignoreChallenge = false): Promise<void> {
  log(`waitForLoginSuccess: start url=${page.url()}`);
  const deadline = Date.now() + SUCCESS_TIMEOUT_MS;
  let ticks = 0;

  while (Date.now() < deadline) {
    const url = page.url();
    ticks += 1;
    if (ticks === 1 || ticks % 5 === 0) {
      log(`waitForLoginSuccess: tick=${ticks} url=${url}`);
    }

    if (!ignoreChallenge && looksLikeChallenge(url)) {
      log(`waitForLoginSuccess: challenge detected url=${url}`);
      throw new AppError(
        'Google requested an extra challenge (2FA/captcha) — not supported in phase 1',
        422,
        'GMAIL_CHALLENGE_UNSUPPORTED',
      );
    }

    if (!isStillOnSignIn(url)) {
      for (const selector of GMAIL_LOGIN.inboxSignals) {
        if (await page.locator(selector).first().isVisible().catch(() => false)) {
          log(`waitForLoginSuccess: inbox signal ${selector} url=${url}`);
          return;
        }
      }
      if (url.includes('mail.google.com') || url.includes('myaccount.google.com')) {
        log(`waitForLoginSuccess: left sign-in to ${url}`);
        return;
      }
      log(`waitForLoginSuccess: left sign-in (generic) url=${url}`);
      return;
    }

    await randomDelay(400, 700);
  }

  log(`waitForLoginSuccess: TIMEOUT url=${page.url()}`);
  throw new AppError(
    'Gmail login did not complete within the timeout',
    502,
    'GMAIL_LOGIN_FAILED',
  );
}

/**
 * Drive Gmail → Google sign-in: email → Next → password → Next.
 * Expects a fresh GPM page; returns the active sign-in page after success.
 */
export async function runGmailLogin(
  starterPage: Page,
  context: BrowserContext,
  creds: GmailLoginCredentials,
): Promise<Page> {
  const email = creds.email.trim();
  const password = creds.password;
  if (!email) {
    throw new AppError('Email is required', 400, 'MISSING_EMAIL');
  }

  log(
    `runGmailLogin: start emailLen=${email.length} passwordLen=${password?.length ?? 0} pages=${context.pages().length}`,
  );

  log(`goto ${GMAIL_LOGIN.startUrl}`);
  await starterPage.goto(GMAIL_LOGIN.startUrl, {
    waitUntil: 'load',
    timeout: 60_000,
  });
  log(`gmail landing page loaded url=${starterPage.url()}`);
  await randomDelay(1_200, 2_000);

  const page = await openGoogleSignInTab(starterPage, context);
  log(`sign-in page ready url=${page.url()} pages=${context.pages().length}`);

  const emailInput = page
    .locator(GMAIL_LOGIN.emailInputPrimary)
    .or(page.locator(GMAIL_LOGIN.emailInput))
    .first();
  await fillGoogleInput(page, emailInput, email, 'email');
  if (!password) {
    log('runGmailLogin: email entered, no password supplied — stopping before Next');
    return page;
  }
  await randomDelay(1_000, 1_800);
  log('press Enter after email');
  await page.keyboard.press('Enter');
  await randomDelay(2_500, 3_500);

  const passwordInput = page.locator(GMAIL_LOGIN.passwordInput).first();
  log(`waiting for password field… url=${page.url()}`);
  try {
    await passwordInput.waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS });
    log(`password field visible — ${await describeInput(passwordInput, password.length)}`);
  } catch {
    const url = page.url();
    log(`password field NOT visible url=${url}`);
    if (looksLikeChallenge(url)) {
      throw new AppError(
        'Google requested an extra challenge before password — not supported in phase 1',
        422,
        'GMAIL_CHALLENGE_UNSUPPORTED',
      );
    }
    throw new AppError(
      'Password field did not appear after email Next',
      502,
      'GMAIL_LOGIN_UI_TIMEOUT',
    );
  }

  await randomDelay(800, 1_500);
  await fillGoogleInput(page, passwordInput, password, 'password');
  await randomDelay(1_200, 2_000);
  log('press Enter after password');
  await page.keyboard.press('Enter');

  const twoFactorSecret = creds.twoFactorAuth?.trim();
  if (twoFactorSecret) {
    log('2FA configured — fetching token from 2fa.live');
    await randomDelay(2_500, 3_500);
    const token = await fetchTotpToken(context, twoFactorSecret);
    await enterTotpPin(page, token);
  }

  await waitForLoginSuccess(page, Boolean(twoFactorSecret));
  log(`runGmailLogin: done url=${page.url()}`);
  return page;
}
