import { env } from '../../config/env.js';

/**
 * Google Flow DOM selectors.
 *
 * Inspect checklist (update after manual test on https://flow.google.com):
 * - prompt input (textarea / contenteditable)
 * - generate / create button
 * - loading / stop indicator while generating
 * - result image container
 * - download button on generated asset
 * - New project button on project list (or onboarding "Create with Google Flow" first)
 * - initial project setup (config button XPath + option buttons scoped to popover)
 */
export const FLOW_BASE_URL = 'https://flow.google.com';

export const FLOW_AISANDBOX_BASE = 'https://aisandbox-pa.googleapis.com/v1';

export const FLOW_UPLOAD_IMAGE_PATH = 'flow/uploadImage';

export const FLOW_SESSION_URL = 'https://labs.google/fx/api/auth/session';

export const FLOW_TRPC_BASE_URL = 'https://labs.google/fx/api/trpc';

export const FLOW_PROJECT_INITIAL_DATA_PATH = 'flow.projectInitialData';

/** Rotate Flow project after this many successful generate calls per Chrome profile. */
export const FLOW_PROJECT_MAX_USAGE_COUNT = 70;

/** Fixed tool id for the "mavid editor" custom Flow tool (project id is dynamic). */
export const MAVID_EDITOR_TOOL_ID = 'c28faaec-2222-4172-b2d6-29b8293642ba';

/** Idle window with no in-flight batchGenerateImages before tool batch is considered done. */
export const FLOW_TOOL_IDLE_MS = 5_000;

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
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'x-browser-channel': 'stable',
  'x-browser-copyright': 'Copyright 2026 Google LLC. All Rights Reserved.',
  'x-browser-validation': 'zyMeDuba02HE8LHzcfWdkJ+F6HE=',
  'x-browser-year': '2026',
  'x-client-data': 'CKmdygEIlqHLAQiFoM0B',
};

export function buildFlowProjectUrl(projectId: string): string {
  return `${FLOW_BASE_URL}/project/${projectId}`;
}

export function buildFlowProjectInitialDataUrl(projectId: string): string {
  const input = encodeURIComponent(JSON.stringify({ json: { projectId } }));
  return `${FLOW_TRPC_BASE_URL}/${FLOW_PROJECT_INITIAL_DATA_PATH}?input=${input}`;
}

export function buildFlowToolUrl(projectId: string, toolId: string = MAVID_EDITOR_TOOL_ID): string {
  return `${FLOW_BASE_URL}/project/${projectId}/tool/${toolId}`;
}

export function buildBatchGenerateImagesUrl(projectId: string): string {
  return `${FLOW_AISANDBOX_BASE}/projects/${projectId}/flowMedia:batchGenerateImages`;
}

/** CDN host for generated Flow images (browser network responses). */
export const FLOW_CONTENT_IMAGE_ORIGIN = 'https://flow-content.google';

export const FLOW_CONTENT_IMAGE_PATH_PREFIX = '/image/';

/** True for `https://flow-content.google/image/<id>[?...]` (query string ignored). */
export function isFlowContentImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== FLOW_CONTENT_IMAGE_ORIGIN) return false;
    if (!parsed.pathname.startsWith(FLOW_CONTENT_IMAGE_PATH_PREFIX)) return false;
    const id = parsed.pathname.slice(FLOW_CONTENT_IMAGE_PATH_PREFIX.length);
    return id.length > 0 && !id.includes('/');
  } catch {
    return false;
  }
}

export interface FlowDomSelectors {
  promptInput: string;
  /** Prompt input of the custom Flow tool page (`#david-input-prompts`). */
  mavidEditorPrompt: string;
  generateButton: string;
  generatingIndicator: string;
  resultImages: string;
  downloadButton: string;
  newProjectButton: string;
  createWithGoogleFlowButton: string;
  /** Post-create / onboarding dialog (`role=dialog`). */
  dialog: string;
  btnConfig: string;
  /** Open config popover container — option selectors below must be scoped here, not page-wide. */
  configPopover: string;
  /** Model picker panel opened from config popover. */
  modelPickerPanel: string;
  btnOptionImage: string;
  btnOptionRatio: string;
  btnOptionQuantity: string;
  btnOptionModel: string;
  btnOptionModelPro: string;
  btnOptionModelProFallback: string;
  referenceImageAddButton: string;
  referenceImageInput: string;
  addToPromptButton: string;
  btnAttach: string;
  /** Attach button after the first reference image is already in the prompt. */
  btnAttachSecond: string;
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
    promptInput: '.prompt-input [contenteditable="true"], .prompt-input',
    mavidEditorPrompt: 'textarea#david-input-prompts',
    generateButton: 'button:has-text("Generate"), button:has-text("Create"), button[aria-label*="Generate" i], button[type="submit"]',
    generatingIndicator:
      '[aria-busy="true"], button:has-text("Stop"), button[aria-label*="Stop" i], [class*="loading" i], [class*="spinner" i]',
    resultImages: 'img[src*="blob:"], img[src*="googleusercontent"], img[src*="ggpht"], main img, [class*="result" i] img',
    downloadButton: 'button:has-text("Download"), button[aria-label*="Download" i], a[download]',
    newProjectButton: 'button:has-text("New project")',
    createWithGoogleFlowButton: 'button:has-text("Create with Google Flow")',
    dialog: 'div[role="dialog"]',
    btnConfig: '.settings-trigger-button',
    configPopover: '.settings-content-overlay',
    modelPickerPanel: '.flow-model-picker-panel',
    btnOptionImage: 'Image',
    btnOptionRatio: '16:9',
    btnOptionQuantity: 'x1',
    btnOptionModel: '.flow-button-medium',
    btnOptionModelPro: 'Nano Banana Pro',
    btnOptionModelProFallback: '/html/body/div[4]/div/div[1]/div/button',
    referenceImageAddButton:
      'button[aria-label*="Upload" i], button[aria-label*="Add" i], button:has-text("Upload"), button:has-text("Add image")',
    referenceImageInput: 'input[type="file"]',
    addToPromptButton: 'button:has-text("Add to Prompt")',
    btnAttach: '/html/body/div[1]/div[1]/div[5]/div/div/div/div/div[2]/div[1]/div/button[1]',
    btnAttachSecond: '/html/body/div[1]/div[1]/div[5]/div/div/div/div/div[3]/div[1]/div/button[1]',
    btnUploadMedia: 'button:has-text("Upload media")',
  },
};

/** Ordered setup click sequence (first visit per project only). */
export const FLOW_INITIAL_SETUP_SELECTORS: readonly (keyof Pick<
  FlowDomSelectors,
  'btnConfig' | 'btnOptionImage' | 'btnOptionRatio' | 'btnOptionQuantity' | 'btnOptionModel' | 'btnOptionModelPro'
>)[] = ['btnConfig', 'btnOptionImage', 'btnOptionRatio', 'btnOptionQuantity', 'btnOptionModel', 'btnOptionModelPro'];
