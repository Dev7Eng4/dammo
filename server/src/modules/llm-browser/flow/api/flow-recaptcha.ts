import type { Page } from 'playwright';

export interface ExecuteEnterpriseRecaptchaOptions {
  siteKey: string;
  action: string;
  timeoutMs?: number;
  log?: boolean;
}

export interface ExecuteEnterpriseRecaptchaResult {
  ok: boolean;
  token?: string;
  error?: string;
}

interface RecaptchaPayload {
  key: string;
  act: string;
  timeout: number;
}

/**
 * Browser-side reCAPTCHA script as plain string — avoids tsx/esbuild injecting __name
 * into page.evaluate callbacks (ReferenceError in browser context).
 */
const RECAPTCHA_BROWSER_SCRIPT = `async (payload) => {
  const { key, act, timeout } = payload;
  const deadline = Date.now() + timeout;

  await new Promise((resolve, reject) => {
    const poll = () => {
      const enterprise = window.grecaptcha?.enterprise;
      if (typeof enterprise?.ready === 'function' && typeof enterprise?.execute === 'function') {
        resolve(undefined);
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('grecaptcha.enterprise not loaded'));
        return;
      }
      setTimeout(poll, 200);
    };
    poll();
  });

  return new Promise((resolve, reject) => {
    window.grecaptcha.enterprise.ready(() => {
      window.grecaptcha.enterprise
        .execute(key, { action: act })
        .then(resolve)
        .catch((err) => reject(err instanceof Error ? err : new Error(String(err))));
    });
  });
}`;

const recaptchaPageFunction = new Function(
  `return (${RECAPTCHA_BROWSER_SCRIPT})`,
)() as (payload: RecaptchaPayload) => Promise<string>;

export async function executeEnterpriseRecaptchaOnPage(
  page: Page,
  options: ExecuteEnterpriseRecaptchaOptions,
): Promise<ExecuteEnterpriseRecaptchaResult> {
  const { siteKey, action, timeoutMs = 60_000, log = false } = options;

  if (!siteKey.trim()) {
    return { ok: false, error: 'FLOW_RECAPTCHA_SITE_KEY is not configured' };
  }

  if (log) {
    console.log(`[flow-recaptcha] executing action=${action}`);
  }

  try {
    const token = await page.evaluate(recaptchaPageFunction, {
      key: siteKey,
      act: action,
      timeout: timeoutMs,
    });

    if (!token) {
      return { ok: false, error: `Empty reCAPTCHA token for action ${action}` };
    }

    if (log) {
      console.log(`[flow-recaptcha] token obtained (${token.slice(0, 20)}...)`);
    }

    return { ok: true, token };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message || `Failed to get reCAPTCHA token for action ${action}` };
  }
}
