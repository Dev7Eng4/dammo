import type { LlmTextProvider, ImageBrowserProvider, VideoBrowserProvider } from '../llm-browser/core/types.js';

export interface PromptsSettings {
  defaultLlmProvider: LlmTextProvider;
  /** Character reference image generation (Flow / Meta). */
  defaultReferenceImageProvider: ImageBrowserProvider;
  /** Scene slide image generation (Flow / Meta). */
  defaultSceneImageProvider: ImageBrowserProvider;
  defaultThumbnailProvider: ImageBrowserProvider;
  defaultVideoProvider: VideoBrowserProvider;
}
