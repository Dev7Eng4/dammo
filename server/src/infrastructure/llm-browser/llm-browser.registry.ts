import type { LlmBrowserProvider } from './llm-browser.types.js';
import type { LlmBrowserProviderHandler } from './llm-browser.provider.js';
import { createLlmProviderHandler } from './providers/configurable-llm.provider.js';

const handlers: Record<LlmBrowserProvider, LlmBrowserProviderHandler> = {
  gpt: createLlmProviderHandler('gpt'),
  gemini: createLlmProviderHandler('gemini'),
};

export function getLlmBrowserHandler(provider: LlmBrowserProvider): LlmBrowserProviderHandler {
  return handlers[provider];
}

export function isLlmBrowserProvider(value: string): value is LlmBrowserProvider {
  return value === 'gpt' || value === 'gemini';
}
