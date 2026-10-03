/** Selectors for Gmail / Google account sign-in (Playwright + GPM). */
export const GMAIL_LOGIN = {
  startUrl: 'https://workspace.google.com/intl/en/gmail/',
  signIn: 'a[data-g-action="sign in"]:visible',
  /** Prefer classic id; fallbacks for newer variants. */
  emailInputPrimary: '#identifierId',
  emailInput: '#identifierId, input[name="identifier"], input[type="email"]',
  passwordInput: 'input[name="Passwd"]',
  totpInput: 'input[name="totpPin"]',
  /** Escape accountchooser before the email field appears. */
  useAnotherAccountName: /another account|dùng tài khoản khác|アカウントを使用/i,
  /** Post-login / inbox signals (any one is enough). */
  inboxSignals: [
    'div[role="main"]',
    'a[aria-label^="Google Account"]',
    '#gb',
  ],
} as const;

/** 2fa.live — converts a 2FA secret into a TOTP token. */
export const TWO_FA_LIVE = {
  origin: 'https://2fa.live',
  url: 'https://2fa.live/',
  input: '#listToken',
  submit: '#submit',
  copy: '#copy_btn',
} as const;
