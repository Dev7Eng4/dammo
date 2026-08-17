import type { LlmTextProvider, ImageBrowserProvider, VideoBrowserProvider } from '../../infrastructure/llm-browser/llm-browser.types.js';

export interface PromptsSettings {
  defaultLlmProvider: LlmTextProvider;
  defaultImageProvider: ImageBrowserProvider;
  defaultThumbnailProvider: ImageBrowserProvider;
  defaultVideoProvider: VideoBrowserProvider;
}
