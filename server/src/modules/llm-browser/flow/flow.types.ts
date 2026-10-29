import type { ImageBrowserProvider, LlmSendPromptOptions } from '../core/types.js';

export type FlowGenerationMode = 'browser' | 'api';

export interface FlowGenerateImageOptions {
  projectId?: string;
  outputPath?: string;
  outputDir?: string;
  fileName?: string;
  debugScreenshotPath?: string;
  timeoutMs?: number;
  stableMs?: number;
  /** Local reference images (uploaded/attached in order). */
  referenceImagePaths?: string[];
  /** Default: 'browser'. Use 'api' for direct Flow API calls. */
  generationMode?: FlowGenerationMode;
}

export interface FlowToolVisual {
  name: string;
  prompt: string;
  /** Optional reference image URLs / ids for the custom Flow tool. */
  references?: string[];
}

export interface FlowGenerateImagesViaToolOptions {
  projectId?: string;
  toolId?: string;
  outputDir: string;
  timeoutMs?: number;
  debugScreenshotPath?: string;
  /** Called after each image is downloaded and saved to disk. */
  onImageSaved?: (saved: { name: string; outputPath: string }) => void | Promise<void>;
}

export interface FlowImageToVideoJob {
  /** Output basename; the clip is saved as `${name}.mp4`. */
  name: string;
  /** Local start-frame image. */
  imagePath: string;
  /** Motion prompt. */
  prompt: string;
}

export interface FlowGenerateVideosOptions {
  projectId?: string;
  outputDir: string;
  /** Max wait for the whole batch to render (ms). */
  timeoutMs?: number;
  onVideoSaved?: (saved: { name: string; outputPath: string }) => void | Promise<void>;
}

export interface FlowGenerateVideosResult {
  savedNames: string[];
  /** Jobs Flow rejected or failed (policy filter, render error). Not retried on another profile. */
  failed: { name: string; reason: string }[];
}

/** @deprecated Use FlowGenerateImageOptions */
export type LlmGenerateImageOptions = FlowGenerateImageOptions & {
  provider?: ImageBrowserProvider;
};
