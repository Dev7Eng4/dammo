/**
 * Meta AI DOM selectors.
 *
 * Inspect checklist (update after manual test on https://www.meta.ai/):
 * - composer add-attachment button
 * - composer menu item checkbox (media mode)
 * - prompt input (textarea / contenteditable)
 * - composer send button (data-testid=composer-send-button)
 * - composer stop button (data-testid=composer-stop-button) while generating
 * - message item container (data-message-item)
 * - assistant message (data-testid=assistant-message)
 * - post-submit dialog (role=dialog) and close button
 * - result image container
 * - result video container
 */
export const META_BASE_URL = 'https://www.meta.ai/';
export const ASSISTANT_MESSAGE_TIMEOUT_MS = 180_000;
export const DIALOG_APPEAR_TIMEOUT_MS = 3_000;

export interface MetaDomSelectors {
  composerAddAttachmentButton: string;
  composerAttachmentDropzone: string;
  composerMenuItemCheckbox: string;
  promptInput: string;
  composerSendButton: string;
  composerStopButton: string;
  generateButton: string;
  generatingIndicator: string;
  messageItem: string;
  assistantMessage: string;
  dialog: string;
  dialogCloseButton: string;
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
    composerAddAttachmentButton: 'button[data-testid="composer-add-attachment-button"]',
    composerAttachmentDropzone: 'button[data-testid="composer-attachment-dropzone"]',
    composerMenuItemCheckbox: 'div[role="menuitemcheckbox"]',
    promptInput:
      'div[contenteditable="true"], textarea[placeholder*="Ask" i], textarea[placeholder*="Meta" i], [role="textbox"]',
    composerSendButton: 'button[data-testid="composer-send-button"]',
    composerStopButton: 'button[data-testid="composer-stop-button"]',
    generateButton:
      'button[data-testid="composer-send-button"], button[aria-label*="Send" i], button[type="submit"], button:has-text("Send"), button:has-text("Generate")',
    generatingIndicator:
      'button[data-testid="composer-stop-button"], [aria-busy="true"], button[aria-label*="Stop" i], button:has-text("Stop"), [class*="loading" i], [class*="spinner" i]',
    messageItem: 'div[data-message-item="true"]',
    assistantMessage: 'div[data-testid="assistant-message"]',
    dialog: 'div[role="dialog"]',
    dialogCloseButton: 'button[data-slot="dialog-close"]',
    resultImages: 'img[src*="blob:"], img[src^="http"]:not([src*="favicon"])',
    resultVideos: 'video[src], video source[src]',
  },
};
