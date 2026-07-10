import { env } from '../../config/env.js';

/**
 * Google Flow DOM selectors.
 *
 * Inspect checklist (update after manual test on https://labs.google/fx/tools/flow):
 * - prompt input (textarea / contenteditable)
 * - generate / create button
 * - loading / stop indicator while generating
 * - result image container
 * - download button on generated asset
 * - New project button on project list
 * - initial project setup (config button XPath + option buttons scoped to popover)
 */
export const FLOW_BASE_URL = 'https://labs.google/fx/tools/flow';

export const FLOW_AISANDBOX_BASE = 'https://aisandbox-pa.googleapis.com/v1';

export const FLOW_UPLOAD_IMAGE_PATH = 'flow/uploadImage';

export const FLOW_SESSION_URL = 'https://labs.google/fx/api/auth/session';

export const DEFAULT_FLOW_PROJECT_ID = '5d5f6b2b-377f-4b30-b595-d44ffe12a02f';

/** Delay after access token before reCAPTCHA (ms). */
export const FLOW_API_DELAY_AFTER_ACCESS_TOKEN_MS = 1_000;

/** Max attempts when fetching Flow access token via API mode. */
export const FLOW_API_ACCESS_TOKEN_MAX_ATTEMPTS = 3;

/** Delay between access token retry attempts (ms). */
export const FLOW_API_ACCESS_TOKEN_RETRY_DELAY_MS = 1_200;

/** Max attempts when generating images via Flow API (callers). */
export const FLOW_MAX_RETRIES = 3;

/** Base delay between retry attempts (ms). Scales with attempt number. */
export const FLOW_RETRY_BASE_DELAY_MS = 2_000;

/** Extra delay when HTTP 429 rate-limited (ms). Scales with attempt number. */
export const FLOW_RETRY_RATE_LIMIT_DELAY_MS = 10_000;

/** reCAPTCHA Enterprise — set FLOW_RECAPTCHA_SITE_KEY in .env (inspect DevTools on Flow page). */
export const FLOW_RECAPTCHA_SITE_KEY = env.flowRecaptchaSiteKey;
export const FLOW_RECAPTCHA_ACTION = env.flowRecaptchaAction;

export function buildUploadImageUrl(): string {
  return `${FLOW_AISANDBOX_BASE}/${FLOW_UPLOAD_IMAGE_PATH}`;
}

/** Headers mimicking browser requests to aisandbox-pa.googleapis.com. */
export const FLOW_API_REQUEST_HEADERS: Record<string, string> = {
  accept: '*/*',
  'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
  'content-type': 'text/plain;charset=UTF-8',
  origin: 'https://labs.google',
  priority: 'u=1, i',
  referer: 'https://labs.google/',
  'sec-ch-ua': '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'cross-site',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'x-browser-channel': 'stable',
  'x-browser-copyright': 'Copyright 2026 Google LLC. All Rights Reserved.',
  'x-browser-validation': 'zyMeDuba02HE8LHzcfWdkJ+F6HE=',
  'x-browser-year': '2026',
  'x-client-data': 'CKmdygEIlqHLAQiFoM0B',
};

export function buildFlowProjectUrl(projectId: string): string {
  return `${FLOW_BASE_URL}/project/${projectId}`;
}

export function buildBatchGenerateImagesUrl(projectId: string): string {
  return `${FLOW_AISANDBOX_BASE}/projects/${projectId}/flowMedia:batchGenerateImages`;
}

export interface FlowDomSelectors {
  promptInput: string;
  generateButton: string;
  generatingIndicator: string;
  resultImages: string;
  downloadButton: string;
  newProjectButton: string;
  btnConfig: string;
  /** Open config popover container — option selectors below must be scoped here, not page-wide. */
  configPopover: string;
  configPopoverFallback: string;
  modelSubmenuFallback: string;
  btnOptionImage: string;
  btnOptionImageTrigger: string;
  btnOptionImageFallback: string;
  btnOptionRatio: string;
  btnOptionQuantity: string;
  btnOptionModel: string;
  btnOptionModelFallback: string;
  btnOptionModelPro: string;
  btnOptionModelProFallback: string;
  referenceImageAddButton: string;
  referenceImageInput: string;
  addToPromptButton: string;
  btnAttach: string;
  btnUploadMedia: string;
}

export interface FlowConfig {
  url: string;
  defaultTimeoutMs: number;
  selectors: FlowDomSelectors;
}

export const FLOW_CONFIG: FlowConfig = {
  url: FLOW_BASE_URL,
  defaultTimeoutMs: 300_000,
  selectors: {
    promptInput: 'div[role="textbox"]',
    generateButton: 'button:has-text("Generate"), button:has-text("Create"), button[aria-label*="Generate" i], button[type="submit"]',
    generatingIndicator:
      '[aria-busy="true"], button:has-text("Stop"), button[aria-label*="Stop" i], [class*="loading" i], [class*="spinner" i]',
    resultImages: 'img[src*="blob:"], img[src*="googleusercontent"], img[src*="ggpht"], main img, [class*="result" i] img',
    downloadButton: 'button:has-text("Download"), button[aria-label*="Download" i], a[download]',
    newProjectButton: 'button:has-text("New project")',
    btnConfig: '/html/body/div[1]/div[1]/div[5]/div/div/div/div/div[2]/div[2]/button[1]',
    configPopover: '[data-state="open"][role="dialog"], [data-radix-popper-content-wrapper]:has([data-state="open"])',
    configPopoverFallback: '/html/body/div[3]',
    modelSubmenuFallback: '/html/body/div[4]',
    btnOptionImage: 'Image',
    btnOptionImageTrigger: '/html/body/div[3]/div/div[1]/div/button[1]',
    btnOptionImageFallback: '/html/body/div[4]/div/div[1]/div/button[1]',
    btnOptionRatio: '16:9',
    btnOptionQuantity: '1x',
    btnOptionModel: 'button[aria-haspopup="menu"]',
    btnOptionModelFallback: '/html/body/div[3]/div/button',
    btnOptionModelPro: 'Nano Banana Pro',
    btnOptionModelProFallback: '/html/body/div[4]/div/div[1]/div/button',
    referenceImageAddButton:
      'button[aria-label*="Upload" i], button[aria-label*="Add" i], button:has-text("Upload"), button:has-text("Add image")',
    referenceImageInput: 'input[type="file"]',
    addToPromptButton: 'button:has-text("Add to Prompt")',
    btnAttach: '/html/body/div[1]/div[1]/div[5]/div/div/div/div/div[2]/div[1]/div/button[1]',
    btnUploadMedia: 'button:has-text("Upload media")',
  },
};

/** Ordered setup click sequence (first visit per project only). */
export const FLOW_INITIAL_SETUP_SELECTORS: readonly (keyof Pick<
  FlowDomSelectors,
  'btnConfig' | 'btnOptionImage' | 'btnOptionRatio' | 'btnOptionQuantity' | 'btnOptionModel' | 'btnOptionModelPro'
>)[] = ['btnConfig', 'btnOptionImage', 'btnOptionRatio', 'btnOptionQuantity', 'btnOptionModel', 'btnOptionModelPro'];
