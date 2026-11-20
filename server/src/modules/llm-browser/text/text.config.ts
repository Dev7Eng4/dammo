import type { LlmTextProvider, LlmProviderConfig } from '../core/types.js';

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
      fileInput: 'input[type="file"]',
      attachmentPreview: 'form [data-testid*="attachment"], form img[alt]:not([alt=""])',
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
      // Gemini adds its file input only after opening the upload menu, so files are dropped onto the prompt.
      attachmentPreview: 'uploader-file-preview, .file-preview-container img',
    },
    setup: {
      modeButton: 'button[aria-label*="model"], button.mode-switcher',
    },
  },
  claude: {
    id: 'claude',
    // Every session starts a fresh chat; prompts within a session continue that chat.
    url: 'https://claude.ai/new',
    // Long chats keep only the latest few messages on the page, so counting replies stops working.
    markSeenReplies: true,
    // "Out of messages" banners. Not the "You've used 90% of your weekly limit" warning, which still lets you send.
    usageLimitPattern:
      /out of (free )?messages|message limit reached|usage limit reached|(hit|reached) (your|the) (\w+ )?limit|limit reached/i,
    selectors: {
      // Composer is a ProseMirror editor; Enter sends.
      promptInput:
        'div.ProseMirror[contenteditable="true"], [data-testid="chat-input"][contenteditable="true"], fieldset div[contenteditable="true"]',
      sendButton: 'button[aria-label="Send message"], button[aria-label="Send Message"], button[data-testid="send-button"]',
      // Each assistant reply: data-testid="assistant-message", data-is-streaming="true" while it is being written.
      responseBlocks: 'div[data-testid="assistant-message"], div[data-is-streaming]',
      // The markdown body only: skips the screen-reader "Claude responded: …" heading and the Copy / Retry / time toolbar.
      responseContent: '.standard-markdown, .font-claude-response',
      // Inside code blocks: the language label ("python") and the copy button.
      responseContentExclude: '[role="group"][aria-label$="code"] > div:not(:has(pre)), .sr-only, button',
      responseCodeBlocks: 'pre code',
      generatingIndicator: 'div[data-is-streaming="true"], button[aria-label="Stop response"], button[aria-label="Stop Response"]',
      conversationScrollContainer: 'main, [class*="overflow-y-auto"]',
      copyResponseButton: '[data-testid="message-actions"] button[aria-label="Copy"]',
      fileInput: 'input[type="file"]',
      attachmentPreview: '[data-testid="file-thumbnail"], [data-testid*="attachment"]',
    },
  },
};

export function getLlmProviderConfig(provider: LlmTextProvider): LlmProviderConfig {
  return LLM_PROVIDER_CONFIGS[provider];
}
