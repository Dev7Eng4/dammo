import type { LlmTextProvider, ImageBrowserProvider, VideoBrowserProvider } from '../llm-browser/core/types.js';

export interface PromptsSettings {
  /** Text LLM for general content (JSON chats, transcript updates, What-If, playground). */
  defaultLlmProvider: LlmTextProvider;
  /** Text LLM for the script remake. */
  scriptRemakeLlmProvider: LlmTextProvider;
  /** Text LLM for scene image prompts and character design. */
  scenePromptLlmProvider: LlmTextProvider;
  /** Text LLM for video metadata. */
  metadataLlmProvider: LlmTextProvider;
  /**
   * Chrome profile chosen for each text task. Used while it has that task's LLM ticked in LLM Content;
   * null (or not ticked) = the first profile that has it. Parallel work adds other ticked profiles after it.
   */
  contentChromeProfileId: string | null;
  scriptRemakeChromeProfileId: string | null;
  scenePromptChromeProfileId: string | null;
  metadataChromeProfileId: string | null;
  /** Character reference image generation (Flow / Meta). */
  defaultReferenceImageProvider: ImageBrowserProvider;
  /** Scene slide image generation (Flow / Meta). */
  defaultSceneImageProvider: ImageBrowserProvider;
  defaultThumbnailProvider: ImageBrowserProvider;
  defaultVideoProvider: VideoBrowserProvider;
}
