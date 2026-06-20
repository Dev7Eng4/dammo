/**
 * Google Flow DOM selectors.
 *
 * Inspect checklist (update after manual test on https://labs.google/fx/tools/flow):
 * - prompt input (textarea / contenteditable)
 * - generate / create button
 * - loading / stop indicator while generating
 * - result image container
 * - download button on generated asset
 * - image mode tab (Nano Banana / Image, not Video)
 */
export interface FlowDomSelectors {
  promptInput: string;
  generateButton: string;
  generatingIndicator: string;
  resultImages: string;
  downloadButton: string;
  imageModeTab: string;
}

export interface FlowConfig {
  url: string;
  defaultTimeoutMs: number;
  selectors: FlowDomSelectors;
}

export const FLOW_CONFIG: FlowConfig = {
  url: 'https://labs.google/fx/tools/flow',
  defaultTimeoutMs: 300_000,
  selectors: {
    promptInput:
      'textarea, div[contenteditable="true"], [contenteditable="true"][role="textbox"], input[placeholder*="prompt" i]',
    generateButton:
      'button:has-text("Generate"), button:has-text("Create"), button[aria-label*="Generate" i], button[type="submit"]',
    generatingIndicator:
      '[aria-busy="true"], button:has-text("Stop"), button[aria-label*="Stop" i], [class*="loading" i], [class*="spinner" i]',
    resultImages: 'img[src*="blob:"], img[src*="googleusercontent"], img[src*="ggpht"], main img, [class*="result" i] img',
    downloadButton: 'button:has-text("Download"), button[aria-label*="Download" i], a[download]',
    imageModeTab: 'button:has-text("Image"), [role="tab"]:has-text("Image"), button:has-text("Nano")',
  },
};
