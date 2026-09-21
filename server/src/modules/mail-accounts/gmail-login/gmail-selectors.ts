/** Selectors for Gmail / Google account sign-in (Playwright + GPM). */
export const GMAIL_LOGIN = {
  startUrl: 'https://gmail.com/',
  signIn: '[data-g-action="sign in"]',
  /** Prefer classic id; fallbacks for newer variants. */
  emailInputPrimary: '#identifierId',
  emailInput: '#identifierId, input[name="identifier"], input[type="email"]',
  passwordInput: 'input[type="password"]',
  /** Escape accountchooser before the email field appears. */
  useAnotherAccountName: /another account|dùng tài khoản khác|アカウントを使用/i,
  /** Role name matched case-insensitively (EN "Next", etc.). */
  nextButtonName: /next/i,
  /** Post-login / inbox signals (any one is enough). */
  inboxSignals: [
    'div[role="main"]',
    'a[aria-label^="Google Account"]',
    '#gb',
  ],
} as const;
