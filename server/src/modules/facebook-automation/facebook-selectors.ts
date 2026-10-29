/**
 * Selectors for the Facebook automation flows (Playwright + GPM).
 *
 * Facebook ships obfuscated, frequently rotated class names, so nothing here
 * relies on classes. Each entry is a list of fallbacks tried in order (first
 * visible wins) built from stable attributes: ids, aria-label, role, and text
 * in both English and Vietnamese UI languages.
 *
 * VERIFIED against the logged-out /pages/create page: pageNameInput ids,
 * category combobox, Continue button. Everything else is based on the
 * logged-in UI and must be re-checked in a real logged-in profile before
 * relying on it — use `probeFacebookSelectors` (facebook-probe.ts).
 */
export type SelectorList = readonly string[];

export const FACEBOOK_URL = {
  home: 'https://www.facebook.com/',
  createPage: 'https://www.facebook.com/pages/create',
  createReel: 'https://www.facebook.com/reels/create',
} as const;

export const FACEBOOK_SELECTOR = {
  // --- Login ---------------------------------------------------------------
  loginEmailInput: ['input[name="email"]'],
  loginPasswordInput: ['input[name="pass"]'],

  // --- Signup --------------------------------------------------------------
  signupEmailInput: ['input[name="reg_email__"]'],
  signupPasswordInput: ['input[name="reg_passwd__"]'],
  signupBirthdayDayInput: ['input[name="reg_dmy__day"]'],
  signupBirthdayMonthInput: ['input[name="reg_dmy__month"]'],
  signupBirthdayYearInput: ['input[name="reg_dmy__year"]'],
  signupGenderInput: ['input[name="reg_gender"]'],
  signupSubmitButton: ['button[name="websubmit"]'],

  // --- Create page ---------------------------------------------------------
  pageNameInput: [
    '#BUSINESS_SUPERCATEGORYPageNameInput',
    '#NON_BUSINESS_SUPERCATEGORYPageNameInput',
    'input[aria-label="Page name (required)"]',
    'input[aria-label="Tên Trang (bắt buộc)"]',
    'label:has-text("Page name") input',
  ],
  pageCategoryInput: [
    'input[role="combobox"][aria-label^="Category"]',
    'input[role="combobox"][aria-label^="Hạng mục"]',
    'input[role="combobox"]',
  ],
  pageCategoryOption: ['[role="listbox"] [role="option"]', 'ul[role="listbox"] li'],
  pageBioInput: [
    'textarea[aria-label^="Bio"]',
    'textarea[aria-label^="Tiểu sử"]',
    'label:has-text("Bio") textarea',
    'div[role="textbox"][aria-label^="Bio"]',
  ],
  createPageButton: [
    'div[aria-label="Create Page"][role="button"]',
    'div[aria-label="Tạo Trang"][role="button"]',
    'button:has-text("Create Page")',
    'button:has-text("Continue")',
  ],
  /** Present once the page exists and Facebook shows the page-setup wizard. */
  pageCreatedMarker: ['a[href*="/profile.php?id="]', 'div[aria-label="Switch Now"][role="button"]', 'div[role="main"] h1'],

  // --- Switch acting identity to the page (needed to post/upload as page) ---
  switchNowButton: [
    'div[aria-label="Switch now"][role="button"]',
    'div[aria-label="Switch Now"][role="button"]',
    'div[aria-label="Chuyển ngay"][role="button"]',
  ],

  // --- Text / photo post ----------------------------------------------------
  composerOpen: [
    'div[role="button"]:has-text("What\'s on your mind")',
    'div[role="button"]:has-text("Bạn đang nghĩ gì")',
    'div[role="button"]:has-text("Create post")',
  ],
  composerDialog: ['div[role="dialog"]'],
  composerTextbox: [
    'div[role="dialog"] div[role="textbox"][contenteditable="true"]',
    'div[role="dialog"] div[contenteditable="true"][aria-label*="mind"]',
  ],
  composerPhotoVideoInput: ['div[role="dialog"] input[type="file"][accept*="image"]', 'div[role="dialog"] input[type="file"]'],
  composerPostButton: [
    'div[role="dialog"] div[aria-label="Post"][role="button"]',
    'div[role="dialog"] div[aria-label="Đăng"][role="button"]',
  ],

  // --- Reel / video upload --------------------------------------------------
  reelFileInput: ['input[type="file"][accept*="video"]', 'input[type="file"]'],
  reelNextButton: ['div[aria-label="Next"][role="button"]', 'div[aria-label="Tiếp"][role="button"]', 'div[role="button"]:has-text("Next")'],
  reelDescriptionTextbox: [
    'div[role="textbox"][contenteditable="true"][aria-label*="escription"]',
    'div[role="textbox"][contenteditable="true"][aria-label*="Mô tả"]',
    'div[role="textbox"][contenteditable="true"]',
  ],
  reelPublishButton: [
    'div[aria-label="Publish"][role="button"]',
    'div[aria-label="Đăng"][role="button"]',
    'div[role="button"]:has-text("Publish")',
  ],
  /** Dismissible popups Facebook may show mid-flow. */
  dismissButtons: [
    'div[aria-label="Not now"][role="button"]',
    'div[aria-label="Not Now"][role="button"]',
    'div[aria-label="Close"][role="button"]',
    'div[aria-label="Đóng"][role="button"]',
  ],
} as const satisfies Record<string, SelectorList>;

export type FacebookSelectorKey = keyof typeof FACEBOOK_SELECTOR;
