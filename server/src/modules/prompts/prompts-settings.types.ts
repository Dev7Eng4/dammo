import type { LlmTextProvider, ImageBrowserProvider, VideoBrowserProvider } from '../../infrastructure/llm-browser/llm-browser.types.js';

export interface PromptsSettings {
  defaultLlmProvider: LlmTextProvider;
  /** Character reference image generation (Flow / Meta). */
  defaultReferenceImageProvider: ImageBrowserProvider;
  /** Scene slide image generation (Flow / Meta). */
  defaultSceneImageProvider: ImageBrowserProvider;
  defaultThumbnailProvider: ImageBrowserProvider;
  defaultVideoProvider: VideoBrowserProvider;
}
