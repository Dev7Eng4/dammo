import type { LlmBrowserProvider } from '../../infrastructure/llm-browser/llm-browser.types.js';

export interface PromptsSettings {
  defaultLlmProvider: LlmBrowserProvider;
}
