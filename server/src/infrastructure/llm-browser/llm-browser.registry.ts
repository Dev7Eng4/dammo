import type { LlmBrowserProvider, LlmTextProvider } from './llm-browser.types.js';
import type { LlmBrowserProviderHandler } from './llm-browser.provider.js';
import { createFlowProviderHandler } from './providers/flow-llm.provider.js';
import { createLlmProviderHandler } from './providers/configurable-llm.provider.js';

const textHandlers: Record<LlmTextProvider, LlmBrowserProviderHandler> = {
  gpt: createLlmProviderHandler('gpt'),
  gemini: createLlmProviderHandler('gemini'),
};

let flowHandler: LlmBrowserProviderHandler | undefined;

export function getLlmTextBrowserHandler(provider: LlmTextProvider): LlmBrowserProviderHandler {
  return textHandlers[provider];
}

export function getFlowBrowserHandler(): LlmBrowserProviderHandler {
  if (!flowHandler) {
    flowHandler = createFlowProviderHandler();
  }
  return flowHandler;
}

export function isLlmTextProvider(value: string): value is LlmTextProvider {
  return value === 'gpt' || value === 'gemini';
}

export function isLlmBrowserProvider(value: string): value is LlmBrowserProvider {
  return isLlmTextProvider(value) || value === 'flow';
}
