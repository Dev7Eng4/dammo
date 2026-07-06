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

export const DEFAULT_FLOW_PROJECT_ID = '5d5f6b2b-377f-4b30-b595-d44ffe12a02f';

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
  },
};

/** Ordered setup click sequence (first visit per project only). */
export const FLOW_INITIAL_SETUP_SELECTORS: readonly (keyof Pick<
  FlowDomSelectors,
  'btnConfig' | 'btnOptionImage' | 'btnOptionRatio' | 'btnOptionQuantity' | 'btnOptionModel' | 'btnOptionModelPro'
>)[] = ['btnConfig', 'btnOptionImage', 'btnOptionRatio', 'btnOptionQuantity', 'btnOptionModel', 'btnOptionModelPro'];
