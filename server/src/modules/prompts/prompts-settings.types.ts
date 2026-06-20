import type { LlmTextProvider, ImageBrowserProvider } from '../../infrastructure/llm-browser/llm-browser.types.js';

export interface PromptsSettings {
  defaultLlmProvider: LlmTextProvider;
  defaultImageProvider: ImageBrowserProvider;
}
