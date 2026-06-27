/**
 * Meta AI DOM selectors.
 *
 * Inspect checklist (update after manual test on https://www.meta.ai/):
 * - prompt input (textarea / contenteditable)
 * - generate / send button
 * - loading / stop indicator while generating
 * - result image container
 * - result video container
 */
export const META_BASE_URL = 'https://www.meta.ai/';

export interface MetaDomSelectors {
  promptInput: string;
  generateButton: string;
  generatingIndicator: string;
  resultImages: string;
  resultVideos: string;
}

export interface MetaConfig {
  url: string;
  defaultTimeoutMs: number;
  selectors: MetaDomSelectors;
}

export const META_CONFIG: MetaConfig = {
  url: META_BASE_URL,
  defaultTimeoutMs: 300_000,
  selectors: {
    promptInput:
      'div[contenteditable="true"], textarea[placeholder*="Ask" i], textarea[placeholder*="Meta" i], [role="textbox"]',
    generateButton:
      'button[aria-label*="Send" i], button[type="submit"], button:has-text("Send"), button:has-text("Generate")',
    generatingIndicator:
      '[aria-busy="true"], button[aria-label*="Stop" i], button:has-text("Stop"), [class*="loading" i], [class*="spinner" i]',
    resultImages: 'img[src*="blob:"], img[src^="http"]:not([src*="favicon"])',
    resultVideos: 'video[src], video source[src]',
  },
};
