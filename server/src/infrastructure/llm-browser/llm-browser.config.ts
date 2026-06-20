import type { LlmTextProvider, LlmProviderConfig } from './llm-browser.types.js';

export const LLM_PROVIDER_CONFIGS: Record<LlmTextProvider, LlmProviderConfig> = {
  gpt: {
    id: 'gpt',
    url: 'https://chatgpt.com',
    selectors: {
      promptInput: '#prompt-textarea, div#prompt-textarea, [contenteditable="true"][id="prompt-textarea"]',
      sendButton: 'button[data-testid="send-button"], button[aria-label="Send prompt"]',
      responseBlocks: 'div[data-message-author-role="assistant"]',
      responseCodeBlocks: 'div[data-message-author-role="assistant"] pre code',
      generatingIndicator: '[data-testid="stop-button"], button[aria-label="Stop streaming"]',
      conversationScrollContainer: 'main, [class*="overflow-y-auto"]',
      copyResponseButton: 'button[data-testid="copy-turn-action-button"]',
    },
    setup: {
      modeButton: 'button[data-testid="model-switcher-dropdown-button"]',
      modelButton: 'button[data-testid="model-switcher-dropdown-button"]',
    },
  },
  gemini: {
    id: 'gemini',
    url: 'https://gemini.google.com',
    selectors: {
      // Placeholder selectors — refine after testing live DOM
      promptInput: 'div.ql-editor[contenteditable="true"], rich-textarea .ql-editor, div[contenteditable="true"].textarea',
      sendButton: 'button[aria-label="Send message"], button.send-button, button[mattooltip="Send message"]',
      responseBlocks: '.model-response-text',
      responseCodeBlocks: 'code[data-test-id="code-content"]',
      generatingIndicator: 'button[aria-label="Stop"], .stop-button',
      conversationScrollContainer: 'main, .conversation-container, [class*="overflow-y-auto"]',
      copyResponseButton: 'copy-button button',
    },
    setup: {
      modeButton: 'button[aria-label*="model"], button.mode-switcher',
    },
  },
};

export function getLlmProviderConfig(provider: LlmTextProvider): LlmProviderConfig {
  return LLM_PROVIDER_CONFIGS[provider];
}
