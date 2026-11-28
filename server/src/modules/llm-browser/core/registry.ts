import type { ImageBrowserProvider, LlmBrowserProvider, LlmTextProvider } from './types.js';
import type { LlmBrowserProviderHandler } from './provider.interface.js';
import { createFlowProviderHandler } from '../flow/flow.provider.js';
import { createMetaProviderHandler } from '../meta/meta.provider.js';
import { createMuseProviderHandler } from '../muse/muse.provider.js';
import { createLlmProviderHandler } from '../text/text.provider.js';

const textHandlers: Record<LlmTextProvider, LlmBrowserProviderHandler> = {
  gpt: createLlmProviderHandler('gpt'),
  gemini: createLlmProviderHandler('gemini'),
  claude: createLlmProviderHandler('claude'),
};

let flowHandler: LlmBrowserProviderHandler | undefined;
let metaHandler: LlmBrowserProviderHandler | undefined;
let museHandler: LlmBrowserProviderHandler | undefined;

export function getLlmTextBrowserHandler(provider: LlmTextProvider): LlmBrowserProviderHandler {
  return textHandlers[provider];
}

export function getFlowBrowserHandler(): LlmBrowserProviderHandler {
  if (!flowHandler) {
    flowHandler = createFlowProviderHandler();
  }
  return flowHandler;
}

export function getMetaBrowserHandler(): LlmBrowserProviderHandler {
  if (!metaHandler) {
    metaHandler = createMetaProviderHandler();
  }
  return metaHandler;
}

export function getMuseBrowserHandler(): LlmBrowserProviderHandler {
  if (!museHandler) {
    museHandler = createMuseProviderHandler();
  }
  return museHandler;
}

export function getImageBrowserHandler(provider: ImageBrowserProvider): LlmBrowserProviderHandler {
  if (provider === 'meta') return getMetaBrowserHandler();
  if (provider === 'muse') return getMuseBrowserHandler();
  return getFlowBrowserHandler();
}

export function isLlmTextProvider(value: string): value is LlmTextProvider {
  return value === 'gpt' || value === 'gemini' || value === 'claude';
}

export function isImageBrowserProvider(value: string): value is ImageBrowserProvider {
  return value === 'flow' || value === 'meta' || value === 'muse';
}

export function isLlmBrowserProvider(value: string): value is LlmBrowserProvider {
  return isLlmTextProvider(value) || isImageBrowserProvider(value) || value === 'muse';
}
